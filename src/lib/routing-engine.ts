import {
  CredentialStatus,
  RepStatus,
  type RepProfile,
  type RepAvailabilityBlock,
  type RepScheduleRule,
  type Territory,
  type User,
} from "@prisma/client";
import { db } from "./db";
import {
  coversTargetSite,
  listCompanyCoveredSites,
  pickCoverageTargetSite,
} from "./facility-routing";
import {
  isRepAvailableAtTime,
  isRepLocationSharingActive,
} from "./rep-availability";
import { distanceMiles, estimateEtaMinutes } from "./utils";
import {
  GENERIC_NOTIFICATION,
  logPhiAccess,
  logRoutingEvent,
} from "./security/audit";
import { applyTeamDefaultsOnAssignment } from "./teams/calendar-visibility";

export interface RoutingCriteria {
  companyId: string;
  facilityName: string;
  healthcareSiteId?: string | null;
  facilityLat?: number | null;
  facilityLng?: number | null;
  facilityState?: string | null;
  facilityZip?: string | null;
  product?: string | null;
  preferredRepId?: string | null;
  scheduledAt?: Date | null;
}

export interface EligibleRep {
  userId: string;
  name: string;
  phone: string | null;
  distanceMiles: number;
  etaMinutes: number;
  lat: number | null;
  lng: number | null;
  locationSharing: boolean;
}

type RepWithProfile = User & {
  repProfile:
    | (RepProfile & {
        territories: Territory[];
        scheduleRules: RepScheduleRule[];
        availabilityBlocks: RepAvailabilityBlock[];
      })
    | null;
};

function repHasProduct(rep: RepWithProfile, product?: string | null): boolean {
  if (!product) return true;
  const products = rep.repProfile?.products ?? [];
  return products.length === 0 || products.includes(product);
}

