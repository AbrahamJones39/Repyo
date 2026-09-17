import { db } from "@/lib/db";
import type {
  InvitationChannel,
  InvitationType,
  Prisma,
  Role,
} from "@prisma/client";
import {
  buildInviteUrl,
  generateInviteToken,
  INVITE_LIMITS,
  type InvitationPreconfig,
} from "./constants";
import { logPermissionChange } from "@/lib/security/audit";

export type CreateInvitationInput = {
  invitedById: string;
  inviterRole: Role;
  inviteeEmail?: string | null;
  targetRole: Role;
  invitationType?: InvitationType;
  channel?: InvitationChannel;
  organizationId?: string | null;
  companyId?: string | null;
  teamId?: string | null;
  orgUnitId?: string | null;
  managerId?: string | null;
  adminPermissions?: string[];
  healthcareSiteId?: string | null;
  facilityId?: string | null;
  territoryContext?: InvitationPreconfig["territoryContext"];
  expiryDays?: number;
};

export class InvitationRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationRateLimitError";
  }
}

async function assertRateLimits(input: CreateInvitationInput) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const userCount = await db.platformInvitation.count({
    where: { invitedById: input.invitedById, createdAt: { gte: since } },
  });
  if (userCount >= INVITE_LIMITS.perUserPerDay) {
    throw new InvitationRateLimitError(
      `Daily invitation limit reached (${INVITE_LIMITS.perUserPerDay} per user)`
    );
  }

  if (input.organizationId) {
    const orgCount = await db.platformInvitation.count({
      where: { organizationId: input.organizationId, createdAt: { gte: since } },
    });
    if (orgCount >= INVITE_LIMITS.perOrgPerDay) {
      throw new InvitationRateLimitError(
        `Daily organization invitation limit reached`
      );
    }
  }

  if (input.companyId) {
    const companyCount = await db.platformInvitation.count({
      where: { companyId: input.companyId, createdAt: { gte: since } },
    });
    if (companyCount >= INVITE_LIMITS.perCompanyPerDay) {
      throw new InvitationRateLimitError(
        `Daily company invitation limit reached`
      );
    }
  }
}

export async function createInvitation(input: CreateInvitationInput) {
  await assertRateLimits(input);

  const days = Math.min(
    input.expiryDays ?? INVITE_LIMITS.defaultExpiryDays,
    INVITE_LIMITS.maxExpiryDays
  );
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const token = generateInviteToken();

  const preconfig: InvitationPreconfig = {
    organizationId: input.organizationId ?? undefined,
    companyId: input.companyId ?? undefined,
    teamId: input.teamId ?? undefined,
    orgUnitId: input.orgUnitId ?? undefined,
    managerId: input.managerId ?? undefined,
    healthcareSiteId: input.healthcareSiteId ?? undefined,
    facilityId: input.facilityId ?? undefined,
    territoryContext: input.territoryContext,
    grantsPhiAccess: false,
    adminPermissions: input.targetRole === "COMPANY_ADMIN" ? input.adminPermissions : undefined,
  };

  const invitation = await db.platformInvitation.create({
    data: {
      token,
      invitedById: input.invitedById,
      inviteeEmail: input.inviteeEmail?.trim().toLowerCase() || null,
      targetRole: input.targetRole,
      invitationType: input.invitationType ?? "PEER",
      channel: input.channel ?? "LINK",
      organizationId: input.organizationId ?? null,
      companyId: input.companyId ?? null,
      teamId: input.teamId ?? null,
      orgUnitId: input.orgUnitId ?? null,
      managerId: input.managerId ?? null,
      healthcareSiteId: input.healthcareSiteId ?? null,
      facilityId: input.facilityId ?? null,
      territoryContext: input.territoryContext as Prisma.InputJsonValue | undefined,
      preconfig: preconfig as Prisma.InputJsonValue,
      expiresAt,
    },
    include: {
      organization: { select: { name: true } },
      company: { select: { name: true } },
      team: { select: { name: true } },
      invitedBy: { select: { name: true } },
    },
  });

  return {
    ...invitation,
    inviteUrl: buildInviteUrl(token),
  };
}

export async function validateInvitationToken(token: string) {
  const invitation = await db.platformInvitation.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      healthcareSite: {
        select: { id: true, name: true, city: true, state: true },
      },
      invitedBy: { select: { name: true } },
    },
  });

  if (!invitation) return { valid: false as const, reason: "Invitation not found" };

  if (invitation.status === "REVOKED") {
    return { valid: false as const, reason: "This invitation has been revoked" };
  }
  if (invitation.status === "ACCEPTED") {
    return { valid: false as const, reason: "This invitation has already been used" };
  }
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    if (invitation.status === "PENDING") {
      await db.platformInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    return { valid: false as const, reason: "This invitation has expired" };
  }

  return {
    valid: true as const,
    invitation: {
      id: invitation.id,
      targetRole: invitation.targetRole,
      inviteeEmail: invitation.inviteeEmail,
      organization: invitation.organization,
      company: invitation.company,
      team: invitation.team,
      healthcareSite: invitation.healthcareSite,
      invitedByName: invitation.invitedBy.name,
      expiresAt: invitation.expiresAt.toISOString(),
      preconfig: invitation.preconfig,
    },
  };
}

