import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRepSchema } from "@/lib/validations";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { getDelegatedAdminIdsForRep } from "@/lib/admin-matching";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
} from "@/lib/security/authorization";
import { toSessionUser } from "@/lib/security/sanitize-request";
import { logPermissionChange } from "@/lib/security/audit";
import {
  assertOrgUnitInCompany,
  getScopedRepIds,
  requireRepManager,
  resolveAdminScope,
  scopeHasPermission,
  unitInScope,
} from "@/lib/org-scope";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let companyId = session.user.companyId;

  if (session.user.role === "REP") {
    companyId = session.user.companyId ?? null;
    if (!companyId) {
      const delegatedAdminIds = await getDelegatedAdminIdsForRep(session.user.id);
      if (delegatedAdminIds.length === 0) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const admin = await db.user.findUnique({
        where: { id: delegatedAdminIds[0] },
        select: { companyId: true },
      });
      companyId = admin?.companyId ?? null;
    }
  } else if (session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 400 });
  }

  const user = toSessionUser(session.user);
  const scope = session.user.role === "COMPANY_ADMIN" ? await resolveAdminScope(user) : null;
  const scopedRepIds =
    session.user.role === "COMPANY_ADMIN" ? await getScopedRepIds(user, scope) : null;

  if (scopedRepIds && scopedRepIds.length === 0 && !scope?.isCompanyWide) {
    return NextResponse.json([]);
  }

  const reps = await db.user.findMany({
    where: {
      companyId,
      role: "REP",
      ...(scopedRepIds ? { id: { in: scopedRepIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      managerId: true,
      orgUnitId: true,
      createdAt: true,
      manager: { select: { id: true, name: true, role: true } },
      homeOrgUnit: { select: { id: true, name: true, typeLabel: true } },
      repProfile: {
        include: { territories: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(reps);
}

export async function POST(request: Request) {
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
  const canManage =
    hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_REPS) ||
    scopeHasPermission(scope, ADMIN_PERMISSIONS.MANAGE_REPS);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createRepSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const email = data.email.trim().toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { name: true, products: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const invalidProducts = data.products.filter((p) => !company.products.includes(p));
    if (invalidProducts.length > 0) {
      return NextResponse.json(
        { error: "One or more products are not offered by your company" },
        { status: 400 }
      );
    }

    const managerId = await requireRepManager({
      managerId: data.managerId,
      companyId,
    });

    let orgUnitId = data.orgUnitId ?? null;
    if (orgUnitId) {
      await assertOrgUnitInCompany(orgUnitId, companyId);
      if (scope && !unitInScope(scope, orgUnitId)) {
        return NextResponse.json(
          { error: "Organizational unit is outside your scope" },
          { status: 403 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const rep = await db.user.create({
      data: {
        name: data.name.trim(),
        email,
        phone: data.phone?.trim() || null,
        passwordHash,
        role: "REP",
        companyId,
        managerId,
        orgUnitId,
        repProfile: {
          create: {
            status: data.status,
            credentialStatus: data.credentialStatus,
            symplrMerged: data.credentialStatus === "ACTIVE",
            products: data.products,
            companies: [company.name],
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        managerId: true,
        orgUnitId: true,
        createdAt: true,
        manager: { select: { id: true, name: true, role: true } },
        homeOrgUnit: { select: { id: true, name: true, typeLabel: true } },
        repProfile: {
          include: { territories: true },
        },
      },
    });

    await logPermissionChange({
      targetUserId: rep.id,
      changedById: session.user.id,
      changeType: "MANAGER_CHANGED",
      beforeState: { managerId: null },
      afterState: { managerId, orgUnitId },
    });

    return NextResponse.json(rep, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create rep";
    if (message.includes("manager") || message.includes("Organizational")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/company/reps error:", error);
    return NextResponse.json({ error: "Failed to create rep" }, { status: 500 });
  }
}
