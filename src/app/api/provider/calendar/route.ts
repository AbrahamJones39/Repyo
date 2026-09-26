import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharedWithProviderWhere } from "@/lib/request-shares";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "PROVIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const [yearStr, monthStr] = (month ?? "").split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const monthIndex = Number(monthStr) - 1 || new Date().getMonth();

  const rangeStart = new Date(year, monthIndex, 1);
  const rangeEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  const profile = await db.providerProfile.findUnique({
    where: { userId: session.user.id },
    select: { organizationId: true, accountStatus: true },
  });
  const canReceiveShares = session.user.accountState === "VERIFIED"
    && profile?.accountStatus === "ACTIVE"
    && Boolean(profile.organizationId);
  const requests = await db.serviceRequest.findMany({
    where: {
      OR: [
        { providerId: session.user.id },
        ...(canReceiveShares && profile?.organizationId
          ? [sharedWithProviderWhere(session.user.id, profile.organizationId)]
          : []),
      ],
      scheduledAt: { gte: rangeStart, lte: rangeEnd },
      status: { notIn: ["CANCELLED", "DECLINED"] },
    },
    select: {
      id: true,
      providerId: true,
      facilityName: true,
      procedureType: true,
      scheduledAt: true,
      status: true,
      urgency: true,
      assignedRep: { select: { id: true, name: true } },
      company: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    requests: requests.map((r) => ({
      id: r.id,
      facilityName: r.facilityName,
      procedureType: r.procedureType,
      scheduledAt: r.scheduledAt.toISOString(),
      status: r.status,
      urgency: r.urgency,
      assignedRep: r.assignedRep,
      companyName: r.company.name,
      isSharedWithMe: r.providerId !== session.user.id,
    })),
  });
}