export async function findEligibleReps(
  criteria: RoutingCriteria
): Promise<EligibleRep[]> {
  const scheduledAt = criteria.scheduledAt ?? new Date();

  const reps = await db.user.findMany({
    where: {
      role: "REP",
      companyId: criteria.companyId,
      repProfile: {
        status: RepStatus.AVAILABLE,
        credentialStatus: CredentialStatus.ACTIVE,
      },
    },
    include: {
      repProfile: {
        include: {
          territories: true,
          scheduleRules: true,
          availabilityBlocks: {
            where: {
              startAt: { lte: scheduledAt },
              endAt: { gt: scheduledAt },
            },
          },
        },
      },
    },
  });

  const companyCoverage = await listCompanyCoveredSites(criteria.companyId);
  const target = pickCoverageTargetSite(
    criteria.healthcareSiteId ||
      criteria.facilityLat != null ||
      criteria.facilityLng != null
      ? {
          id: criteria.healthcareSiteId ?? null,
          lat: criteria.facilityLat ?? null,
          lng: criteria.facilityLng ?? null,
        }
      : null,
    companyCoverage
  );

  const sitesByRep = new Map<string, string[]>();
  for (const row of companyCoverage) {
    if (row.role !== "REP") continue;
    const list = sitesByRep.get(row.userId) ?? [];
    list.push(row.site.id);
    sitesByRep.set(row.userId, list);
  }

  const eligible: EligibleRep[] = [];

  for (const rep of reps) {
    if (!rep.repProfile) continue;
    if (!coversTargetSite(sitesByRep.get(rep.id) ?? [], target)) continue;
    if (!repHasProduct(rep, criteria.product)) continue;

    const { scheduleRules, availabilityBlocks, status } = rep.repProfile;
    if (
      !isRepAvailableAtTime(
        scheduledAt,
        scheduleRules,
        availabilityBlocks,
        status
      )
    ) {
      continue;
    }

    const locationSharing = isRepLocationSharingActive(
      scheduledAt,
      scheduleRules,
      availabilityBlocks,
      status
    );

    const { lat, lng } = rep.repProfile;
    let dist = Infinity;

    if (
      locationSharing &&
      lat != null &&
      lng != null &&
      criteria.facilityLat != null &&
      criteria.facilityLng != null
    ) {
      dist = distanceMiles(
        lat,
        lng,
        criteria.facilityLat,
        criteria.facilityLng
      );
      if (dist > rep.repProfile.travelRadiusMiles) continue;
    }

    eligible.push({
      userId: rep.id,
      name: rep.name,
      phone: rep.phone,
      distanceMiles: locationSharing && dist !== Infinity ? dist : 0,
      etaMinutes:
        locationSharing && dist !== Infinity ? estimateEtaMinutes(dist) : 0,
      lat: locationSharing ? lat : null,
      lng: locationSharing ? lng : null,
      locationSharing,
    });
  }

  if (criteria.preferredRepId) {
    const preferred = eligible.find((r) => r.userId === criteria.preferredRepId);
    if (preferred) {
      return [preferred, ...eligible.filter((r) => r.userId !== criteria.preferredRepId)];
    }
  }

  return eligible.sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/** Assign a rep to a request (admin or delegated rep action). */
export async function assignRepToRequest(
  requestId: string,
  repId: string,
  criteria: RoutingCriteria,
  actor?: { id: string; role: import("@prisma/client").Role }
): Promise<{ assigned: boolean; repName?: string; error?: string }> {
  const existing = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: { assignedRepId: true, originalRepId: true, companyId: true },
  });

  const scheduledAt = criteria.scheduledAt ?? new Date();

  const rep = await db.user.findFirst({
    where: { id: repId, role: "REP", companyId: criteria.companyId },
    include: {
      repProfile: {
        include: {
          scheduleRules: true,
          availabilityBlocks: {
            where: {
              startAt: { lte: scheduledAt },
              endAt: { gt: scheduledAt },
            },
          },
        },
      },
    },
  });

  if (!rep?.repProfile) {
    return { assigned: false, error: "Rep not found" };
  }

  if (
    !isRepAvailableAtTime(
      scheduledAt,
      rep.repProfile.scheduleRules,
      rep.repProfile.availabilityBlocks,
      rep.repProfile.status
    )
  ) {
    return { assigned: false, error: "Rep is not available at the scheduled time" };
  }

  const locationSharing = isRepLocationSharingActive(
    scheduledAt,
    rep.repProfile.scheduleRules,
    rep.repProfile.availabilityBlocks,
    rep.repProfile.status
  );

  let etaMinutes: number | null = null;
  let repLat: number | null = locationSharing ? rep.repProfile.lat : null;
  let repLng: number | null = locationSharing ? rep.repProfile.lng : null;

  if (
    locationSharing &&
    repLat != null &&
    repLng != null &&
    criteria.facilityLat != null &&
    criteria.facilityLng != null
  ) {
    const dist = distanceMiles(
      repLat,
      repLng,
      criteria.facilityLat,
      criteria.facilityLng
    );
    etaMinutes = estimateEtaMinutes(dist);
  }

  await db.$transaction([
    db.serviceRequest.update({
      where: { id: requestId },
      data: {
        assignedRepId: repId,
        originalRepId: existing?.originalRepId ?? repId,
        etaMinutes,
        repLat,
        repLng,
        assignedAt: new Date(),
        acknowledgedAt: null,
        acknowledgedById: null,
        alertActive: true,
      },
    }),
    db.notification.create({
      data: {
        userId: repId,
        title: GENERIC_NOTIFICATION.assigned.title,
        body: GENERIC_NOTIFICATION.assigned.body,
        type: "REQUEST_ASSIGNED",
        data: { requestId, alertActive: true },
      },
    }),
  ]);

  await applyTeamDefaultsOnAssignment(requestId, repId);

  const isReassign =
    existing?.assignedRepId && existing.assignedRepId !== repId;

  await logRoutingEvent({
    requestId,
    eventType: isReassign ? "ADMIN_REASSIGNED" : "REP_AUTO_ASSIGNED",
    actorId: actor?.id,
    actorRole: actor?.role,
    companyId: existing?.companyId ?? criteria.companyId,
    targetUserId: repId,
    metadata: {
      previousRepId: existing?.assignedRepId ?? null,
    },
  });

  await logPhiAccess({
    requestId,
    userId: repId,
    userRole: "REP",
    accessType: "NOTIFICATION_SENT",
    companyId: existing?.companyId ?? criteria.companyId,
    metadata: { notificationType: "REQUEST_ASSIGNED" },
  });

  if (isReassign && existing?.assignedRepId) {
    await logRoutingEvent({
      requestId,
      eventType: "REQUEST_REROUTED",
      actorId: actor?.id,
      actorRole: actor?.role,
      companyId: existing.companyId,
      targetUserId: repId,
      metadata: { fromRepId: existing.assignedRepId, toRepId: repId },
    });
  }

  realtimeBus.emit("request:updated", { requestId });
  realtimeBus.emit(`user:${repId}`, {
    type: "REQUEST_ASSIGNED",
    requestId,
  });

  return { assigned: true, repName: rep.name };
}

/** In-process event bus for SSE. Production should use Redis pub/sub. */
type RealtimeListener = (data: unknown) => void;

class RealtimeBus {
  private channels = new Map<string, Set<RealtimeListener>>();

  subscribe(channel: string, listener: RealtimeListener): () => void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(listener);
    return () => this.channels.get(channel)?.delete(listener);
  }

  emit(channel: string, data: unknown): void {
    this.channels.get(channel)?.forEach((listener) => listener(data));
  }
}

export const realtimeBus = new RealtimeBus();
