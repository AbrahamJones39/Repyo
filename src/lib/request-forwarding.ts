import { db } from "@/lib/db";
import {
  GENERIC_NOTIFICATION,
  logRoutingEvent,
  safeStatusNote,
} from "@/lib/security/audit";
import { applyTeamDefaultsOnAssignment } from "@/lib/teams/calendar-visibility";
import { getRepTeamIds } from "@/lib/teams/authorization";
import { findEligibleReps, realtimeBus, type RoutingCriteria } from "@/lib/routing-engine";
import { REP_STATUS_LABELS } from "@/lib/utils";
import type { Prisma, RequestStatus, Role } from "@prisma/client";

/** Rep may forward while the case is still pending or after accepting but before going en route. */
export const FORWARDABLE_REQUEST_STATUSES: RequestStatus[] = [
  "REQUESTING",
  "ACCEPTED",
];

export type ForwardAuthorizationCheck = {
  passed: boolean;
  targetUserId: string;
  targetRole: Role;
  sameCompany: boolean;
  credentialActive: boolean;
  accountActive: boolean;
  eligibleForRequest: boolean;
  forwardEnabled: boolean;
  teamScopeOk: boolean;
  checkedAt: string;
  reason?: string;
};

export type ForwardTarget = {
  id: string;
  name: string;
  type: "rep" | "manager";
  territoryLabel: string;
  statusLabel: string;
  onCall: boolean;
  teamNames: string[];
  teamId?: string;
};

export type ForwardTeamGroup = {
  id: string;
  name: string;
  members: ForwardTarget[];
};

async function getTerritoryLabel(userId: string): Promise<string> {
  const coverage = await db.repSiteCoverage.findFirst({
    where: { repUserId: userId },
    include: { site: { select: { city: true, name: true } } },
  });
  if (coverage?.site.city) return coverage.site.city;
  if (coverage?.site.name) return coverage.site.name;

  const territory = await db.territory.findFirst({
    where: { repProfileId: userId },
    select: { state: true, zipCode: true },
  });
  if (territory?.state) return territory.state;
  if (territory?.zipCode) return `Zip ${territory.zipCode}`;
  return "Unassigned";
}

export async function acknowledgeRequestOnOpen(params: {
  requestId: string;
  userId: string;
  userRole: Role;
  request: {
    assignedRepId: string | null;
    status: string;
    acknowledgedAt: Date | null;
    companyId: string;
  };
}): Promise<Date | null> {
  const { requestId, userId, userRole, request } = params;

  const awaitingAcknowledgment =
    request.assignedRepId === userId &&
    !request.acknowledgedAt &&
    (request.status === "REQUESTING" || request.status === "ACCEPTED");

  if (userRole !== "REP" || !awaitingAcknowledgment) {
    return null;
  }

  const now = new Date();

  await db.serviceRequest.update({
    where: { id: requestId },
    data: {
      acknowledgedAt: now,
      acknowledgedById: userId,
      alertActive: false,
    },
  });

  const unread = await db.notification.findMany({
    where: {
      userId,
      read: false,
      type: "REQUEST_ASSIGNED",
    },
  });
  const toMark = unread.filter((n) => {
    const data = n.data as { requestId?: string } | null;
    return data?.requestId === requestId;
  });
  if (toMark.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: toMark.map((n) => n.id) } },
      data: { read: true },
    });
  }

  await db.requestForward.updateMany({
    where: {
      requestId,
      forwardedToId: userId,
      newRepAcknowledgedAt: null,
    },
    data: { newRepAcknowledgedAt: now },
  });

  await logRoutingEvent({
    requestId,
    eventType: "REP_ACKNOWLEDGED",
    actorId: userId,
    actorRole: userRole,
    companyId: request.companyId,
  });

  const [requestRecord, latestForward] = await Promise.all([
    db.serviceRequest.findUnique({
      where: { id: requestId },
      select: { assignedAdminId: true },
    }),
    db.requestForward.findFirst({
      where: { requestId, forwardedToId: userId },
      orderBy: { forwardTimestamp: "desc" },
      select: { forwardedById: true },
    }),
  ]);

  const notifyUserIds = new Set<string>();
  if (requestRecord?.assignedAdminId && requestRecord.assignedAdminId !== userId) {
    notifyUserIds.add(requestRecord.assignedAdminId);
  }
  if (
    latestForward?.forwardedById &&
    latestForward.forwardedById !== userId
  ) {
    notifyUserIds.add(latestForward.forwardedById);
  }

  for (const notifyUserId of notifyUserIds) {
    await db.notification.create({
      data: {
        userId: notifyUserId,
        title: GENERIC_NOTIFICATION.repAcknowledged.title,
        body: GENERIC_NOTIFICATION.repAcknowledged.body,
        type: "REP_ACKNOWLEDGED",
        data: {
          requestId,
          repId: userId,
          acknowledgedAt: now.toISOString(),
        },
      },
    });
    realtimeBus.emit(`user:${notifyUserId}`, {
      type: "REP_ACKNOWLEDGED",
      requestId,
    });
  }

  realtimeBus.emit("request:updated", { requestId });
  realtimeBus.emit(`user:${userId}`, { type: "REQUEST_ACKNOWLEDGED", requestId });

  return now;
}

