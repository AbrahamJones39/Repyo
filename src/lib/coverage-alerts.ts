import type {
  AlertStopReason,
  CoverageResponseStatus,
  NotificationDeliveryStatus,
  Role,
} from "@prisma/client";
import { db } from "@/lib/db";
import { GENERIC_NOTIFICATION, logRoutingEvent } from "@/lib/security/audit";
import { realtimeBus } from "@/lib/routing-engine";

export const DEFAULT_ALERT_TIMING = {
  firstReminderMin: 2,
  secondReminderMin: 5,
  escalateMin: 10,
  providerNoticeMin: 15,
} as const;

export type AlertTiming = {
  firstReminderMin: number;
  secondReminderMin: number;
  escalateMin: number;
  providerNoticeMin: number;
};

/** Operational push copy only. No facility, patient, or device identifiers. */
export const COVERAGE_ALERT_COPY = {
  title: "Coverage request",
  body: "A request needs acknowledgment. Open GoRepYo to respond.",
  reminderTitle: "Coverage request still waiting",
  reminderBody: "This request has not been acknowledged. Open GoRepYo to respond.",
  escalatedTitle: "Unacknowledged request escalated",
  escalatedBody:
    "A request was not acknowledged in time and is now assigned to you. Open GoRepYo to forward or respond.",
  providerTitle: "Coverage not yet acknowledged",
  providerBody:
    "The assigned team has not acknowledged this request. Open GoRepYo to choose another route.",
} as const;

export function validateAlertTiming(timing: AlertTiming): string | null {
  const values = [
    timing.firstReminderMin,
    timing.secondReminderMin,
    timing.escalateMin,
    timing.providerNoticeMin,
  ];
  if (values.some((n) => !Number.isInteger(n) || n < 1 || n > 180)) {
    return "Alert times must be whole minutes between 1 and 180";
  }
  if (
    !(
      timing.firstReminderMin < timing.secondReminderMin &&
      timing.secondReminderMin < timing.escalateMin &&
      timing.escalateMin < timing.providerNoticeMin
    )
  ) {
    return "Reminders must happen before escalation, and escalation before the provider notice";
  }
  return null;
}

type AlertRequest = {
  id: string;
  companyId: string;
  providerId: string | null;
  assignedRepId: string | null;
  assignedAdminId: string | null;
  escalatedToId: string | null;
  healthcareSiteId: string | null;
  status: string;
  acknowledgedAt: Date | null;
  notifiedAt: Date | null;
  alertActive: boolean;
  alertPhase: number;
  routingExpandedAt: Date | null;
  scheduledAt: Date;
  coverageStatus: CoverageResponseStatus | null;
};

export function currentAssigneeId(request: {
  assignedRepId: string | null;
  assignedAdminId: string | null;
}): string | null {
  return request.assignedRepId ?? request.assignedAdminId;
}

async function companyTiming(companyId: string): Promise<AlertTiming> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      alertFirstReminderMin: true,
      alertSecondReminderMin: true,
      alertEscalateMin: true,
      alertProviderNoticeMin: true,
    },
  });
  return {
    firstReminderMin: company?.alertFirstReminderMin ?? DEFAULT_ALERT_TIMING.firstReminderMin,
    secondReminderMin: company?.alertSecondReminderMin ?? DEFAULT_ALERT_TIMING.secondReminderMin,
    escalateMin: company?.alertEscalateMin ?? DEFAULT_ALERT_TIMING.escalateMin,
    providerNoticeMin:
      company?.alertProviderNoticeMin ?? DEFAULT_ALERT_TIMING.providerNoticeMin,
  };
}

async function recordCoverage(params: {
  requestId: string;
  assigneeId: string;
  status: CoverageResponseStatus;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  acknowledgedAt?: Date | null;
  respondedAt?: Date | null;
  escalatedAt?: Date | null;
  deliveryStatus?: NotificationDeliveryStatus;
}) {
  await db.requestCoverageEvent.create({
    data: {
      requestId: params.requestId,
      assigneeId: params.assigneeId,
      status: params.status,
      sentAt: params.sentAt ?? null,
      deliveredAt: params.deliveredAt ?? null,
      acknowledgedAt: params.acknowledgedAt ?? null,
      respondedAt: params.respondedAt ?? null,
      escalatedAt: params.escalatedAt ?? null,
      deliveryStatus: params.deliveryStatus ?? "UNKNOWN",
    },
  });
}

