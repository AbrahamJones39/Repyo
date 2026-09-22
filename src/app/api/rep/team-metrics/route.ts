import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDescendantReportIds } from "@/lib/org-scope";
import { NextResponse } from "next/server";

/** Operational counts for people below the signed-in rep. No patient information. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "REP") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reportIds = await getDescendantReportIds(
    session.user.id,
    session.user.companyId
  );
  if (reportIds.length === 0) {
    return NextResponse.json({
      reportCount: 0,
      phiIncluded: false,
      totals: null,
    });
  }

  const reports = await db.user.findMany({
    where: { id: { in: reportIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const requests = await db.serviceRequest.findMany({
    where: {
      companyId: session.user.companyId ?? undefined,
      assignedRepId: { in: reportIds },
    },
    select: {
      status: true,
      escalatedToId: true,
    },
    take: 200,
  });

  const profiles = await db.repProfile.findMany({
    where: { userId: { in: reportIds } },
    select: { status: true },
  });

  return NextResponse.json({
    reportCount: reports.length,
    reports: reports.map((person) => person.name),
    phiIncluded: false,
    totals: {
      all: requests.length,
      active: requests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.status))
        .length,
      completed: requests.filter((request) => request.status === "COMPLETED").length,
      escalated: requests.filter((request) => Boolean(request.escalatedToId)).length,
      available: profiles.filter((profile) => profile.status === "AVAILABLE").length,
    },
  });
}