async function buildAuthorizationCheck(
  request: {
    id: string;
    companyId: string;
    product: string | null;
    facilityLat: number | null;
    facilityLng: number | null;
    facilityZipCode: string | null;
    healthcareSiteId: string | null;
    scheduledAt: Date;
  },
  company: {
    forwardEnabled: boolean;
    forwardTeamMembersOnly: boolean;
  },
  targetUser: {
    id: string;
    role: Role;
    companyId: string | null;
    accountState: string;
    repProfile: {
      credentialStatus: string;
    } | null;
  },
  forwardedById: string,
  teamScopeOk: boolean
): Promise<ForwardAuthorizationCheck> {
  const criteria: RoutingCriteria = {
    companyId: request.companyId,
    facilityName: "",
    healthcareSiteId: request.healthcareSiteId,
    facilityLat: request.facilityLat,
    facilityLng: request.facilityLng,
    facilityZip: request.facilityZipCode,
    product: request.product,
    scheduledAt: request.scheduledAt,
  };

  const eligible = await findEligibleReps(criteria);
  const eligibleForRequest = eligible.some((r) => r.userId === targetUser.id);

  const sameCompany = targetUser.companyId === request.companyId;
  const credentialActive = targetUser.repProfile?.credentialStatus === "ACTIVE";
  const accountActive = ["REGISTERED", "VERIFIED"].includes(targetUser.accountState);
  const isManager = targetUser.role === "COMPANY_ADMIN";

  const passed =
    company.forwardEnabled &&
    targetUser.id !== forwardedById &&
    sameCompany &&
    accountActive &&
    teamScopeOk &&
    (isManager || (targetUser.role === "REP" && credentialActive && eligibleForRequest));

  return {
    passed,
    targetUserId: targetUser.id,
    targetRole: targetUser.role,
    sameCompany,
    credentialActive,
    accountActive,
    eligibleForRequest: isManager ? true : eligibleForRequest,
    forwardEnabled: company.forwardEnabled,
    teamScopeOk,
    checkedAt: new Date().toISOString(),
    reason: passed
      ? undefined
      : !company.forwardEnabled
        ? "Forwarding disabled for this company"
        : !sameCompany
          ? "Target must belong to the same device company"
          : !teamScopeOk
            ? "Target is outside allowed team scope"
            : !credentialActive
              ? "Target rep is not credentialed"
              : !eligibleForRequest
                ? "Target rep is not eligible for this request"
                : "Authorization check failed",
  };
}