function alertPayload(requestId: string, kind: "INITIAL" | "REMINDER" | "ESCALATION") {
  return {
    requestId,
    alertActive: true,
    sound: true,
    haptic: true,
    priority: "HIGH",
    kind,
  };
}

async function pushAlert(params: {
  userId: string;
  requestId: string;
  companyId: string;
  userRole: Role;
  kind: "INITIAL" | "REMINDER" | "ESCALATION";
  title: string;
  body: string;
  type: string;
}) {
  const now = new Date();
  const notification = await db.notification.create({
    data: {
      userId: params.userId,
      requestId: params.requestId,
      title: params.title,
      body: params.body,
      type: params.type,
      priority: "HIGH",
      sentAt: now,
      deliveryStatus: "SENT",
      alertKind: params.kind,
      data: alertPayload(params.requestId, params.kind),
    },
  });

  await db.phiAccessLog.create({
    data: {
      requestId: params.requestId,
      userId: params.userId,
      userRole: params.userRole,
      accessType: "NOTIFICATION_SENT",
      companyId: params.companyId,
      metadata: { notificationId: notification.id, kind: params.kind },
    },
  });

  realtimeBus.emit(`user:${params.userId}`, {
    type: params.type,
    requestId: params.requestId,
    alert: true,
    sound: true,
    haptic: true,
    priority: "HIGH",
  });

  return notification;
}

export async function startCoverageAlert(requestId: string) {
  const request = await db.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) return;
  const assigneeId = currentAssigneeId(request);
  if (!assigneeId) return;
  if (["CANCELLED", "DECLINED", "COMPLETED"].includes(request.status)) return;

  const now = new Date();
  const timing = await companyTiming(request.companyId);
  const assignee = await db.user.findUnique({
    where: { id: assigneeId },
    select: { role: true },
  });

  await db.serviceRequest.update({
    where: { id: requestId },
    data: {
      alertActive: true,
      alertPhase: 0,
      alertStoppedAt: null,
      alertStopReason: null,
      notifiedAt: now,
      deliveredAt: null,
      deliveryStatus: "SENT",
      coverageStatus: "NOTIFIED",
      acknowledgedAt: null,
      acknowledgedById: null,
      nextAlertAt: new Date(now.getTime() + timing.firstReminderMin * 60_000),
      acceptedAt: null,
      declinedAt: null,
    },
  });

  await recordCoverage({
    requestId,
    assigneeId,
    status: "NOTIFIED",
    sentAt: now,
    deliveryStatus: "SENT",
  });

  await pushAlert({
    userId: assigneeId,
    requestId,
    companyId: request.companyId,
    userRole: assignee?.role ?? "REP",
    kind: "INITIAL",
    title: COVERAGE_ALERT_COPY.title,
    body: COVERAGE_ALERT_COPY.body,
    type: "REQUEST_ASSIGNED",
  });

  await logRoutingEvent({
    requestId,
    eventType: "REP_NOTIFIED",
    companyId: request.companyId,
    targetUserId: assigneeId,
    metadata: { alert: "INITIAL" },
  });
}

export async function stopCoverageAlerts(params: {
  requestId: string;
  reason: AlertStopReason;
  actorId?: string | null;
}) {
  const request = await db.serviceRequest.findUnique({
    where: { id: params.requestId },
    select: { id: true, companyId: true, alertActive: true, assignedRepId: true, assignedAdminId: true },
  });
  if (!request) return;
  if (!request.alertActive && params.reason !== "REASSIGNED") {
    await db.notification.updateMany({
      where: { requestId: params.requestId, stoppedAt: null, alertKind: { not: null } },
      data: { stoppedAt: new Date(), read: true },
    });
    return;
  }

  const now = new Date();
  await db.serviceRequest.update({
    where: { id: params.requestId },
    data: {
      alertActive: false,
      nextAlertAt: null,
      alertStoppedAt: now,
      alertStopReason: params.reason,
    },
  });

  await db.notification.updateMany({
    where: { requestId: params.requestId, stoppedAt: null, alertKind: { not: null } },
    data: { stoppedAt: now, read: true },
  });

  await logRoutingEvent({
    requestId: params.requestId,
    eventType: "ALERT_STOPPED",
    actorId: params.actorId,
    companyId: request.companyId,
    metadata: { reason: params.reason },
  });

  const assigneeId = currentAssigneeId(request);
  realtimeBus.emit("request:updated", { requestId: params.requestId, alertStopped: true });
  if (assigneeId) {
    realtimeBus.emit(`user:${assigneeId}`, {
      type: "ALERT_STOPPED",
      requestId: params.requestId,
      alert: false,
    });
  }
}