export async function revokeInvitation(
  invitationId: string,
  revokedById: string
) {
  const invitation = await db.platformInvitation.findUnique({
    where: { id: invitationId },
  });
  if (!invitation) throw new Error("Invitation not found");
  if (invitation.status !== "PENDING") {
    throw new Error("Only pending invitations can be revoked");
  }

  await db.platformInvitation.update({
    where: { id: invitationId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedById,
    },
  });

  await logPermissionChange({
    targetUserId: invitation.invitedById,
    changedById: revokedById,
    changeType: "USER_VERIFICATION_DECISION",
    beforeState: { invitationId, status: "PENDING" },
    afterState: { invitationId, status: "REVOKED" },
    reason: "Invitation revoked before acceptance",
  });
}

export async function acceptInvitation(params: {
  token: string;
  acceptedByUserId: string;
  acceptedEmail: string;
}) {
  const validation = await validateInvitationToken(params.token);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const invitation = await db.platformInvitation.findUnique({
    where: { token: params.token },
  });
  if (!invitation) throw new Error("Invitation not found");

  if (
    invitation.inviteeEmail &&
    invitation.inviteeEmail !== params.acceptedEmail.trim().toLowerCase()
  ) {
    throw new Error("This invitation was sent to a different email address");
  }

  await db.platformInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedByUserId: params.acceptedByUserId,
    },
  });

  return invitation;
}

export async function getInvitationContextForSignup(token: string) {
  const validation = await validateInvitationToken(token);
  if (!validation.valid) return null;
  return validation.invitation;
}

export async function applyInvitationPreconfig(
  userId: string,
  invitation: {
    teamId: string | null;
    healthcareSiteId: string | null;
    organizationId: string | null;
    orgUnitId?: string | null;
    managerId?: string | null;
    targetRole: Role;
    preconfig?: unknown;
  }
) {
  const preconfig = (invitation.preconfig ?? {}) as {
    adminPermissions?: string[];
  };

  if (invitation.managerId || invitation.orgUnitId) {
    await db.user.update({
      where: { id: userId },
      data: {
        ...(invitation.managerId ? { managerId: invitation.managerId } : {}),
        ...(invitation.orgUnitId ? { orgUnitId: invitation.orgUnitId } : {}),
      },
    });
  }

  if (invitation.orgUnitId && invitation.targetRole === "COMPANY_ADMIN") {
    const { DEFAULT_ADMIN_SCOPE_PERMISSIONS } = await import(
      "@/lib/security/authorization"
    );
    await db.orgUnitAssignment.upsert({
      where: {
        orgUnitId_userId: { orgUnitId: invitation.orgUnitId, userId },
      },
      create: {
        orgUnitId: invitation.orgUnitId,
        userId,
        permissions: preconfig.adminPermissions?.length
          ? preconfig.adminPermissions
          : [...DEFAULT_ADMIN_SCOPE_PERMISSIONS],
      },
      update: {
        permissions: preconfig.adminPermissions?.length
          ? preconfig.adminPermissions
          : [...DEFAULT_ADMIN_SCOPE_PERMISSIONS],
      },
    });
  }

  if (invitation.teamId && invitation.targetRole === "REP") {
    await db.companyTeamMember.upsert({
      where: { teamId_userId: { teamId: invitation.teamId, userId } },
      create: { teamId: invitation.teamId, userId },
      update: {},
    });
  }

  if (invitation.healthcareSiteId && invitation.targetRole === "PROVIDER") {
    const { setProviderSites, linkSiteToOrganization } = await import(
      "@/lib/healthcare-sites/service"
    );
    await setProviderSites(userId, [invitation.healthcareSiteId], {
      organizationId: invitation.organizationId,
      primarySiteId: invitation.healthcareSiteId,
    });
    if (invitation.organizationId) {
      await linkSiteToOrganization(
        invitation.organizationId,
        invitation.healthcareSiteId,
        true
      );
    }
  }
}

export async function hasPendingInvitationByEmail(
  email: string,
  organizationId?: string | null,
  companyId?: string | null
) {
  const normalized = email.trim().toLowerCase();
  return db.platformInvitation.findFirst({
    where: {
      inviteeEmail: normalized,
      status: "PENDING",
      expiresAt: { gt: new Date() },
      ...(organizationId ? { organizationId } : {}),
      ...(companyId ? { companyId } : {}),
    },
  });
}
