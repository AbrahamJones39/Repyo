import { db } from "@/lib/db";
import { GENERIC_NOTIFICATION, logRoutingEvent } from "@/lib/security/audit";
import { realtimeBus } from "@/lib/routing-engine";
import type { RequestUrgency } from "@prisma/client";

const ACK_TIMEOUT_MS: Record<RequestUrgency, number> = {
  ASAP: 5 * 60 * 1000,
  SAME_DAY: 15 * 60 * 1000,
  SCHEDULED: 30 * 60 * 1000,
};

function timeoutFor(urgency: RequestUrgency): number {
  return ACK_TIMEOUT_MS[urgency] ?? ACK_TIMEOUT_MS.SAME_DAY;
}

/**
 * If a rep does not open/acknowledge an assigned request in time,
 * re-route it to their designated manager (then up the ladder).
 * Operational notification only — does not grant PHI.
 */
export async function escalateMissedRequests(limit = 50): Promise<number> {
  const now = new Date();
  const candidates = await db.serviceRequest.findMany({
    where: {
      status: { in: ["REQUESTING", "ACCEPTED"] },
      accessEnabled: true,
      acknowledgedAt: null,
      OR: [
        { assignedRepId: { not: null } },
        { assignedAdminId: { not: null }, assignedRepId: null },
      ],
    },
    select: {
      id: true,
      companyId: true,
      urgency: true,
      assignedRepId: true,
      assignedAdminId: true,
      assignedAt: true,
      escalatedAt: true,
      escalatedToId: true,
      missedByRepId: true,
      createdAt: true,
    },
    take: limit * 3,
  });

  let escalated = 0;

  for (const request of candidates) {
    const clockStart = request.escalatedAt ?? request.assignedAt ?? request.createdAt;
    if (now.getTime() - clockStart.getTime() < timeoutFor(request.urgency)) {
      continue;
    }

    const missedUserId =
      request.assignedRepId ?? request.escalatedToId ?? request.assignedAdminId;
    if (!missedUserId) continue;

    const missedUser = await db.user.findUnique({
      where: { id: missedUserId },
      select: { id: true, managerId: true, role: true, name: true },
    });
    const managerId = missedUser?.managerId;
    if (!managerId || managerId === missedUserId) continue;
    if (request.escalatedToId === managerId && request.assignedRepId === null) continue;

    const manager = await db.user.findUnique({
      where: { id: managerId },
      select: { id: true, role: true, name: true, companyId: true },
    });
    if (!manager || manager.companyId !== request.companyId) continue;

    const managerIsRep = manager.role === "REP";

    await db.serviceRequest.update({
      where: { id: request.id },
      data: {
        missedByRepId: missedUser?.role === "REP" ? missedUser.id : request.missedByRepId,
        assignedRepId: managerIsRep ? manager.id : null,
        assignedAdminId: managerIsRep ? request.assignedAdminId : manager.id,
        assignedAt: now,
        escalatedAt: now,
        escalatedToId: manager.id,
        acknowledgedAt: null,
        acknowledgedById: null,
        alertActive: true,
        status: "REQUESTING",
      },
    });

    await db.notification.create({
      data: {
        userId: manager.id,
        title: GENERIC_NOTIFICATION.escalated.title,
        body: GENERIC_NOTIFICATION.escalated.body,
        type: "REQUEST_ESCALATED",
        data: {
          requestId: request.id,
          missedByUserId: missedUserId,
          alertActive: true,
        },
      },
    });

    await logRoutingEvent({
      requestId: request.id,
      eventType: "ESCALATED_TO_MANAGER",
      companyId: request.companyId,
      targetUserId: manager.id,
      metadata: {
        missedByUserId,
        previousRepId: request.assignedRepId,
        managerRole: manager.role,
      },
    });

    realtimeBus.emit("request:updated", { requestId: request.id });
    realtimeBus.emit(`user:${manager.id}`, {
      type: "REQUEST_ESCALATED",
      requestId: request.id,
    });

    escalated += 1;
    if (escalated >= limit) break;
  }

  return escalated;
}
