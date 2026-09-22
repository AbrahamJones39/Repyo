import { db } from "@/lib/db";
import {
  ADMIN_PERMISSIONS,
  COMPANY_WIDE_ADMIN_PERMISSIONS,
  DEFAULT_ADMIN_SCOPE_PERMISSIONS,
  hasAdminPermission,
  type SessionUser,
} from "@/lib/security/authorization";

export type AdminScope = {
  companyId: string;
  unitIds: string[];
  assignedUnitIds: string[];
  permissions: string[];
  isCompanyWide: boolean;
};

export type OrgUnitNode = {
  id: string;
  parentId: string | null;
  name: string;
  typeLabel: string;
  sortOrder: number;
  children: OrgUnitNode[];
};

export async function ensureCompanyRootOrgUnit(
  companyId: string,
  companyName?: string
): Promise<{ id: string }> {
  const existing = await db.orgUnit.findFirst({
    where: { companyId, parentId: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (existing) return existing;

  const company =
    companyName ??
    (
      await db.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      })
    )?.name ??
    "Company";

  return db.orgUnit.create({
    data: {
      companyId,
      name: company,
      typeLabel: "Company",
      sortOrder: 0,
    },
    select: { id: true },
  });
}

/** Find a unit with this typeLabel in the company, or create one under parentId. */
export async function ensureOrgUnitOfType(params: {
  companyId: string;
  typeLabel: string;
  parentId?: string | null;
  preferUnitId?: string | null;
  scopedUnitIds?: string[];
}): Promise<{ id: string }> {
  const typeLabel = params.typeLabel.trim();
  const inScope = (id: string) =>
    !params.scopedUnitIds || params.scopedUnitIds.includes(id);

  if (params.preferUnitId && inScope(params.preferUnitId)) {
    const preferred = await db.orgUnit.findFirst({
      where: {
        id: params.preferUnitId,
        companyId: params.companyId,
        typeLabel,
      },
      select: { id: true },
    });
    if (preferred) return preferred;
  }

  if (params.parentId) {
    const underParent = await db.orgUnit.findFirst({
      where: {
        companyId: params.companyId,
        typeLabel,
        parentId: params.parentId,
        ...(params.scopedUnitIds ? { id: { in: params.scopedUnitIds } } : {}),
      },
      select: { id: true },
    });
    if (underParent) return underParent;
  }

  const existing = await db.orgUnit.findFirst({
    where: {
      companyId: params.companyId,
      typeLabel,
      ...(params.scopedUnitIds ? { id: { in: params.scopedUnitIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing;

  const parentId =
    params.parentId ?? (await ensureCompanyRootOrgUnit(params.companyId)).id;

  return db.orgUnit.create({
    data: {
      companyId: params.companyId,
      parentId,
      name: typeLabel,
      typeLabel,
    },
    select: { id: true },
  });
}

/** Founding / unassigned company admins were seeing an empty tree because
 *  scope filtered to zero units. Place them on the company root so the
 *  hierarchy is visible and they can add units. */
export async function placeUnassignedAdminOnCompanyRoot(
  user: SessionUser
): Promise<void> {
  if (user.role !== "COMPANY_ADMIN" || !user.companyId) return;

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { orgUnitId: true, adminPermissions: true },
  });

  if (!dbUser) return;

  const homeUnit = dbUser.orgUnitId
    ? await db.orgUnit.findFirst({
        where: { id: dbUser.orgUnitId, companyId: user.companyId },
        select: { id: true },
      })
    : null;
  const assignmentInCompany = await db.orgUnitAssignment.count({
    where: { userId: user.id, orgUnit: { companyId: user.companyId } },
  });
  if (assignmentInCompany > 0 || homeUnit) return;

  const root = await ensureCompanyRootOrgUnit(user.companyId);
  const permissions =
    (dbUser.adminPermissions ?? []).length > 0
      ? dbUser.adminPermissions
      : [...COMPANY_WIDE_ADMIN_PERMISSIONS];

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        orgUnitId: root.id,
        ...((dbUser.adminPermissions ?? []).length === 0
          ? { adminPermissions: [...COMPANY_WIDE_ADMIN_PERMISSIONS] }
          : {}),
      },
    }),
    db.orgUnitAssignment.upsert({
      where: { orgUnitId_userId: { orgUnitId: root.id, userId: user.id } },
      create: {
        orgUnitId: root.id,
        userId: user.id,
        permissions,
      },
      update: {},
    }),
  ]);
}