export async function getForwardTargets(
  requestId: string,
  forwardedById: string
): Promise<{
  reps: ForwardTarget[];
  teams: ForwardTeamGroup[];
  managers: ForwardTarget[];
}> {
  const request = await db.serviceRequest.findUnique({
    where: { id: requestId },
    include: {
      company: {
        select: {
          forwardEnabled: true,
          forwardTeamMembersOnly: true,
          forwardAllowManagers: true,
        },
      },
    },
  });

  if (!request?.company.forwardEnabled) {
    return { reps: [], teams: [], managers: [] };
  }

  const senderTeamIds = await getRepTeamIds(forwardedById);
  const teamMemberships = await db.companyTeamMember.findMany({
    where: { userId: forwardedById },
    include: {
      team: {
        include: {
          members: {
            include: {
              user: {
                include: {
                  repProfile: {
                    select: {
                      status: true,
                      onCallEnabled: true,
                      credentialStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const teamMemberIds = new Set<string>();
  for (const membership of teamMemberships) {
    for (const member of membership.team.members) {
      if (member.userId !== forwardedById) {
        teamMemberIds.add(member.userId);
      }
    }
  }

  const reps = await db.user.findMany({
    where: {
      companyId: request.companyId,
      role: "REP",
      id: { not: forwardedById },
      accountState: { in: ["REGISTERED", "VERIFIED"] },
      repProfile: { credentialStatus: "ACTIVE" },
    },
    include: {
      repProfile: {
        select: { status: true, onCallEnabled: true, credentialStatus: true },
      },
      teamMemberships: {
        include: { team: { select: { id: true, name: true } } },
      },
    },
  });

  const criteria: RoutingCriteria = {
    companyId: request.companyId,
    facilityName: request.facilityName,
    healthcareSiteId: request.healthcareSiteId,
    facilityLat: request.facilityLat,
    facilityLng: request.facilityLng,
    facilityZip: request.facilityZipCode,
    product: request.product,
    scheduledAt: request.scheduledAt,
  };
  const eligible = await findEligibleReps(criteria);
  const eligibleIds = new Set(eligible.map((r) => r.userId));

  async function toTarget(
    user: {
      id: string;
      name: string;
      role: Role;
      repProfile: {
        status: string;
        onCallEnabled: boolean;
      } | null;
    },
    teamNames: string[] = []
  ): Promise<ForwardTarget> {
    const territoryLabel = await getTerritoryLabel(user.id);
    const status = user.repProfile?.status ?? "OFF_DUTY";
    return {
      id: user.id,
      name: user.name,
      type: user.role === "COMPANY_ADMIN" ? "manager" : "rep",
      territoryLabel,
      statusLabel:
        user.repProfile?.onCallEnabled && status === "AVAILABLE"
          ? "On Call"
          : REP_STATUS_LABELS[status] ?? status,
      onCall: Boolean(user.repProfile?.onCallEnabled),
      teamNames,
    };
  }

  const repTargets: ForwardTarget[] = [];
  for (const rep of reps) {
    if (!eligibleIds.has(rep.id)) continue;
    if (request.company.forwardTeamMembersOnly && !teamMemberIds.has(rep.id)) {
      continue;
    }
    repTargets.push(
      await toTarget(
        rep,
        rep.teamMemberships.map((m) => m.team.name)
      )
    );
  }

  repTargets.sort((a, b) => a.name.localeCompare(b.name));

  const teams: ForwardTeamGroup[] = [];
  for (const membership of teamMemberships) {
    const members: ForwardTarget[] = [];
    for (const member of membership.team.members) {
      if (member.userId === forwardedById) continue;
      if (!eligibleIds.has(member.userId)) continue;
      if (request.company.forwardTeamMembersOnly && !senderTeamIds.includes(membership.teamId)) {
        continue;
      }
      members.push(await toTarget(member.user, [membership.team.name]));
    }
    if (members.length > 0) {
      teams.push({
        id: membership.team.id,
        name: membership.team.name,
        members,
      });
    }
  }

  const managers: ForwardTarget[] = [];
  if (request.company.forwardAllowManagers) {
    const adminUsers = await db.user.findMany({
      where: {
        companyId: request.companyId,
        role: "COMPANY_ADMIN",
        accountState: { in: ["REGISTERED", "VERIFIED"] },
        id: { not: forwardedById },
      },
      include: {
        teamMemberships: { include: { team: { select: { name: true } } } },
      },
    });
    for (const admin of adminUsers) {
      managers.push(
        await toTarget(
          { ...admin, repProfile: null },
          admin.teamMemberships.map((m) => m.team.name)
        )
      );
    }
  }

  return { reps: repTargets, teams, managers };
}

export async function forwardRequest(params: {
  requestId: string;
  forwardedById: string;
  forwardedToId: string;
  reason?: string;
  targetTeamId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.serviceRequest.findUnique({
    where: { id: params.requestId },
    include: {
      company: {
        select: {
          forwardEnabled: true,
          forwardTeamMembersOnly: true,
          forwardAllowManagers: true,
        },
      },
    },
  });

  if (!request) return { ok: false, error: "Request not found" };
  if (!FORWARDABLE_REQUEST_STATUSES.includes(request.status)) {
    return { ok: false, error: "This request can no longer be forwarded" };
  }
  if (request.assignedRepId !== params.forwardedById) {
    return { ok: false, error: "Only the assigned rep can forward this request" };
  }
  if (!request.company.forwardEnabled) {
    return { ok: false, error: "Forwarding is disabled for this company" };
  }
  if (request.status === "REQUESTING" && !request.acknowledgedAt) {
    return { ok: false, error: "Open the request before forwarding" };
  }

  const revertingFromAccepted = request.status === "ACCEPTED";
  const resetAfterForward = revertingFromAccepted
    ? {
        status: "REQUESTING" as const,
        repLat: null,
        repLng: null,
        etaMinutes: null,
      }
    : {};

  const targetUser = await db.user.findUnique({
    where: { id: params.forwardedToId },
    include: {
      repProfile: { select: { credentialStatus: true } },
    },
  });
  if (!targetUser) return { ok: false, error: "Target user not found" };

  let teamScopeOk = true;
  if (request.company.forwardTeamMembersOnly && targetUser.role === "REP") {
    const senderTeams = await getRepTeamIds(params.forwardedById);
    const targetTeams = await getRepTeamIds(params.forwardedToId);
    teamScopeOk = targetTeams.some((id) => senderTeams.includes(id));
  }

  const authCheck = await buildAuthorizationCheck(
    request,
    request.company,
    targetUser,
    params.forwardedById,
    teamScopeOk
  );

  if (!authCheck.passed) {
    return { ok: false, error: authCheck.reason ?? "Target is not authorized" };
  }

  const originalRepId = request.originalRepId ?? request.assignedRepId!;
  const forwardToManager = targetUser.role === "COMPANY_ADMIN";

  await db.$transaction(async (tx) => {
    await tx.requestForward.create({
      data: {
        requestId: params.requestId,
        originalRepId,
        forwardedById: params.forwardedById,
        forwardedToId: params.forwardedToId,
        forwardReason: params.reason ? safeStatusNote(params.reason) : null,
        authorizationCheck: authCheck as unknown as Prisma.InputJsonValue,
        targetTeamId: params.targetTeamId ?? null,
      },
    });

    if (forwardToManager) {
      await tx.serviceRequest.update({
        where: { id: params.requestId },
        data: {
          assignedRepId: null,
          assignedAdminId: params.forwardedToId,
          originalRepId,
          acknowledgedAt: null,
          acknowledgedById: null,
          alertActive: false,
          ...resetAfterForward,
        },
      });

      await tx.notification.create({
        data: {
          userId: params.forwardedToId,
          title: "Request forwarded to you",
          body: "A rep forwarded a pending request for manager dispatch.",
          type: "REQUEST_FORWARDED",
          data: { requestId: params.requestId, alertActive: true },
        },
      });
    } else {
      await tx.serviceRequest.update({
        where: { id: params.requestId },
        data: {
          assignedRepId: params.forwardedToId,
          originalRepId,
          acknowledgedAt: null,
          acknowledgedById: null,
          alertActive: true,
          teamId: params.targetTeamId ?? request.teamId,
          ...resetAfterForward,
        },
      });

      await tx.notification.create({
        data: {
          userId: params.forwardedToId,
          title: GENERIC_NOTIFICATION.assigned.title,
          body: GENERIC_NOTIFICATION.assigned.body,
          type: "REQUEST_ASSIGNED",
          data: { requestId: params.requestId, forwarded: true, alertActive: true },
        },
      });
    }

    if (request.assignedAdminId && request.assignedAdminId !== params.forwardedToId) {
      await tx.notification.create({
        data: {
          userId: request.assignedAdminId,
          title: "Request forwarded",
          body: "A rep forwarded a request to another verified colleague.",
          type: "REQUEST_FORWARDED",
          data: { requestId: params.requestId },
        },
      });
    }

    if (revertingFromAccepted) {
      await tx.requestStatusLog.create({
        data: {
          requestId: params.requestId,
          status: "REQUESTING",
          note: safeStatusNote("Forwarded after acceptance — reassigned to colleague"),
        },
      });
    }
  });

  if (!forwardToManager) {
    await applyTeamDefaultsOnAssignment(params.requestId, params.forwardedToId);
  }

  await logRoutingEvent({
    requestId: params.requestId,
    eventType: "REP_FORWARDED",
    actorId: params.forwardedById,
    actorRole: "REP",
    companyId: request.companyId,
    targetUserId: params.forwardedToId,
    metadata: {
      originalRepId,
      forwardReason: params.reason ?? null,
      authorizationCheck: authCheck,
      targetTeamId: params.targetTeamId ?? null,
    },
  });

  const { startCoverageAlert } = await import("@/lib/coverage-alerts");
  await startCoverageAlert(params.requestId);

  realtimeBus.emit("request:updated", { requestId: params.requestId });
  if (!forwardToManager) {
    realtimeBus.emit(`user:${params.forwardedToId}`, {
      type: "REQUEST_ASSIGNED",
      requestId: params.requestId,
    });
  } else {
    realtimeBus.emit(`user:${params.forwardedToId}`, {
      type: "REQUEST_FORWARDED",
      requestId: params.requestId,
    });
  }

  return { ok: true };
}

export async function declineRequest(params: {
  requestId: string;
  repId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const request = await db.serviceRequest.findUnique({
    where: { id: params.requestId },
  });

  if (!request) return { ok: false, error: "Request not found" };
  if (request.status !== "REQUESTING") {
    return { ok: false, error: "Only pending requests can be declined" };
  }
  const assigneeId = request.assignedRepId ?? request.assignedAdminId;
  if (assigneeId !== params.repId && request.escalatedToId !== params.repId) {
    return { ok: false, error: "Only the assigned person can decline this request" };
  }
  if (!request.acknowledgedAt) {
    return { ok: false, error: "Acknowledge the request before declining" };
  }

  await db.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: params.requestId },
      data: {
        status: "DECLINED",
        alertActive: false,
      },
    });

    await tx.requestStatusLog.create({
      data: {
        requestId: params.requestId,
        status: "DECLINED",
        note: params.reason ? safeStatusNote(params.reason) : "Declined by assigned rep",
      },
    });

    const notifyIds = [request.assignedAdminId].filter(Boolean) as string[];
    for (const userId of notifyIds) {
      await tx.notification.create({
        data: {
          userId,
          title: "Request declined",
          body: "An assigned rep declined a pending request.",
          type: "REQUEST_DECLINED",
          data: { requestId: params.requestId },
        },
      });
    }
  });

  await logRoutingEvent({
    requestId: params.requestId,
    eventType: "REP_DECLINED",
    actorId: params.repId,
    actorRole: "REP",
    companyId: request.companyId,
    metadata: { reason: params.reason ?? null },
  });

  realtimeBus.emit("request:updated", { requestId: params.requestId });

  return { ok: true };
}

export async function markForwardAccepted(requestId: string, repId: string) {
  await db.requestForward.updateMany({
    where: {
      requestId,
      forwardedToId: repId,
      newRepAcceptedAt: null,
    },
    data: { newRepAcceptedAt: new Date() },
  });
}
