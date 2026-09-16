import { db } from "@/lib/db";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
  type SessionUser,
} from "@/lib/security/authorization";

export type AdminScope = {
  companyId: string;
  unitIds: string[];
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
  return roots;
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

  if (assignedUnitIds.length === 0) {
    const all = await db.orgUnit.findMany({
      where: { companyId: user.companyId },
      select: { id: true },
    });
    return {
      companyId: user.companyId,
      unitIds: all.map((u) => u.id),
      permissions: [...permissions],
      isCompanyWide: true,
    };
  }

  const unitIds = await getDescendantUnitIds(user.companyId, assignedUnitIds);
  const companyRoots = await db.orgUnit.count({
    where: { companyId: user.companyId, parentId: null },
  });
  const assignedRoots = await db.orgUnit.count({
    where: { id: { in: assignedUnitIds }, parentId: null },
  });

  return {
    companyId: user.companyId,
    unitIds,
    permissions: [...permissions],
    isCompanyWide: companyRoots > 0 && assignedRoots === companyRoots,
  };
}

export function scopeHasPermission(scope: AdminScope | null, permission: string): boolean {
  if (!scope) return false;
  return scope.permissions.includes(permission);
}

export async function getScopedRepIds(
  user: SessionUser,
  scope?: AdminScope | null
): Promise<string[]> {
  const resolved = scope ?? (await resolveAdminScope(user));
  if (!resolved) return [];

  const inUnits = await db.user.findMany({
    where: {
      companyId: resolved.companyId,
      role: "REP",
      ...(resolved.isCompanyWide || resolved.unitIds.length === 0
        ? {}
        : { orgUnitId: { in: resolved.unitIds } }),
    },
    select: { id: true },
  });

  const teamMembers = resolved.isCompanyWide
    ? []
    : await db.companyTeamMember.findMany({
        where: { team: { companyId: resolved.companyId, orgUnitId: { in: resolved.unitIds } } },
        select: { userId: true },
      });

  const reports = await getDescendantReportIds(user.id);

  return [...new Set([...inUnits.map((u) => u.id), ...teamMembers.map((m) => m.userId), ...reports])];
}

export async function getDescendantReportIds(managerId: string): Promise<string[]> {
  const reports: string[] = [];
  const queue = [managerId];
  const seen = new Set<string>([managerId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = await db.user.findMany({
      where: { managerId: current, role: "REP" },
      select: { id: true },
    });
    for (const child of children) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        reports.push(child.id);
        queue.push(child.id);
      }
    }
  }

  return reports;
}

export async function getReportingLadder(userId: string): Promise<
  { id: string; name: string; role: string }[]
> {
  const ladder: { id: string; name: string; role: string }[] = [];
  let currentId: string | null = userId;
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const user: { managerId: string | null; manager: { id: string; name: string; role: string } | null } | null =
      await db.user.findUnique({
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

export async function userIsInAdminScope(
  user: SessionUser,
  targetUserId: string,
  scope?: AdminScope | null
): Promise<boolean> {
  const resolved = scope ?? (await resolveAdminScope(user));
  if (!resolved) return false;
  if (resolved.isCompanyWide) {
    const target = await db.user.findFirst({
      where: { id: targetUserId, companyId: resolved.companyId },
      select: { id: true },
    });
    return Boolean(target);
  }
  const scopedReps = await getScopedRepIds(user, resolved);
  if (scopedReps.includes(targetUserId)) return true;
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
