import { db } from "@/lib/db";
import type { Role, TeamCalendarVisibility } from "@prisma/client";
import { hasAdminPermission, ADMIN_PERMISSIONS } from "@/lib/security/authorization";

export type TeamScopeUser = {
  id: string;
  role: Role;
  companyId: string | null;
  adminPermissions?: string[];
};

export async function getRepTeamIds(userId: string): Promise<string[]> {
  const memberships = await db.companyTeamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

export async function getManagedTeamIds(user: TeamScopeUser): Promise<string[]> {
  if (!user.companyId) return [];

  if (user.role === "SUPER_ADMIN") {
    const teams = await db.companyTeam.findMany({
      where: { companyId: user.companyId },
      select: { id: true },
    });
    return teams.map((t) => t.id);
  }

  const managed = await db.companyTeam.findMany({
    where: { managerUserId: user.id, companyId: user.companyId },
    select: { id: true },
  });

  if (managed.length > 0) return managed.map((t) => t.id);

  if (user.role === "COMPANY_ADMIN") {
    const { resolveAdminScope } = await import("@/lib/org-scope");
    const scope = await resolveAdminScope(user);
    if (
      scope &&
      (hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_TEAMS) ||
        hasAdminPermission(user, ADMIN_PERMISSIONS.VIEW_TEAM_CALENDAR))
    ) {
      const teams = await db.companyTeam.findMany({
        where: {
          companyId: user.companyId,
          ...(scope.isCompanyWide ? {} : { orgUnitId: { in: scope.unitIds } }),
        },
        select: { id: true },
      });
      return teams.map((t) => t.id);
    }
  }

  return [];
}

export async function isTeamManager(
  user: TeamScopeUser,
  teamId: string
): Promise<boolean> {
  const managed = await getManagedTeamIds(user);
  return managed.includes(teamId);
}

export async function canManageTeam(
  user: TeamScopeUser,
  teamId: string
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  return isTeamManager(user, teamId);
}

/** Managers always see assignments in their scope — independent of calendar visibility. */
export async function canViewAssignmentAsManager(
  user: TeamScopeUser,
  request: { assignedRepId: string | null; teamId: string | null; companyId: string }
): Promise<boolean> {
  if (!request.assignedRepId || user.companyId !== request.companyId) return false;
  if (user.role === "SUPER_ADMIN") return true;

  const managedTeamIds = await getManagedTeamIds(user);
  if (managedTeamIds.length === 0) return false;

  if (request.teamId && managedTeamIds.includes(request.teamId)) return true;

  const repTeams = await db.companyTeamMember.findMany({
    where: {
      userId: request.assignedRepId,
      teamId: { in: managedTeamIds },
    },
    select: { id: true },
  });
  return repTeams.length > 0;
}

/**
 * Team calendar peer visibility — never grants PHI access.
 * Managers bypass this via canViewAssignmentAsManager.
 */
export function canViewOnTeamCalendar(
  user: TeamScopeUser,
  request: {
    assignedRepId: string | null;
    teamCalendarVisibility: TeamCalendarVisibility;
  },
  options: { isManager: boolean; isAssignedRep: boolean }
): boolean {
  if (options.isManager || options.isAssignedRep) return true;
  if (!request.assignedRepId) return false;
  return request.teamCalendarVisibility === "SHARED_WITH_TEAM";
}

export async function resolveRepTeamForAssignment(repUserId: string) {
  const membership = await db.companyTeamMember.findFirst({
    where: { userId: repUserId },
    include: { team: true },
    orderBy: { joinedAt: "asc" },
  });
  return membership?.team ?? null;
}
