import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateMemberScopeSchema, updateRepCredentialSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { toSessionUser } from "@/lib/security/sanitize-request";
import { logPermissionChange } from "@/lib/security/audit";
import {
  assertOrgUnitInCompany,
  requireRepManager,
  resolveAdminScope,
  unitInScope,
  userIsInAdminScope,
} from "@/lib/org-scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);

  const inScope = await userIsInAdminScope(user, id, scope);
  if (!inScope) {
    return NextResponse.json({ error: "Rep not found" }, { status: 404 });
  }

  if (body.managerId !== undefined || body.orgUnitId !== undefined) {
    const parsed = updateMemberScopeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const rep = await db.user.findFirst({
      where: { id, role: "REP", companyId: session.user.companyId ?? undefined },
      select: { id: true, managerId: true, orgUnitId: true, companyId: true },
    });
    if (!rep?.companyId) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    const nextManagerId =
      parsed.data.managerId === undefined
        ? rep.managerId
        : await requireRepManager({
            managerId: parsed.data.managerId,
            companyId: rep.companyId,
          });

    if (!nextManagerId) {
      return NextResponse.json(
        { error: "Every rep account must have a designated manager" },
        { status: 400 }
      );
    }

    let nextOrgUnitId =
      parsed.data.orgUnitId === undefined ? rep.orgUnitId : parsed.data.orgUnitId;
    if (nextOrgUnitId) {
      await assertOrgUnitInCompany(nextOrgUnitId, rep.companyId);
      if (scope && !unitInScope(scope, nextOrgUnitId)) {
        return NextResponse.json({ error: "Unit is outside your scope" }, { status: 403 });
      }
    }

    const updated = await db.user.update({
      where: { id },
      data: { managerId: nextManagerId, orgUnitId: nextOrgUnitId },
      select: {
        id: true,
        managerId: true,
        orgUnitId: true,
        manager: { select: { id: true, name: true } },
        homeOrgUnit: { select: { id: true, name: true } },
      },
    });

    await logPermissionChange({
      targetUserId: id,
      changedById: session.user.id,
      changeType: "MANAGER_CHANGED",
      beforeState: { managerId: rep.managerId, orgUnitId: rep.orgUnitId },
      afterState: { managerId: nextManagerId, orgUnitId: nextOrgUnitId },
    });

    return NextResponse.json(updated);
  }

  const parsed = updateRepCredentialSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const rep = await db.user.findFirst({
    where: { id, role: "REP", companyId: session.user.companyId ?? undefined },
    include: { repProfile: true },
  });

  if (!rep) {
    return NextResponse.json({ error: "Rep not found" }, { status: 404 });
  }

  const before = { credentialStatus: rep.repProfile?.credentialStatus };

  const updated = await db.repProfile.update({
    where: { userId: id },
    data: { credentialStatus: parsed.data.credentialStatus },
  });

  await logPermissionChange({
    targetUserId: id,
    changedById: session.user.id,
    changeType: "CREDENTIAL_STATUS_CHANGED",
    beforeState: before,
    afterState: { credentialStatus: parsed.data.credentialStatus },
  });

  return NextResponse.json(updated);
}
