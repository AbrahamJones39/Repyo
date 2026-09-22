import { db } from "@/lib/db";
import { NextResponse } from "next/server";

/** Public manager list so a new rep can identify their designated manager. */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json([]);
  }

  const managers = await db.user.findMany({
    where: {
      companyId,
      role: { in: ["COMPANY_ADMIN", "REP"] },
      disabledAt: null,
    },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(managers);
}
