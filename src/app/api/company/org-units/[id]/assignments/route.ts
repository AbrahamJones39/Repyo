import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PERMISSIONS,
  DEFAULT_ADMIN_SCOPE_PERMISSIONS,
  SECURITY_PERMISSIONS,
  hasAdminPermission,
} from "@/lib/security/authorization";
import { logPermissionChange } from "@/lib/security/audit";
import { toSessionUser } from "@/lib/security/sanitize-request";
import {
  assertManagerInCompany,
  assertNoManagerCycle,
  resolveAdminScope,
  scopeHasPermission,
  unitInScope,
  userIsInAdminScope,
} from "@/lib/org-scope";
import { orgUnitAssignmentSchema } from "@/lib/validations";
import { syncTerritoryGrant } from "@/lib/authorization/scope-grants";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: requestedUnitId } = await context.params;
  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  const canAssign =
    hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_REPS) ||
    scopeHasPermission(scope, ADMIN_PERMISSIONS.MANAGE_REPS);

  if (!scope || !canAssign || !unitInScope(scope, requestedUnitId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = orgUnitAssignmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const inScope = await userIsInAdminScope(user, parsed.data.userId, scope);
  const target = await db.user.findFirst({
    where: {
      id: parsed.data.userId,
      companyId: scope.companyId,
      role: { in: ["COMPANY_ADMIN", "REP"] },
    },
    select: { id: true, role: true, orgUnitId: true, managerId: true, adminPermissions: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (
    !scope.isCompanyWide &&
    !inScope &&
    target.orgUnitId &&
    !unitInScope(scope, target.orgUnitId)
  ) {
    return NextResponse.json({ error: "User is outside your scope" }, { status: 403 });
  }

  if (parsed.data.managerId === parsed.data.userId) {
    return NextResponse.json(
      { error: "A person cannot be their own designated manager" },
      { status: 400 }
    );
  }

  let nextManagerId: string | null =
    parsed.data.managerId === undefined ? target.managerId : parsed.data.managerId;
  if (nextManagerId) {
    try {
      await assertManagerInCompany(nextManagerId, scope.companyId);
      await assertNoManagerCycle(parsed.data.userId, nextManagerId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid designated manager" },
        { status: 400 }
      );
    }
  }
  if (target.role === "REP" && !nextManagerId) {
    return NextResponse.json(
      { error: "Every rep account must have a designated manager" },
      { status: 400 }
    );
  }

  const orgUnitId = requestedUnitId;
  const allowedPermissions = new Set<string>(Object.values(ADMIN_PERMISSIONS));
  const requestedPermissions =
    parsed.data.permissions && parsed.data.permissions.length > 0
      ? parsed.data.permissions
      : [...DEFAULT_ADMIN_SCOPE_PERMISSIONS];
  const permissions = requestedPermissions.filter((permission) =>
    allowedPermissions.has(permission)
  );

  await db.orgUnitAssignment.deleteMany({
    where: { userId: parsed.data.userId, orgUnitId: { not: orgUnitId } },
  });

  const assignment = await db.orgUnitAssignment.upsert({
    where: { orgUnitId_userId: { orgUnitId, userId: parsed.data.userId } },
    create: {
      orgUnitId,
      userId: parsed.data.userId,
      permissions: target.role === "COMPANY_ADMIN" ? permissions : [],
    },
    update: {
      permissions: target.role === "COMPANY_ADMIN" ? permissions : [],
    },
  });

  await db.user.update({
    where: { id: parsed.data.userId },
    data: {
      orgUnitId,
      managerId: nextManagerId,
      ...(target.role === "COMPANY_ADMIN"
        ? {
            adminPermissions: [
              ...permissions,
              ...target.adminPermissions.filter((permission) =>
                (Object.values(SECURITY_PERMISSIONS) as string[]).includes(permission)
              ),
            ],
          }
        : {}),
    },
  });

  const unit = await db.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: { name: true, companyId: true },
  });
  if (unit) {
    await syncTerritoryGrant({
      userId: parsed.data.userId,
      companyId: unit.companyId,
      territoryLabel: unit.name,
      grantedById: session.user.id,
      ownerLabel: session.user.name,
    });
  }

  await logPermissionChange({
    targetUserId: parsed.data.userId,
    changedById: session.user.id,
    changeType: "ORG_UNIT_CHANGED",
    beforeState: { orgUnitId: target.orgUnitId, managerId: target.managerId },
    afterState: {
      orgUnitId,
      managerId: nextManagerId,
      permissions: assignment.permissions,
      typeLabel: parsed.data.typeLabel ?? null,
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orgUnitId } = await context.params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  if (!scope || !unitInScope(scope, orgUnitId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.orgUnitAssignment.deleteMany({
    where: { orgUnitId, userId },
  });

  await logPermissionChange({
    targetUserId: userId,
    changedById: session.user.id,
    changeType: "ORG_ADMIN_REVOKED",
    beforeState: { orgUnitId },
    afterState: { orgUnitId: null },
  });

  return NextResponse.json({ ok: true });
}
