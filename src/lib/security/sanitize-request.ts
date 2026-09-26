import { decryptPHI, decryptDate } from "@/lib/encryption";
import type { SessionUser } from "@/lib/security/authorization";
import {
  canViewDeviceIdentifiers,
  canViewRequestPhi,
} from "@/lib/security/authorization";
import type { RequestStatus, Role } from "@prisma/client";

type RawRequest = {
  id: string;
  providerId: string | null;
  assignedRepId: string | null;
  assignedAdminId: string | null;
  initiatedByRepId: string | null;
  companyId: string;
  status: RequestStatus;
  acknowledgedAt?: Date | null;
  alertActive?: boolean;
  facilityName: string;
  facilityAddr: string;
  facilityZipCode: string | null;
  department: string | null;
  procedureType: string | null;
  requestType: string;
  product: string | null;
  urgency: string;
  scheduledAt: Date;
  notes: string | null;
  deviceManufacturer: string | null;
  patientNameEnc: string | null;
  patientDOBEnc: string | null;
  patientRoomEnc: string | null;
  deviceNameEnc: string | null;
  deviceSerialEnc: string | null;
  crmLookupStatus: string | null;
  recordLifecycle?: string;
  [key: string]: unknown;
};

export function sanitizeRequestForUser(
  request: RawRequest,
  user: SessionUser,
  options?: { isDelegatedAdmin?: boolean; isSharedProvider?: boolean; sharedPhiAccess?: boolean }
) {
  const {
    patientNameEnc,
    patientDOBEnc,
    patientRoomEnc,
    deviceNameEnc,
    deviceSerialEnc,
    ...base
  } = request;

  const phiAllowed = canViewRequestPhi(user, request, options);
  const deviceAllowed = canViewDeviceIdentifiers(user, request, options);
  const repMustAcknowledge =
    user.role === "REP" &&
    request.assignedRepId === user.id &&
    !request.acknowledgedAt &&
    (request.status === "REQUESTING" || request.status === "ACCEPTED");

  const isPreAcceptance =
    user.role !== "PROVIDER" &&
    !request.acknowledgedAt &&
    (request.status === "REQUESTING" || repMustAcknowledge);

  const sanitized: Record<string, unknown> = {
    ...base,
    provider: safeProviderSummary(request.provider),
    shares: safeShareSummaries(request.shares),
    patientNameEnc: undefined,
    patientDOBEnc: undefined,
    patientRoomEnc: undefined,
    deviceNameEnc: undefined,
    deviceSerialEnc: undefined,
    phiRestricted: !phiAllowed,
    identifiersHidden: isPreAcceptance && user.role !== "PROVIDER",
    acknowledgedAt: request.acknowledgedAt?.toISOString?.() ?? request.acknowledgedAt ?? null,
    alertActive: request.alertActive ?? false,
  };
  for (const key of ["routingEvents", "phiAccessLogs", "forwards", "coverageEvents"]) {
    delete sanitized[key];
  }

  if (phiAllowed && !options?.isSharedProvider) {
    Object.assign(sanitized, {
      patientName: patientNameEnc ? decryptPHI(patientNameEnc) : null,
      patientDOB: patientDOBEnc
        ? decryptDate(patientDOBEnc).toISOString()
        : null,
      patientRoom: patientRoomEnc ? decryptPHI(patientRoomEnc) : null,
    });
  }

  if (deviceAllowed && !options?.isSharedProvider) {
    Object.assign(sanitized, {
      deviceName: deviceNameEnc ? decryptPHI(deviceNameEnc) : null,
      deviceSerial: deviceSerialEnc ? decryptPHI(deviceSerialEnc) : null,
    });
  } else if (isPreAcceptance) {
    Object.assign(sanitized, {
      deviceManufacturer: undefined,
      crmLookupStatus: undefined,
    });
  }

  const rawReplies = Array.isArray(request.replies) ? request.replies : [];
  const replies = rawReplies
    .filter((reply) => reply && typeof reply === "object" && "id" in reply)
    .map((reply) => {
      const item = reply as {
        id: string;
        body: string;
        createdAt: Date | string;
        author?: { id: string; name: string; role: Role };
      };
      return {
        id: item.id,
        body: item.body,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : item.createdAt,
        author: item.author ?? { id: "", name: "Unknown", role: "REP" as Role },
      };
    });

  if (options?.isSharedProvider) {
    for (const key of [
      "notes",
      "requesterName",
      "requesterPhone",
      "requesterEmail",
      "requesterFax",
      "facilityPhone",
      "facilityContactName",
      "facilityContactPhone",
      "facilityLat",
      "facilityLng",
      "repLat",
      "repLng",
      "etaMinutes",
      "salesforceRecordId",
      "salesforceCaseId",
      "patientName",
      "patientDOB",
      "patientRoom",
      "deviceName",
      "deviceSerial",
      "killSwitchReason",
    ]) {
      delete sanitized[key];
    }
    sanitized.provider = sanitized.provider && typeof sanitized.provider === "object"
      ? { id: (sanitized.provider as { id?: string }).id, name: (sanitized.provider as { name?: string }).name, phone: null }
      : sanitized.provider;
    sanitized.assignedRep = request.assignedRep && typeof request.assignedRep === "object"
      ? { id: (request.assignedRep as { id?: string }).id, name: (request.assignedRep as { name?: string }).name, phone: null }
      : null;
    sanitized.assignedAdmin = request.assignedAdmin && typeof request.assignedAdmin === "object"
      ? { id: (request.assignedAdmin as { id?: string }).id, name: (request.assignedAdmin as { name?: string }).name }
      : request.assignedAdmin ?? null;
    sanitized.initiatedByRep = request.initiatedByRep && typeof request.initiatedByRep === "object"
      ? { id: (request.initiatedByRep as { id?: string }).id, name: (request.initiatedByRep as { name?: string }).name, phone: null }
      : null;
    sanitized.statusLogs = Array.isArray(request.statusLogs)
      ? request.statusLogs.map((item) => ({
          status: (item as { status?: string }).status,
          createdAt: (item as { createdAt?: Date | string }).createdAt,
        }))
      : [];
    sanitized.replies = [];
    sanitized.phiRestricted = true;
    if (options.sharedPhiAccess) {
      Object.assign(sanitized, {
        patientName: patientNameEnc ? decryptPHI(patientNameEnc) : null,
        patientDOB: patientDOBEnc ? decryptDate(patientDOBEnc).toISOString() : null,
        patientRoom: patientRoomEnc ? decryptPHI(patientRoomEnc) : null,
        deviceName: deviceNameEnc ? decryptPHI(deviceNameEnc) : null,
        deviceSerial: deviceSerialEnc ? decryptPHI(deviceSerialEnc) : null,
        phiRestricted: false,
      });
    }
    return sanitized;
  }

  if (isPreAcceptance && user.role === "REP") {
    return {
      ...sanitized,
      notes: sanitized.notes ? "[Open request to view details]" : null,
      requesterName: undefined,
      requesterPhone: undefined,
      requesterEmail: undefined,
      requesterFax: undefined,
      physicianName: undefined,
      replies: replies.map((reply) => ({
        ...reply,
        body: "[Open request to view note]",
      })),
    };
  }

  return { ...sanitized, replies };
}

