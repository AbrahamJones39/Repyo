import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toSessionUser } from "@/lib/security/sanitize-request";
import {
  canManageOrgStructure,
  resolveAdminScope,
  unitInScope,
} from "@/lib/org-scope";
import { updateOrgUnitSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  if (!scope || !canManageOrgStructure(user, scope) || !unitInScope(scope, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateOrgUnitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  if (parsed.data.parentId === id) {
    return NextResponse.json({ error: "A unit cannot be its own parent" }, { status: 400 });
  }

  if (parsed.data.parentId && !unitInScope(scope, parsed.data.parentId)) {
    return NextResponse.json({ error: "Parent unit is outside your scope" }, { status: 403 });
  }

  const updated = await db.orgUnit.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.typeLabel ? { typeLabel: parsed.data.typeLabel.trim() } : {}),
      ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const user = toSessionUser(session.user);
  const scope = await resolveAdminScope(user);
  if (!scope || !canManageOrgStructure(user, scope) || !unitInScope(scope, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unit = await db.orgUnit.findFirst({
    where: { id, companyId: scope.companyId },
    select: { parentId: true, _count: { select: { children: true } } },
  });
  if (!unit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!unit.parentId) {
    return NextResponse.json(
      { error: "The company root unit cannot be deleted" },
      { status: 400 }
    );
  }
  if (unit._count.children > 0) {
    return NextResponse.json(
      { error: "Move or delete child units first" },
      { status: 400 }
    );
  }

  await db.orgUnit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