export async function getDescendantUnitIds(
  companyId: string,
  rootIds: string[]
): Promise<string[]> {
  if (rootIds.length === 0) return [];

  const units = await db.orgUnit.findMany({
    where: { companyId },
    select: { id: true, parentId: true },
  });

  const childrenByParent = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const list = childrenByParent.get(unit.parentId) ?? [];
    list.push(unit.id);
    childrenByParent.set(unit.parentId, list);
  }

  const seen = new Set<string>(rootIds);
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return [...seen];
}

export function flattenOrgUnits(nodes: OrgUnitNode[], depth = 0): {
  id: string;
  name: string;
  typeLabel: string;
  parentId: string | null;
  depth: number;
}[] {
  const rows: {
    id: string;
    name: string;
    typeLabel: string;
    parentId: string | null;
    depth: number;
  }[] = [];
  for (const node of nodes) {
    rows.push({
      id: node.id,
      name: node.name,
      typeLabel: node.typeLabel,
      parentId: node.parentId,
      depth,
    });
    rows.push(...flattenOrgUnits(node.children, depth + 1));
  }
  return rows;
}

export function buildOrgUnitTree(
  units: {
    id: string;
    parentId: string | null;
    name: string;
    typeLabel: string;
    sortOrder: number;
  }[]
): OrgUnitNode[] {
  const nodes = new Map<string, OrgUnitNode>();
  for (const unit of units) {
    nodes.set(unit.id, { ...unit, children: [] });
  }
  const roots: OrgUnitNode[] = [];
  for (const unit of units) {
    const node = nodes.get(unit.id)!;
    if (unit.parentId && nodes.has(unit.parentId)) {
      nodes.get(unit.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortTree = (list: OrgUnitNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    list.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);

  if (roots.length === 0 && nodes.size > 0) {
    const childIds = new Set<string>();
    for (const node of nodes.values()) {
      for (const child of node.children) childIds.add(child.id);
    }
    const orphans = [...nodes.values()].filter((n) => !childIds.has(n.id));
    sortTree(orphans);
    return orphans.length > 0 ? orphans : [...nodes.values()];
  }

  return roots;
}

export function scopeHasPermission(scope: AdminScope | null, permission: string): boolean {
  if (!scope) return false;
  return scope.permissions.includes(permission);
}

export async function resolveAdminScope(user: SessionUser): Promise<AdminScope | null> {
  if (!user.companyId) return null;
  if (user.role === "SUPER_ADMIN") {
    const all = await db.orgUnit.findMany({
      where: { companyId: user.companyId },
      select: { id: true },
    });
    return {
      companyId: user.companyId,
      unitIds: all.map((u) => u.id),
      assignedUnitIds: all.map((u) => u.id),
      permissions: Object.values(ADMIN_PERMISSIONS),
      isCompanyWide: true,
    };
  }
  if (user.role !== "COMPANY_ADMIN") return null;

  const [assignments, home] = await Promise.all([
    db.orgUnitAssignment.findMany({
      where: { userId: user.id },
      select: { orgUnitId: true, permissions: true },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { orgUnitId: true },
    }),
  ]);

  const assignedUnitIds = [
    ...new Set([
      ...assignments.map((a) => a.orgUnitId),
      ...(home?.orgUnitId ? [home.orgUnitId] : []),
    ]),
  ];

  const permissions = new Set<string>(user.adminPermissions ?? []);
  for (const assignment of assignments) {
    assignment.permissions.forEach((p) => permissions.add(p));
  }
  if (permissions.size === 0) {
    DEFAULT_ADMIN_SCOPE_PERMISSIONS.forEach((p) => permissions.add(p));
  }

  if (assignedUnitIds.length === 0) {
    const all = await db.orgUnit.findMany({
      where: { companyId: user.companyId },
      select: { id: true },
    });
    return {
      companyId: user.companyId,
      unitIds: all.map((u) => u.id),
      assignedUnitIds: [],
      permissions: [...permissions],
      isCompanyWide: true,
    };
  }

  const unitIds = await getDescendantUnitIds(user.companyId, assignedUnitIds);
  const companyRoots = await db.orgUnit.findMany({
    where: { companyId: user.companyId, parentId: null },
    select: { id: true },
  });
  const assignedRootSet = new Set(assignedUnitIds);
  const isCompanyWide =
    companyRoots.length > 0 && companyRoots.every((root) => assignedRootSet.has(root.id));

  return {
    companyId: user.companyId,
    unitIds,
    assignedUnitIds,
    permissions: [...permissions],
    isCompanyWide,
  };
}

export async function getDescendantUserIds(
  managerId: string,
  companyId?: string | null
): Promise<string[]> {
  const people = await db.user.findMany({
    where: companyId
      ? { companyId, id: { not: managerId } }
      : { managerId: { not: null } },
    select: { id: true, managerId: true },
  });

  const childrenByManager = new Map<string, string[]>();
  for (const person of people) {
    if (!person.managerId) continue;
    const list = childrenByManager.get(person.managerId) ?? [];
    list.push(person.id);
    childrenByManager.set(person.managerId, list);
  }

  const reports: string[] = [];
  const seen = new Set<string>([managerId]);
  const queue = [managerId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByManager.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        reports.push(child);
        queue.push(child);
      }
    }
  }
  return reports;
}

export async function getDescendantReportIds(
  managerId: string,
  companyId?: string | null
): Promise<string[]> {
  const descendantIds = await getDescendantUserIds(managerId, companyId);
  if (descendantIds.length === 0) return [];
  const reps = await db.user.findMany({
    where: { id: { in: descendantIds }, role: "REP" },
    select: { id: true },
  });
  return reps.map((r) => r.id);
}

export async function getScopedRepIds(
  user: SessionUser,
  scope?: AdminScope | null
): Promise<string[]> {
  const resolved = scope ?? (await resolveAdminScope(user));
  if (!resolved) return [];

  const unitFilter =
    resolved.isCompanyWide
      ? {}
      : resolved.unitIds.length > 0
        ? { orgUnitId: { in: resolved.unitIds } }
        : { id: { in: [] as string[] } };

  const inUnits = resolved.isCompanyWide || resolved.unitIds.length > 0
    ? await db.user.findMany({
        where: {
          companyId: resolved.companyId,
          role: "REP",
          ...unitFilter,
        },
        select: { id: true },
      })
    : [];

  const teamMembers =
    resolved.isCompanyWide || resolved.unitIds.length === 0
      ? []
      : await db.companyTeamMember.findMany({
          where: {
            team: { companyId: resolved.companyId, orgUnitId: { in: resolved.unitIds } },
          },
          select: { userId: true },
        });

  const reports = await getDescendantReportIds(user.id, resolved.companyId);

  return [
    ...new Set([
      ...inUnits.map((u) => u.id),
      ...teamMembers.map((m) => m.userId),
      ...reports,
    ]),
  ];
}

export async function getReportingLadder(userId: string): Promise<
  { id: string; name: string; role: string }[]
> {
  const ladder: { id: string; name: string; role: string }[] = [];
  let currentId: string | null = userId;
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const user: {
      managerId: string | null;
      manager: { id: string; name: string; role: string } | null;
    } | null = await db.user.findUnique({
      where: { id: currentId },
      select: {
        managerId: true,
        manager: { select: { id: true, name: true, role: true } },
      },
    });
    if (!user?.manager) break;
    ladder.push(user.manager);
    currentId = user.manager.id;
  }

  return ladder;
}

