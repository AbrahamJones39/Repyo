import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { toSessionUser } from "@/lib/security/sanitize-request";
import {
  canViewOperationalMetrics,
  getScopedRepIds,
  resolveAdminScope,
} from "@/lib/org-scope";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 400 });
  }

  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  if (!canViewOperationalMetrics(user, scope)) {
    return NextResponse.json(
      { error: "You do not have permission to view operational metrics" },
      { status: 403 }
    );
  }

  const scopedRepIds = await getScopedRepIds(user, scope);
  const requestWhere = {
    companyId,
    OR: [
      { assignedAdminId: session.user.id },
      { escalatedToId: session.user.id },
      ...(scopedRepIds.length > 0 ? [{ assignedRepId: { in: scopedRepIds } }] : []),
    ],
  };

  const requests = await db.serviceRequest.findMany({
    where: requestWhere,
    include: {
      assignedRep: { select: { name: true } },
      statusLogs: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const completed = requests.filter((r) => r.status === "COMPLETED");
  const cancelled = requests.filter((r) => r.status === "CANCELLED");
  const active = requests.filter(
    (r) => !["COMPLETED", "CANCELLED"].includes(r.status)
  );
  const escalated = requests.filter((r) => Boolean(r.escalatedToId)).length;
  const unacknowledged = requests.filter(
    (r) => r.status === "REQUESTING" && !r.acknowledgedAt && r.notifiedAt
  ).length;

  function median(values: number[]) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
  }

  const ackMinutes = requests
    .filter((r) => r.notifiedAt && r.acknowledgedAt)
    .map((r) => (r.acknowledgedAt!.getTime() - r.notifiedAt!.getTime()) / 60000);
  const acceptMinutes = requests
    .filter((r) => r.notifiedAt && r.acceptedAt)
    .map((r) => (r.acceptedAt!.getTime() - r.notifiedAt!.getTime()) / 60000);

  const responseTimes: number[] = [];
  for (const req of completed) {
    const assigned = req.statusLogs.find((l) => l.status === "REQUESTING");
    const accepted = req.statusLogs.find((l) => l.status === "ACCEPTED");
    if (assigned && accepted) {
      responseTimes.push(
        (accepted.createdAt.getTime() - assigned.createdAt.getTime()) / 60000
      );
    }
  }

  const avgResponseMinutes =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

  const byProcedure: Record<string, number> = {};
  for (const req of requests) {
    const key = req.procedureType ?? "Unspecified";
    byProcedure[key] = (byProcedure[key] ?? 0) + 1;
  }

  const byUrgency: Record<string, number> = {};
  for (const req of requests) {
    byUrgency[req.urgency] = (byUrgency[req.urgency] ?? 0) + 1;
  }

  const reps = await db.repProfile.findMany({
    where: {
      user: {
        companyId,
        ...(scopedRepIds.length > 0 || !scope?.isCompanyWide
          ? { id: { in: scopedRepIds } }
          : {}),
      },
    },
    select: { status: true, credentialStatus: true },
  });

  const availableReps = reps.filter((r) => r.status === "AVAILABLE").length;
  const credentialedReps = reps.filter((r) => r.credentialStatus === "ACTIVE").length;

  const forwards = await db.requestForward.findMany({
    where: {
      request: requestWhere,
    },
    include: {
      originalRep: { select: { id: true, name: true } },
      forwardedTo: { select: { id: true, name: true } },
    },
    orderBy: { forwardTimestamp: "desc" },
    take: 500,
  });

  const forwardPairs: Record<string, number> = {};
  for (const forward of forwards) {
    const key = `${forward.originalRep.name} → ${forward.forwardedTo.name}`;
    forwardPairs[key] = (forwardPairs[key] ?? 0) + 1;
  }

  return NextResponse.json({
    totals: {
      all: requests.length,
      active: active.length,
      completed: completed.length,
      cancelled: cancelled.length,
      forwards: forwards.length,
      escalated,
      unacknowledged,
    },
    avgResponseMinutes,
    medianAckMinutes: median(ackMinutes),
    medianAcceptMinutes: median(acceptMinutes),
    byProcedure: Object.entries(byProcedure)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    byUrgency: Object.entries(byUrgency).map(([name, count]) => ({ name, count })),
    coverage: {
      totalReps: reps.length,
      availableReps,
      credentialedReps,
    },
    forwardRoutes: Object.entries(forwardPairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([route, count]) => ({ route, count })),
    phiIncluded: false,
    scope: {
      isCompanyWide: scope?.isCompanyWide ?? false,
      unitCount: scope?.unitIds.length ?? 0,
    },
  });
}