export async function acknowledgeCoverage(params: {
  requestId: string;
  userId: string;
  userRole: Role;
}) {
  const request = await db.serviceRequest.findUnique({ where: { id: params.requestId } });
  if (!request) return { ok: false as const, error: "Not found" };

  const assigneeId = currentAssigneeId(request);
  const isAssignee = assigneeId === params.userId;
  const isEscalatedManager = request.escalatedToId === params.userId;
  if (!isAssignee && !isEscalatedManager) {
    return { ok: false as const, error: "Only the assigned person can acknowledge" };
  }
  if (request.acknowledgedAt) {
    return { ok: true as const, acknowledgedAt: request.acknowledgedAt };
  }
  if (!["REQUESTING", "ACCEPTED"].includes(request.status)) {
    return { ok: false as const, error: "This request is no longer waiting" };
  }

  const now = new Date();
  await db.serviceRequest.update({
    where: { id: params.requestId },
    data: {
      acknowledgedAt: now,
      acknowledgedById: params.userId,
      coverageStatus: "ACKNOWLEDGED",
      alertActive: false,
      nextAlertAt: null,
      alertStoppedAt: now,
      alertStopReason: "ACKNOWLEDGED",
    },
  });

  await db.notification.updateMany({
    where: { requestId: params.requestId, stoppedAt: null, alertKind: { not: null } },
    data: { stoppedAt: now, read: true },
  });

  await recordCoverage({
    requestId: params.requestId,
    assigneeId: params.userId,
    status: "ACKNOWLEDGED",
    acknowledgedAt: now,
    sentAt: request.notifiedAt,
    deliveryStatus: request.deliveryStatus ?? "UNKNOWN",
  });

  await logRoutingEvent({
    requestId: params.requestId,
    eventType: "REP_ACKNOWLEDGED",
    actorId: params.userId,
    actorRole: params.userRole,
    companyId: request.companyId,
  });

  if (request.assignedAdminId && request.assignedAdminId !== params.userId) {
    await db.notification.create({
      data: {
        userId: request.assignedAdminId,
        requestId: params.requestId,
        title: GENERIC_NOTIFICATION.repAcknowledged.title,
        body: GENERIC_NOTIFICATION.repAcknowledged.body,
        type: "REP_ACKNOWLEDGED",
        data: { requestId: params.requestId },
      },
    });
  }

  realtimeBus.emit("request:updated", { requestId: params.requestId, alertStopped: true });
  realtimeBus.emit(`user:${params.userId}`, {
    type: "REQUEST_ACKNOWLEDGED",
    requestId: params.requestId,
    alert: false,
  });

  return { ok: true as const, acknowledgedAt: now };
}

export async function markCoverageDelivered(params: {
  requestId: string;
  userId: string;
}) {
  const request = await db.serviceRequest.findUnique({
    where: { id: params.requestId },
    select: {
      id: true,
      assignedRepId: true,
      assignedAdminId: true,
      coverageStatus: true,
      notifiedAt: true,
      deliveredAt: true,
    },
  });
  if (!request) return;
  if (currentAssigneeId(request) !== params.userId) return;
  if (request.deliveredAt) return;
  if (request.coverageStatus && !["NOTIFIED", "DELIVERED"].includes(request.coverageStatus)) {
    return;
  }

  const now = new Date();
  await db.serviceRequest.update({
    where: { id: params.requestId },
    data: {
      deliveredAt: now,
      deliveryStatus: "DELIVERED",
      coverageStatus: request.coverageStatus === "NOTIFIED" ? "DELIVERED" : request.coverageStatus,
    },
  });

  await db.notification.updateMany({
    where: { requestId: params.requestId, userId: params.userId, deliveredAt: null },
    data: { deliveredAt: now, deliveryStatus: "DELIVERED" },
  });

  await recordCoverage({
    requestId: params.requestId,
    assigneeId: params.userId,
    status: "DELIVERED",
    sentAt: request.notifiedAt,
    deliveredAt: now,
    deliveryStatus: "DELIVERED",
  });
}

