import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseRosterText, replaceRoster } from "@/lib/verification/roster";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const entries = await db.preapprovedRosterEntry.findMany({
    where: { organizationId: id },
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, jobTitle: true, active: true },
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const org = await db.providerOrganization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const rows = parseRosterText(typeof body.text === "string" ? body.text : "");
  if (rows.length === 0) {
    return NextResponse.json({ error: "Add at least one email" }, { status: 400 });
  }

  const entries = await replaceRoster({
    organizationId: id,
    rows,
    importedById: session.user.id,
  });
  return NextResponse.json({ entries });
}
