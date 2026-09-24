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
import { canAccessRequestRecord } from "@/lib/security/authorization";
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
      provider: { select: { id: true, name: true, phone: true } },
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
      routingEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!serviceRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const delegatedAdminIds =
    user.role === "REP" ? await getDelegatedAdminIdsForRep(user.id) : [];

  const canAccess = canAccessRequestRecord(user, serviceRequest, {
    delegatedAdminIds,
  });
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestForSanitize = serviceRequest;

  const isDelegatedAdmin =
    user.role === "REP" &&
    Boolean(
      serviceRequest.assignedAdminId &&
        delegatedAdminIds.includes(serviceRequest.assignedAdminId)
    );

  const sanitized = sanitizeRequestForUser(requestForSanitize, user, {
    isDelegatedAdmin,
  });

  const orgId = await getProviderOrgContext(user.id);
  await logPhiAccess({
    requestId: id,
    userId: user.id,
    userRole: user.role,
    accessType: "REQUEST_OPENED",
    organizationId: orgId,
    companyId: serviceRequest.companyId,
  });

  const phiVisible =
    "patientName" in sanitized && sanitized.patientName
      ? true
      : "deviceName" in sanitized && sanitized.deviceName
        ? true
        : "deviceSerial" in sanitized && sanitized.deviceSerial
          ? true
          : false;
  if (phiVisible) {
    await logPhiAccess({
      requestId: id,
      userId: user.id,
      userRole: user.role,
      accessType: "PHI_DISPLAYED",
      organizationId: orgId,
      companyId: serviceRequest.companyId,
      metadata: {
        fields: [
          "patientName" in sanitized && sanitized.patientName ? "patient" : null,
          "deviceName" in sanitized && sanitized.deviceName ? "device" : null,
        ].filter(Boolean),
      },
    });
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
    routingHistory: serviceRequest.routingEvents,
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

    if (status === "ACCEPTED" || status === "EN_ROUTE") {
      if (existing.providerId) {
        await tx.notification.create({
          data: {
            userId: existing.providerId,
            title: GENERIC_NOTIFICATION.statusUpdate.title,
            body: GENERIC_NOTIFICATION.statusUpdate.body,
            type: "REQUEST_STATUS",
            data: { requestId: id, status },
          },
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

  if (user.role !== "REP") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await forwardRequest({
    requestId,
    forwardedById: user.id,
    forwardedToId: parsed.data.forwardedToId,
    reason: parsed.data.reason,
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
