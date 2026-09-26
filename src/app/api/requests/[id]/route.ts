import { auth } from "@/lib/auth";
import { canActAsAdminForRequest } from "@/lib/admin-matching";
import { getDelegatedAdminIdsForRep } from "@/lib/admin-matching";
import { db } from "@/lib/db";
import { assignRepToRequest, realtimeBus } from "@/lib/routing-engine";
import {
  GENERIC_NOTIFICATION,
  logPhiAccess,
  logRoutingEvent,
  safeStatusNote,
} from "@/lib/security/audit";
import { checkRequestAccessible } from "@/lib/security/kill-switch";
import { requireAuth, isAuthError } from "@/lib/security/require-auth";
import {
  getProviderOrgContext,
  sanitizeRequestForUser,
  toSessionUser,
} from "@/lib/security/sanitize-request";
import { canAccessRequestRecord, canViewRequestPhi } from "@/lib/security/authorization";
import { activeVerifiedProviderShares, isSharedWithActiveProvider, publicRequestActivity } from "@/lib/request-shares";
import { assignRepSchema, updateRequestStatusSchema, forwardRequestSchema, declineRequestSchema } from "@/lib/validations";
import {
  declineRequest,
  forwardRequest,
  markForwardAccepted,
} from "@/lib/request-forwarding";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const user = authResult.user;

  const { id } = await context.params;

  const accessible = await checkRequestAccessible(id);
  if (!accessible) {
    return NextResponse.json({ error: "Request unavailable" }, { status: 403 });
  }

  const serviceRequest = await db.serviceRequest.findUnique({
    where: { id },
    include: {
      provider: { select: { id: true, name: true, phone: true, providerInfo: { select: { organizationId: true } } } },
      assignedAdmin: { select: { id: true, name: true } },
      assignedRep: {
        select: {
          id: true,
          name: true,
          phone: true,
          repProfile: { select: { lat: true, lng: true, status: true } },
        },
      },
      company: { select: { id: true, name: true } },
      statusLogs: { orderBy: { createdAt: "asc" } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
      routingEvents: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      shares: {
        where: { revokedAt: null },
        include: {
          user: { select: { id: true, name: true, role: true, accountState: true, providerInfo: { select: { organizationId: true, accountStatus: true, jobTitle: true, facilityName: true, department: true } }, providerSiteMemberships: { select: { organizationId: true, department: true, site: { select: { name: true } } } } } },
          sharedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!serviceRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activeShares = activeVerifiedProviderShares(serviceRequest);

  const delegatedAdminIds =
    user.role === "REP" ? await getDelegatedAdminIdsForRep(user.id) : [];

  const canAccess = canAccessRequestRecord(user, serviceRequest, {
    delegatedAdminIds,
    isSharedWithUser: user.role === "PROVIDER" && serviceRequest.providerId !== user.id &&
      isSharedWithActiveProvider(activeShares, user.id),
  });
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = await getProviderOrgContext(user.id);

  const { acknowledgeCoverage } = await import("@/lib/coverage-alerts");
  const ack = await acknowledgeCoverage({
    requestId: id,
    userId: user.id,
    userRole: user.role,
  });
  const requestForSanitize = {
    ...serviceRequest,
    shares: activeShares,
    ...(ack.ok ? { acknowledgedAt: ack.acknowledgedAt, alertActive: false } : {}),
  };

  const isDelegatedAdmin =
    user.role === "REP" &&
    Boolean(
      serviceRequest.assignedAdminId &&
        delegatedAdminIds.includes(serviceRequest.assignedAdminId)
    );

  const myShare = activeShares.find((share) => share.userId === user.id && share.requestAccess);
  const isSharedProvider = user.role === "PROVIDER" && serviceRequest.providerId !== user.id && Boolean(myShare);
  const shareOptions = {
    isDelegatedAdmin,
    isSharedProvider,
    sharedPhiAccess: Boolean(myShare?.phiAccess),
  };
  const sanitized = sanitizeRequestForUser(requestForSanitize, user, shareOptions);

  if (isSharedProvider) {
    await logRoutingEvent({
      requestId: id,
      eventType: "SHARED_USER_OPENED_REQUEST",
      actorId: user.id,
      actorRole: user.role,
      organizationId: orgId,
      companyId: serviceRequest.companyId,
    });
  }

  await logPhiAccess({
    requestId: id,
    userId: user.id,
    userRole: user.role,
    accessType: "REQUEST_OPENED",
    organizationId: orgId,
    companyId: serviceRequest.companyId,
  });

  const patientVisible = Boolean(sanitized.patientName || sanitized.patientDOB);
  if (patientVisible) {
    await logPhiAccess({
      requestId: id,
      userId: user.id,
      userRole: user.role,
      accessType: "PHI_DISPLAYED",
      organizationId: orgId,
      companyId: serviceRequest.companyId,
      metadata: { fields: ["patient"] },
    });
    await logRoutingEvent({
      requestId: id,
      eventType: "PHI_VIEWED",
      actorId: user.id,
      actorRole: user.role,
      organizationId: orgId,
      companyId: serviceRequest.companyId,
    });
  }
  if (user.role === "REP" && (patientVisible || sanitized.deviceName || sanitized.deviceSerial)) {
    await logRoutingEvent({
      requestId: id,
      eventType: "REP_OPENED_REQUEST",
      actorId: user.id,
      actorRole: user.role,
      organizationId: orgId,
      companyId: serviceRequest.companyId,
    });
  }

  return NextResponse.json({
    ...sanitized,
    activity: publicRequestActivity(requestForSanitize, {
      includePhiEvents: canViewRequestPhi(user, serviceRequest, shareOptions),
    }),
    isRequestOwner: serviceRequest.providerId === user.id,
    isSharedWithMe: isSharedProvider,
    sharedWithMeBy: isSharedProvider ? myShare?.sharedBy.name ?? null : null,
    sharedWithMeReason: isSharedProvider ? myShare?.reason ?? null : null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const sessionUser = authResult.user;

  const { id } = await context.params;
  const body = await request.json();

  if (body.action === "ACKNOWLEDGE") {
    const { acknowledgeCoverage } = await import("@/lib/coverage-alerts");
    const result = await acknowledgeCoverage({
      requestId: id,
      userId: sessionUser.id,
      userRole: sessionUser.role,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ acknowledgedAt: result.acknowledgedAt });
  }

  if (body.action === "FORWARD") {
    return handleForward(sessionUser, id, body);
  }

  if (body.action === "DECLINE") {
    return handleDecline(sessionUser, id, body);
  }

  if (body.repId) {
    return handleAssignRep(sessionUser, id, body);
  }

  if (body.teamCalendarVisibility) {
    return handleCalendarVisibility(sessionUser, id, body);
  }

  const parsed = updateRequestStatusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const existing = await db.serviceRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isRep = sessionUser.role === "REP" && existing.assignedRepId === sessionUser.id;
  const isProvider =
    sessionUser.role === "PROVIDER" && existing.providerId === sessionUser.id;
  const isSuperAdmin = sessionUser.role === "SUPER_ADMIN";
  const canActAsAdmin = await canActAsAdminForRequest(
    sessionUser.id,
    sessionUser.role,
    existing.assignedAdminId
  );

  const { status, lat, lng, note } = parsed.data;

  if (status === "ACCEPTED" && existing.status === "REQUESTING") {
    if (!canActAsAdmin && !isSuperAdmin && !isRep) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((isRep || canActAsAdmin) && !existing.acknowledgedAt) {
      return NextResponse.json(
        { error: "Acknowledge the request before accepting" },
        { status: 400 }
      );
    }
  } else if (status === "CANCELLED" && isProvider) {
    // provider can cancel
  } else if (isRep) {
    if (!["ACCEPTED", "EN_ROUTE", "ARRIVED", "COMPLETED"].includes(status)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (canActAsAdmin && status === "CANCELLED") {
    // admin/delegated rep can cancel
  } else if (!isProvider && !isRep && !isSuperAdmin && !canActAsAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await db.$transaction(async (tx) => {
    const req = await tx.serviceRequest.update({
      where: { id },
      data: {
        status,
        ...(lat != null && { repLat: lat }),
        ...(lng != null && { repLng: lng }),
        ...(status === "CANCELLED" ? { alertActive: false, alertStopReason: "CANCELLED" as const } : {}),
      },
    });

    await tx.requestStatusLog.create({
      data: {
        requestId: id,
        status,
        lat,
        lng,
        note: note ? safeStatusNote(note) : null,
      },
    });

    if (["ACCEPTED", "EN_ROUTE", "ARRIVED", "COMPLETED"].includes(status)) {
      const recipientIds = new Set<string>();
      if ((status === "ACCEPTED" || status === "EN_ROUTE") && existing.providerId) {
        recipientIds.add(existing.providerId);
      }
      const shares = await tx.requestShare.findMany({
        where: { requestId: id, revokedAt: null, requestAccess: true },
        select: { userId: true },
      });
      for (const share of shares) recipientIds.add(share.userId);
      recipientIds.delete(sessionUser.id);
      if (recipientIds.size > 0) {
        await tx.notification.createMany({
          data: [...recipientIds].map((userId) => ({
            userId,
            requestId: id,
            title: GENERIC_NOTIFICATION.statusUpdate.title,
            body: GENERIC_NOTIFICATION.statusUpdate.body,
            type: "REQUEST_STATUS",
            data: { requestId: id, status },
          })),
        });
      }
    }

    return req;
  });

  if (status === "CANCELLED") {
    const { stopCoverageAlerts } = await import("@/lib/coverage-alerts");
    await stopCoverageAlerts({
      requestId: id,
      reason: "CANCELLED",
      actorId: sessionUser.id,
    });
  }

  if (status === "ACCEPTED") {
    const { recordCoverageDecision } = await import("@/lib/coverage-alerts");
    await recordCoverageDecision({
      requestId: id,
      userId: sessionUser.id,
      decision: "ACCEPTED",
    });
    await logRoutingEvent({
      requestId: id,
      eventType: "REP_ACCEPTED",
      actorId: sessionUser.id,
      actorRole: sessionUser.role,
      companyId: existing.companyId,
    });
    if (sessionUser.role === "REP" && existing.assignedRepId === sessionUser.id) {
      await markForwardAccepted(id, sessionUser.id);
    }
  }

  realtimeBus.emit("request:updated", { requestId: id });
  if (existing.providerId) {
    realtimeBus.emit(`user:${existing.providerId}`, {
      type: "REQUEST_STATUS",
      requestId: id,
    });
  }

  return NextResponse.json(updated);
}

async function handleForward(
  user: ReturnType<typeof toSessionUser>,
  requestId: string,
  body: unknown
) {
  const parsed = forwardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  if (user.role !== "REP" && user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reason =
    parsed.data.reason === "Other" && parsed.data.reasonNote
      ? `Other: ${parsed.data.reasonNote}`
      : parsed.data.reason;

  const result = await forwardRequest({
    requestId,
    forwardedById: user.id,
    forwardedToId: parsed.data.forwardedToId,
    reason,
    targetTeamId: parsed.data.targetTeamId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ forwarded: true });
}

async function handleDecline(
  user: ReturnType<typeof toSessionUser>,
  requestId: string,
  body: unknown
) {
  const parsed = declineRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  if (user.role !== "REP" && user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await declineRequest({
    requestId,
    repId: user.id,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { recordCoverageDecision } = await import("@/lib/coverage-alerts");
  await recordCoverageDecision({
    requestId,
    userId: user.id,
    decision: "DECLINED",
  });

  return NextResponse.json({ declined: true });
}

async function handleAssignRep(
  user: ReturnType<typeof toSessionUser>,
  requestId: string,
  body: unknown
) {
  const parsed = assignRepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const existing = await db.serviceRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canAssign = await canActAsAdminForRequest(
    user.id,
    user.role,
    existing.assignedAdminId
  );

  if (!canAssign && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await assignRepToRequest(
    requestId,
    parsed.data.repId,
    {
      companyId: existing.companyId,
      facilityName: existing.facilityName,
      facilityLat: existing.facilityLat,
      facilityLng: existing.facilityLng,
      facilityZip: existing.facilityZipCode,
      product: existing.product,
      scheduledAt: existing.scheduledAt,
    },
    { id: user.id, role: user.role }
  );

  if (!result.assigned) {
    return NextResponse.json(
      { error: result.error ?? "Rep not found or unavailable" },
      { status: 400 }
    );
  }

  return NextResponse.json({ assigned: true, repName: result.repName });
}

async function handleCalendarVisibility(
  user: ReturnType<typeof toSessionUser>,
  requestId: string,
  body: { teamCalendarVisibility?: string; reason?: string }
) {
  const existing = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      assignedRepId: true,
      companyId: true,
      teamId: true,
      teamCalendarVisibility: true,
    },
  });

  if (!existing?.assignedRepId) {
    return NextResponse.json(
      { error: "Assignment must have an assigned rep" },
      { status: 400 }
    );
  }

  const visibility =
    body.teamCalendarVisibility === "HIDDEN_FROM_TEAM_PEERS"
      ? "HIDDEN_FROM_TEAM_PEERS"
      : "SHARED_WITH_TEAM";

  const { canViewAssignmentAsManager } = await import(
    "@/lib/teams/authorization"
  );
  const { updateCalendarVisibility } = await import(
    "@/lib/teams/calendar-visibility"
  );

  const isAssignedRep =
    user.role === "REP" && existing.assignedRepId === user.id;
  const isManager = await canViewAssignmentAsManager(user, {
    assignedRepId: existing.assignedRepId,
    teamId: existing.teamId,
    companyId: existing.companyId,
  });

  if (!isAssignedRep && !isManager && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isAssignedRep && !isManager) {
    await updateCalendarVisibility({
      requestId,
      visibility,
      changedById: user.id,
      targetRepId: existing.assignedRepId,
      source: "REP_PREFERENCE",
      reason: body.reason,
      isRepPreference: true,
    });
  } else {
    await updateCalendarVisibility({
      requestId,
      visibility,
      changedById: user.id,
      targetRepId: existing.assignedRepId,
      source: "MANAGER_OVERRIDE",
      reason: body.reason,
    });
  }

  const updated = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      teamCalendarVisibility: true,
      calendarVisibilitySource: true,
      calendarVisibilitySetAt: true,
    },
  });

  return NextResponse.json(updated);
}