export async function recordCoverageDecision(params: {
  requestId: string;
  userId: string;
  decision: "ACCEPTED" | "DECLINED";
}) {
  const now = new Date();
  const request = await db.serviceRequest.findUnique({
    where: { id: params.requestId },
    select: { notifiedAt: true, deliveredAt: true, deliveryStatus: true },
  });
  await db.serviceRequest.update({
    where: { id: params.requestId },
    data:
      params.decision === "ACCEPTED"
        ? { coverageStatus: "ACCEPTED", acceptedAt: now, declinedAt: null, alertActive: false }
        : { coverageStatus: "DECLINED", declinedAt: now, alertActive: false, alertStopReason: "ACKNOWLEDGED" },
  });
  await recordCoverage({
    requestId: params.requestId,
    assigneeId: params.userId,
    status: params.decision,
    respondedAt: now,
    sentAt: request?.notifiedAt,
    deliveredAt: request?.deliveredAt,
    deliveryStatus: request?.deliveryStatus ?? "UNKNOWN",
  });
  if (params.decision === "DECLINED") {
    await stopCoverageAlerts({ requestId: params.requestId, reason: "ACKNOWLEDGED", actorId: params.userId });
  }
}

async function expandRouting(request: AlertRequest, now: Date) {
  if (request.routingExpandedAt) return;
  await db.serviceRequest.update({
    where: { id: request.id },
    data: { routingExpandedAt: now },
  });

  await logRoutingEvent({
    requestId: request.id,
    eventType: "COVERAGE_EXPANDED",
    companyId: request.companyId,
    metadata: { reason: "UNACKNOWLEDGED" },
  });

  if (request.providerId) {
    await db.notification.create({
      data: {
        userId: request.providerId,
        requestId: request.id,
        title: COVERAGE_ALERT_COPY.providerTitle,
        body: COVERAGE_ALERT_COPY.providerBody,
        type: "COVERAGE_UNACKNOWLEDGED",
        priority: "HIGH",
        sentAt: now,
        data: { requestId: request.id, routingExpanded: true },
      },
    });
    realtimeBus.emit(`user:${request.providerId}`, {
      type: "COVERAGE_UNACKNOWLEDGED",
      requestId: request.id,
    });
  }

  if (!request.healthcareSiteId) return;

  const coveringAdmins = await db.repSiteCoverage.findMany({
    where: { siteId: request.healthcareSiteId },
    select: { repUserId: true },
  });
  const adminIds = coveringAdmins.map((row) => row.repUserId);
  if (adminIds.length === 0) return;

  const managers = await db.user.findMany({
    where: {
      id: { in: adminIds },
      companyId: request.companyId,
      role: "COMPANY_ADMIN",
      disabledAt: null,
    },
    select: { id: true },
  });

  const already = new Set(
    [request.assignedRepId, request.assignedAdminId, request.escalatedToId].filter(Boolean)
  );

  for (const manager of managers) {
    if (already.has(manager.id)) continue;
    await db.notification.create({
      data: {
        userId: manager.id,
        requestId: request.id,
        title: COVERAGE_ALERT_COPY.providerTitle,
        body: "A location your team covers still has no acknowledgment. Open GoRepYo to help route it.",
        type: "COVERAGE_UNACKNOWLEDGED",
        priority: "HIGH",
        sentAt: now,
        data: { requestId: request.id, routingExpanded: true },
      },
    });
    realtimeBus.emit(`user:${manager.id}`, {
      type: "COVERAGE_UNACKNOWLEDGED",
      requestId: request.id,
    });
  }
}

async function escalateRequest(request: AlertRequest, now: Date) {
  const missedUserId = currentAssigneeId(request);
  if (!missedUserId) return false;

  const missedUser = await db.user.findUnique({
    where: { id: missedUserId },
    select: { id: true, managerId: true, role: true, companyId: true },
  });

  let targetId = missedUser?.managerId ?? null;
  if (!targetId || targetId === missedUserId) {
    targetId = request.assignedAdminId && request.assignedAdminId !== missedUserId
      ? request.assignedAdminId
      : null;
  }
  if (!targetId) return false;

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, companyId: true },
  });
  if (!target || target.companyId !== request.companyId) return false;
  if (request.escalatedToId === target.id && request.assignedRepId === null && request.assignedAdminId === target.id) {
    return false;
  }

  const timing = await companyTiming(request.companyId);
  const managerIsRep = target.role === "REP";

  await stopCoverageAlerts({ requestId: request.id, reason: "ESCALATED" });

  await db.serviceRequest.update({
    where: { id: request.id },
    data: {
      missedByRepId: missedUser?.role === "REP" ? missedUser.id : undefined,
      assignedRepId: managerIsRep ? target.id : null,
      assignedAdminId: managerIsRep ? request.assignedAdminId : target.id,
      assignedAt: now,
      escalatedAt: now,
      escalatedToId: target.id,
      acknowledgedAt: null,
      acknowledgedById: null,
      coverageStatus: "ESCALATED",
      alertActive: true,
      alertPhase: 0,
      alertStoppedAt: null,
      alertStopReason: null,
      deliveredAt: null,
      deliveryStatus: "SENT",
      nextAlertAt: new Date(now.getTime() + timing.firstReminderMin * 60_000),
      status: "REQUESTING",
    },
  });

  await recordCoverage({
    requestId: request.id,
    assigneeId: missedUserId,
    status: "ESCALATED",
    escalatedAt: now,
    sentAt: request.notifiedAt,
  });
  await recordCoverage({
    requestId: request.id,
    assigneeId: target.id,
    status: "NOTIFIED",
    sentAt: now,
    deliveryStatus: "SENT",
  });

  await pushAlert({
    userId: target.id,
    requestId: request.id,
    companyId: request.companyId,
    userRole: target.role,
    kind: "ESCALATION",
    title: COVERAGE_ALERT_COPY.escalatedTitle,
    body: COVERAGE_ALERT_COPY.escalatedBody,
    type: "REQUEST_ESCALATED",
  });

  await logRoutingEvent({
    requestId: request.id,
    eventType: "ESCALATED_TO_MANAGER",
    companyId: request.companyId,
    targetUserId: target.id,
    metadata: { missedByUserId: missedUserId },
  });

  realtimeBus.emit("request:updated", { requestId: request.id });
  return true;
}

