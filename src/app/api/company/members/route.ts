import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { approveCompanyUser } from "@/lib/verification/user-verification";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const members = await db.user.findMany({
    where: {
      companyId,
      role: { in: ["REP", "COMPANY_ADMIN"] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountState: true,
      createdAt: true,
      managerId: true,
      repProfile: { select: { credentialStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pending = members.filter(
    (m) =>
      m.accountState === "REGISTERED" ||
      m.repProfile?.credentialStatus === "PENDING"
  );

  return NextResponse.json({ members, pending });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const body = await request.json();
  const userId = String(body.userId ?? "");

  if (body.action === "approve") {
    if (body.managerId) {
      const { requireRepManager } = await import("@/lib/org-scope");
      const managerId = await requireRepManager({
        managerId: String(body.managerId),
        companyId,
      });
      await db.user.update({
        where: { id: userId },
        data: { managerId },
      });
    }
    await approveCompanyUser(
      userId,
      session.user.id,
      companyId,
      body.reason
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
