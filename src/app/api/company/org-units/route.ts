import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
} from "@/lib/security/authorization";
import { toSessionUser } from "@/lib/security/sanitize-request";
import {
  buildOrgUnitTree,
  canManageOrgStructure,
  ensureCompanyRootOrgUnit,
  flattenOrgUnits,
  placeUnassignedAdminOnCompanyRoot,
  resolveAdminScope,
  scopeHasPermission,
  unitInScope,
} from "@/lib/org-scope";
import { createOrgUnitSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  if (!scope) {
    return NextResponse.json({ error: "No company assigned" }, { status: 400 });
  }

  try {
    await ensureCompanyRootOrgUnit(scope.companyId);
    await placeUnassignedAdminOnCompanyRoot(user);
  } catch (err) {
    console.error("Failed to initialize org units", err);
    await ensureCompanyRootOrgUnit(scope.companyId);
  }
  const refreshedScope = (await resolveAdminScope(user)) ?? {
    ...scope,
    isCompanyWide: true,
  };

  const unitSelect = {
    id: true,
    parentId: true,
    name: true,
    typeLabel: true,
    sortOrder: true,
    assignments: {
      select: {
        id: true,
        permissions: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    },
    members: {
      select: { id: true, name: true, role: true, email: true },
    },
  } as const;

  let units = await db.orgUnit.findMany({
    where: { companyId: refreshedScope.companyId },
    select: unitSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  if (units.length === 0) {
    await ensureCompanyRootOrgUnit(refreshedScope.companyId);
    units = await db.orgUnit.findMany({
      where: { companyId: refreshedScope.companyId },
      select: unitSelect,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  let visible = refreshedScope.isCompanyWide
    ? units
    : units.filter((u) => refreshedScope.unitIds.includes(u.id));
  if (visible.length === 0) {
    visible = units;
  }

  let tree = buildOrgUnitTree(visible);
  if (tree.length === 0) {
    const root = await ensureCompanyRootOrgUnit(refreshedScope.companyId);
    const rootRow = await db.orgUnit.findFirst({
      where: { id: root.id },
      select: unitSelect,
    });
    if (rootRow) {
      visible = [rootRow, ...units.filter((u) => u.id !== rootRow.id)];
      tree = buildOrgUnitTree(visible);
      if (tree.length === 0) {
        tree = [{ ...rootRow, children: [] }];
      }
    }
  }

  const people = await db.user.findMany({
    where: {
      companyId: refreshedScope.companyId,
      role: { in: ["COMPANY_ADMIN", "REP"] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      managerId: true,
      orgUnitId: true,
      manager: { select: { id: true, name: true, role: true } },
      homeOrgUnit: { select: { id: true, name: true, typeLabel: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    tree,
    flat: flattenOrgUnits(tree),
    units: visible,
    people,
    scope: {
      unitIds: refreshedScope.unitIds,
      assignedUnitIds: refreshedScope.assignedUnitIds,
      permissions: refreshedScope.permissions,
      isCompanyWide: refreshedScope.isCompanyWide,
    },
    canManageStructure:
      canManageOrgStructure(user, refreshedScope) || tree.length === 0,
    canAssignPeople:
      hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_REPS) ||
      scopeHasPermission(refreshedScope, ADMIN_PERMISSIONS.MANAGE_REPS),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = toSessionUser(session.user);
  try {
    await placeUnassignedAdminOnCompanyRoot(user);
  } catch (err) {
    console.error("Failed to place admin on company root", err);
  }
  const scope = await resolveAdminScope(user);
  if (!scope || !canManageOrgStructure(user, scope)) {
    return NextResponse.json(
      { error: "You do not have permission to change the org structure" },
      { status: 403 }
    );
  }

  const parsed = createOrgUnitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const root = await ensureCompanyRootOrgUnit(scope.companyId);
  let parentId = parsed.data.parentId ?? null;
  if (!parentId) {
    parentId = root.id;
  } else if (!unitInScope(scope, parentId) && parentId !== root.id) {
    return NextResponse.json(
      { error: "Parent unit is outside your scope" },
      { status: 403 }
    );
  }

  const unit = await db.orgUnit.create({
    data: {
      companyId: scope.companyId,
      parentId,
      name: parsed.data.name.trim(),
      typeLabel: parsed.data.typeLabel.trim() || "Unit",
    },
  });

  return NextResponse.json(unit, { status: 201 });
}
