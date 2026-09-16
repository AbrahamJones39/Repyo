import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PERMISSIONS,
  DEFAULT_ADMIN_SCOPE_PERMISSIONS,
  hasAdminPermission,
} from "@/lib/security/authorization";
import { logPermissionChange } from "@/lib/security/audit";
import { toSessionUser } from "@/lib/security/sanitize-request";
import {
  resolveAdminScope,
  scopeHasPermission,
  unitInScope,
  userIsInAdminScope,
} from "@/lib/org-scope";
import { orgUnitAssignmentSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orgUnitId } = await context.params;
  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  const canAssign =
    hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_REPS) ||
    scopeHasPermission(scope, ADMIN_PERMISSIONS.MANAGE_REPS);

  if (!scope || !canAssign || !unitInScope(scope, orgUnitId)) {
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
    select: { id: true, role: true, orgUnitId: true },
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

  const permissions =
    parsed.data.permissions && parsed.data.permissions.length > 0
      ? parsed.data.permissions
      : [...DEFAULT_ADMIN_SCOPE_PERMISSIONS];

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
    data: { orgUnitId },
  });

  await logPermissionChange({
    targetUserId: parsed.data.userId,
    changedById: session.user.id,
    changeType: "ORG_UNIT_CHANGED",
    beforeState: { orgUnitId: target.orgUnitId },
    afterState: { orgUnitId, permissions: assignment.permissions },
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