export async function assertManagerInCompany(
  managerId: string,
  companyId: string
): Promise<{ id: string; role: string; name: string }> {
  const manager = await db.user.findFirst({
    where: {
      id: managerId,
      companyId,
      role: { in: ["COMPANY_ADMIN", "REP"] },
    },
    select: { id: true, role: true, name: true },
  });
  if (!manager) {
    throw new Error("Manager must be an Admin or Rep in the same company");
  }
  return manager;
}

export async function assertNoManagerCycle(userId: string, managerId: string) {
  const seen = new Set<string>([userId]);
  let current: string | null = managerId;
  while (current) {
    if (seen.has(current)) {
      throw new Error("That manager would create a reporting loop");
    }
    seen.add(current);
    const row: { managerId: string | null } | null = await db.user.findUnique({
      where: { id: current },
      select: { managerId: true },
    });
    current = row?.managerId ?? null;
  }
}

export async function requireRepManager(params: {
  managerId?: string | null;
  companyId: string;
}): Promise<string> {
  if (!params.managerId) {
    throw new Error("Every rep account must have a designated manager");
  }
  const manager = await assertManagerInCompany(params.managerId, params.companyId);
  return manager.id;
}

export async function assertOrgUnitInCompany(orgUnitId: string, companyId: string) {
  const unit = await db.orgUnit.findFirst({
    where: { id: orgUnitId, companyId },
    select: { id: true, parentId: true, name: true },
  });
  if (!unit) throw new Error("Organizational unit not found in this company");
  return unit;
}