/**
 * Drive reminder, escalation, and provider-notice clocks.
 * Safe to call often from the notification stream.
 */
export async function processCoverageAlerts(limit = 40): Promise<number> {
  const now = new Date();
  const due = await db.serviceRequest.findMany({
    where: {
      accessEnabled: true,
      status: { in: ["REQUESTING", "ACCEPTED"] },
      acknowledgedAt: null,
      notifiedAt: { not: null },
      OR: [{ alertActive: true }, { routingExpandedAt: null }],
    },
    take: limit * 2,
  });

  let acted = 0;
  for (const request of due) {
    if (request.scheduledAt.getTime() < now.getTime() && request.alertActive) {
      await stopCoverageAlerts({ requestId: request.id, reason: "EXPIRED" });
      acted += 1;
      continue;
    }
    if (!request.notifiedAt) continue;

    const cycleStart = request.escalatedAt ?? request.notifiedAt;
    const elapsed = now.getTime() - cycleStart.getTime();
    const sinceFirstAlert = now.getTime() - request.notifiedAt.getTime();
    const timing = await companyTiming(request.companyId);
    const alertRequest: AlertRequest = request;

    if (!request.routingExpandedAt && sinceFirstAlert >= timing.providerNoticeMin * 60_000) {
      await expandRouting(alertRequest, now);
      acted += 1;
    }

    if (!request.alertActive || request.acknowledgedAt) continue;

    if (elapsed >= timing.escalateMin * 60_000 && request.coverageStatus !== "ESCALATED") {
      const escalated = await escalateRequest(alertRequest, now);
      if (escalated) acted += 1;
      continue;
    }

    if (request.alertPhase < 1 && elapsed >= timing.firstReminderMin * 60_000) {
      await sendReminder(alertRequest, 1, timing);
      acted += 1;
      continue;
    }

    if (request.alertPhase < 2 && elapsed >= timing.secondReminderMin * 60_000) {
      await sendReminder(alertRequest, 2, timing);
      acted += 1;
    }
  }

  return acted;
}

async function sendReminder(request: AlertRequest, phase: 1 | 2, timing: AlertTiming) {
  const assigneeId = currentAssigneeId(request);
  if (!assigneeId) return;
  const assignee = await db.user.findUnique({
    where: { id: assigneeId },
    select: { role: true },
  });
  const nextMinutes = phase === 1 ? timing.secondReminderMin : timing.escalateMin;
  const base = request.notifiedAt ?? new Date();

  await db.serviceRequest.update({
    where: { id: request.id },
    data: {
      alertPhase: phase,
      nextAlertAt: new Date(base.getTime() + nextMinutes * 60_000),
    },
  });

  await pushAlert({
    userId: assigneeId,
    requestId: request.id,
    companyId: request.companyId,
    userRole: assignee?.role ?? "REP",
    kind: "REMINDER",
    title: COVERAGE_ALERT_COPY.reminderTitle,
    body: COVERAGE_ALERT_COPY.reminderBody,
    type: "REQUEST_REMINDER",
  });

  await logRoutingEvent({
    requestId: request.id,
    eventType: "ALERT_REPEATED",
    companyId: request.companyId,
    targetUserId: assigneeId,
    metadata: { phase },
  });
}
