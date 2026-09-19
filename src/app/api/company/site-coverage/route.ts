import { auth } from "@/lib/auth";
import { setRepSiteCoverage } from "@/lib/healthcare-sites/service";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const coverages = await db.repSiteCoverage.findMany({
    where: { repUserId: session.user.id },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          lat: true,
          lng: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(coverages.map((c) => c.site));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.map(String)
    : [];

  const sites = await setRepSiteCoverage(session.user.id, siteIds);
  return NextResponse.json(sites.map((c) => c.site));
}
