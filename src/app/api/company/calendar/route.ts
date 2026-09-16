import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayName } from "@/lib/rep-availability";
import { NextResponse } from "next/server";
import { toSessionUser } from "@/lib/security/sanitize-request";
import { getScopedRepIds, resolveAdminScope } from "@/lib/org-scope";

export async function GET(request: Request) {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "COMPANY_ADMIN" ||
    !session.user.companyId
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  const scopedRepIds = await getScopedRepIds(user, scope);

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const repId = searchParams.get("repId");
  const [yearStr, monthStr] = (month ?? "").split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const monthIndex = Number(monthStr) - 1 || new Date().getMonth();

  const rangeStart = new Date(year, monthIndex, 1);
  const rangeEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  if (repId && !scopedRepIds.includes(repId) && !scope?.isCompanyWide) {
    return NextResponse.json({ error: "Rep is outside your scope" }, { status: 403 });
  }

  const repWhere = {
    role: "REP" as const,
    companyId: session.user.companyId,
    ...(repId
      ? { id: repId }
      : scopedRepIds.length > 0 || scope?.isCompanyWide
        ? { id: { in: scopedRepIds } }
        : { id: { in: [] as string[] } }),
  };

  if (!repId && scopedRepIds.length === 0 && !scope?.isCompanyWide) {
    return NextResponse.json({
      month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      reps: [],
    });
  }

  const reps = await db.user.findMany({
    where: repWhere,
    select: {
      id: true,
      name: true,
      repProfile: {
        select: {
          status: true,
          scheduleRules: {
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
          availabilityBlocks: {
            where: {
              startAt: { lte: rangeEnd },
              endAt: { gte: rangeStart },
            },
            orderBy: { startAt: "asc" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const repIds = reps.map((r) => r.id);

  const requests = repIds.length
    ? await db.serviceRequest.findMany({
        where: {
          companyId: session.user.companyId,
          assignedRepId: { in: repIds },
          scheduledAt: { gte: rangeStart, lte: rangeEnd },
          status: { not: "CANCELLED" },
        },
        select: {
          id: true,
          assignedRepId: true,
          facilityName: true,
          procedureType: true,
          scheduledAt: true,
          status: true,
          urgency: true,
        },
        orderBy: { scheduledAt: "asc" },
      })
    : [];

  return NextResponse.json({
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    reps: reps.map((rep) => ({
      id: rep.id,
      name: rep.name,
      status: rep.repProfile?.status ?? "OFF_DUTY",
      rules: (rep.repProfile?.scheduleRules ?? []).map((r) => ({
        ...r,
        dayLabel: dayName(r.dayOfWeek),
      })),
      blocks: rep.repProfile?.availabilityBlocks ?? [],
      requests: requests.filter((req) => req.assignedRepId === rep.id),
    })),
  });
}
