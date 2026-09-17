import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateMemberScopeSchema, updateRepCredentialSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { toSessionUser } from "@/lib/security/sanitize-request";
import { logPermissionChange } from "@/lib/security/audit";
import {
  assertManagerInCompany,
  assertOrgUnitInCompany,
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

    const member = await db.user.findFirst({
      where: {
        id,
        role: { in: ["REP", "COMPANY_ADMIN"] },
        companyId: session.user.companyId ?? undefined,
      },
      select: {
        id: true,
        role: true,
        managerId: true,
        orgUnitId: true,
        companyId: true,
      },
    });
    if (!member?.companyId) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    if (parsed.data.managerId === id) {
      return NextResponse.json(
        { error: "A person cannot be their own designated manager" },
        { status: 400 }
      );
    }

    let nextManagerId: string | null =
      parsed.data.managerId === undefined
        ? member.managerId
        : parsed.data.managerId;

    if (nextManagerId) {
      try {
        await assertManagerInCompany(nextManagerId, member.companyId);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid designated manager" },
          { status: 400 }
        );
      }
    }

    if (member.role === "REP" && !nextManagerId) {
      return NextResponse.json(
        { error: "Every rep account must have a designated manager" },
        { status: 400 }
      );
    }

    let nextOrgUnitId =
      parsed.data.orgUnitId === undefined ? member.orgUnitId : parsed.data.orgUnitId;
    if (nextOrgUnitId) {
      await assertOrgUnitInCompany(nextOrgUnitId, member.companyId);
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
      beforeState: { managerId: member.managerId, orgUnitId: member.orgUnitId },
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
