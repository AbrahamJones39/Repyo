import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseRosterText, replaceRoster } from "@/lib/verification/roster";
import { NextResponse } from "next/server";

async function requireCompanyAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN" || !session.user.companyId) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireCompanyAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.preapprovedRosterEntry.findMany({
    where: { companyId: session.user.companyId },
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, jobTitle: true, active: true },
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const session = await requireCompanyAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const rows = parseRosterText(typeof body.text === "string" ? body.text : "");
  if (rows.length === 0) {
    return NextResponse.json({ error: "Add at least one email" }, { status: 400 });
  }

  const entries = await replaceRoster({
    companyId: session.user.companyId,
    rows,
    importedById: session.user.id,
  });
  return NextResponse.json({ entries });
}