export async function userIsInAdminScope(
  user: SessionUser,
  targetUserId: string,
  scope?: AdminScope | null
): Promise<boolean> {
  const resolved = scope ?? (await resolveAdminScope(user));
  if (!resolved) return false;
  if (targetUserId === user.id) return true;
  if (resolved.isCompanyWide) {
    const target = await db.user.findFirst({
      where: { id: targetUserId, companyId: resolved.companyId },
      select: { id: true },
    });
    return Boolean(target);
  }
  const scopedReps = await getScopedRepIds(user, resolved);
  if (scopedReps.includes(targetUserId)) return true;
  const descendants = await getDescendantUserIds(user.id, resolved.companyId);
  if (descendants.includes(targetUserId)) return true;
  const target = await db.user.findFirst({
    where: {
      id: targetUserId,
      companyId: resolved.companyId,
      orgUnitId: { in: resolved.unitIds },
    },
    select: { id: true },
  });
  return Boolean(target);
}

export function canViewOperationalMetrics(user: SessionUser, scope: AdminScope | null): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (!scope) return false;
  return (
    hasAdminPermission(user, ADMIN_PERMISSIONS.VIEW_METRICS) ||
    scopeHasPermission(scope, ADMIN_PERMISSIONS.VIEW_METRICS) ||
    hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_REQUESTS) ||
    scopeHasPermission(scope, ADMIN_PERMISSIONS.MANAGE_REQUESTS)
  );
}

export function canManageOrgStructure(user: SessionUser, scope: AdminScope | null): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "COMPANY_ADMIN" && scope?.isCompanyWide) return true;
  if (!scope) return false;
  return (
    hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_ORG_UNITS) ||
    scopeHasPermission(scope, ADMIN_PERMISSIONS.MANAGE_ORG_UNITS)
  );
}

export function unitInScope(scope: AdminScope, orgUnitId: string): boolean {
  return scope.isCompanyWide || scope.unitIds.includes(orgUnitId);
}