function safeProviderSummary(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const { providerInfo: _providerInfo, ...summary } = value as Record<string, unknown>;
  return summary;
}

function safeShareSummaries(value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value.flatMap((share) => {
    if (!share || typeof share !== "object") return [];
    const item = share as Record<string, unknown>;
    const rawUser = item.user;
    if (!rawUser || typeof rawUser !== "object") return [];
    const user = rawUser as Record<string, unknown>;
    const rawProfile = user.providerInfo;
    const profile = rawProfile && typeof rawProfile === "object" ? rawProfile as Record<string, unknown> : null;
    const organizationId = profile?.organizationId;
    const rawMemberships = user.providerSiteMemberships;
    const providerSiteMemberships = Array.isArray(rawMemberships)
      ? rawMemberships.flatMap((membership) => {
          if (!membership || typeof membership !== "object") return [];
          const siteMembership = membership as Record<string, unknown>;
          if (organizationId && siteMembership.organizationId !== organizationId) return [];
          const rawSite = siteMembership.site;
          return [{
            department: siteMembership.department ?? null,
            site: rawSite && typeof rawSite === "object"
              ? { name: (rawSite as Record<string, unknown>).name ?? null }
              : null,
          }];
        })
      : [];
    const rawSharedBy = item.sharedBy;
    const sharedBy = rawSharedBy && typeof rawSharedBy === "object"
      ? { id: (rawSharedBy as { id?: string }).id, name: (rawSharedBy as { name?: string }).name }
      : null;
    return [{
      id: item.id,
      reason: item.reason,
      createdAt: item.createdAt,
      requestAccess: item.requestAccess === true,
      phiAccess: item.phiAccess === true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        providerInfo: profile ? {
          jobTitle: profile.jobTitle ?? null,
          facilityName: profile.facilityName ?? null,
          department: profile.department ?? null,
        } : null,
        providerSiteMemberships,
      },
      sharedBy,
    }];
  });
}

export async function getProviderOrgContext(userId: string) {
  const { db } = await import("@/lib/db");
  const profile = await db.providerProfile.findUnique({
    where: { userId },
    select: { organizationId: true },
  });
  return profile?.organizationId ?? null;
}

export function toSessionUser(user: {
  id: string;
  role: Role;
  companyId: string | null;
  accountState?: SessionUser["accountState"];
  adminPermissions?: string[];
}): SessionUser {
  return {
    id: user.id,
    role: user.role,
    companyId: user.companyId,
    accountState: user.accountState,
    adminPermissions: user.adminPermissions,
  };
}
