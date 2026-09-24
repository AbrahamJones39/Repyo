import { db } from "@/lib/db";
import type {
  AuthorizationSource,
  ProviderAccountStatus,
  ProviderOrgStatus,
  UserAccountState,
  UserVerificationMethod,
  VerificationDecision,
} from "@prisma/client";
import { emailMatchesApprovedDomain } from "./email-domain";
import { findActiveDirectoryIdentity } from "./provision";
import { logPermissionChange } from "@/lib/security/audit";
import { recordAuthorizationGrant } from "@/lib/authorization/grants";

export type VerificationContext = {
  userId: string;
  email: string;
  legalName: string;
  organizationId?: string | null;
  companyId?: string | null;
  jobTitle?: string | null;
  facilityId?: string | null;
  invitationToken?: string | null;
  requireManualApproval?: boolean;
};

export type VerificationResult = {
  decision: VerificationDecision;
  accountStatus: ProviderAccountStatus;
  userAccountState: UserAccountState;
  reason: string;
  source: AuthorizationSource;
  unusual: boolean;
};

type TenantVerificationConfig = {
  id: string;
  userVerificationMethod: UserVerificationMethod;
  approvedEmailDomains: string[];
  ssoEnabled: boolean;
  scimEnabled: boolean;
  status?: ProviderOrgStatus | null;
  accessEnabled?: boolean;
};

async function hasPendingInvitation(
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

async function resolvePendingInvitation(
  email: string,
  organizationId?: string | null,
  companyId?: string | null,
  token?: string | null
) {
  const byEmail = await hasPendingInvitation(email, organizationId, companyId);
  if (byEmail) return byEmail;

  if (!token) return null;

  const invitation = await db.platformInvitation.findFirst({
    where: {
      token,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });
  if (!invitation) return null;
  if (organizationId && invitation.organizationId && invitation.organizationId !== organizationId) {
    return null;
  }
  if (companyId && invitation.companyId && invitation.companyId !== companyId) {
    return null;
  }
  return invitation;
}

async function hasRosterEntry(
  email: string,
  organizationId?: string | null,
  companyId?: string | null
) {
  const normalized = email.trim().toLowerCase();
  return db.preapprovedRosterEntry.findFirst({
    where: {
      email: normalized,
      active: true,
      ...(organizationId ? { organizationId } : {}),
      ...(companyId ? { companyId } : {}),
    },
  });
}

function orgIsLive(config: TenantVerificationConfig): boolean {
  if (config.accessEnabled === false) return false;
  if (!config.status) return true;
  return config.status === "ACTIVATED" || config.status === "VERIFIED";
}

export function evaluateVerificationMethod(
  config: TenantVerificationConfig,
  email: string,
  options?: {
    hasInvitation?: boolean;
    hasRosterEntry?: boolean;
    hasDirectoryIdentity?: boolean;
    requireManualApproval?: boolean;
  }
): VerificationResult {
  const domainMatch = emailMatchesApprovedDomain(
    email,
    config.approvedEmailDomains
  );
  const live = orgIsLive(config);
  const unusual = !domainMatch && config.approvedEmailDomains.length > 0;

  switch (config.userVerificationMethod) {
    case "APPROVED_EMAIL_DOMAIN": {
      if (
        domainMatch &&
        live &&
        config.accessEnabled !== false &&
        !options?.requireManualApproval
      ) {
        return {
          decision: "AUTO_APPROVED",
          accountStatus: "ACTIVE",
          userAccountState: "VERIFIED",
          reason: "Email domain matches approved organization domain",
          source: "SIGNUP_VERIFICATION",
          unusual: false,
        };
      }
      if (domainMatch && options?.requireManualApproval) {
        return {
          decision: "PENDING_REVIEW",
          accountStatus: "PENDING_APPROVAL",
          userAccountState: "REGISTERED",
          reason: "Approved domain — pending administrator approval",
          source: "SIGNUP_VERIFICATION",
          unusual: false,
        };
      }
      if (!domainMatch && config.approvedEmailDomains.length > 0) {
        return {
          decision: "REJECTED",
          accountStatus: "LIMITED",
          userAccountState: "REGISTERED",
          reason: "Email domain is not on the approved list for this organization",
          source: "SIGNUP_VERIFICATION",
          unusual: true,
        };
      }
      return {
        decision: "PENDING_REVIEW",
        accountStatus: "PENDING_APPROVAL",
        userAccountState: "REGISTERED",
        reason: "Organization requires manual review",
        source: "SIGNUP_VERIFICATION",
        unusual: true,
      };
    }

    case "EMAIL_DOMAIN_PLUS_ADMIN_APPROVAL": {
      if (!domainMatch && config.approvedEmailDomains.length > 0) {
        return {
          decision: "REJECTED",
          accountStatus: "LIMITED",
          userAccountState: "REGISTERED",
          reason: "Email domain is not approved for this organization",
          source: "SIGNUP_VERIFICATION",
          unusual: true,
        };
      }
      return {
        decision: "PENDING_REVIEW",
        accountStatus: "PENDING_APPROVAL",
        userAccountState: "REGISTERED",
        reason: domainMatch
          ? "Approved domain — pending administrator confirmation"
          : "Pending administrator approval",
        source: "SIGNUP_VERIFICATION",
        unusual: !domainMatch,
      };
    }

    case "INVITATION_ONLY": {
      if (options?.hasInvitation) {
        if (options.requireManualApproval) {
          return {
            decision: "PENDING_REVIEW",
            accountStatus: "PENDING_APPROVAL",
            userAccountState: "REGISTERED",
            reason: "Invitation accepted — pending administrator approval",
            source: "INVITATION",
            unusual: false,
          };
        }
        return {
          decision: live ? "AUTO_APPROVED" : "PENDING_REVIEW",
          accountStatus: live ? "ACTIVE" : "PENDING_APPROVAL",
          userAccountState: live ? "VERIFIED" : "REGISTERED",
          reason: "Valid invitation on file",
          source: "INVITATION",
          unusual: false,
        };
      }
      return {
        decision: "REQUIRES_INVITATION",
        accountStatus: "LIMITED",
        userAccountState: "REGISTERED",
        reason: "This organization requires an invitation to sign up",
        source: "SIGNUP_VERIFICATION",
        unusual: true,
      };
    }

    case "PREAPPROVED_ROSTER": {
      if (options?.hasRosterEntry) {
        return {
          decision: "AUTO_APPROVED",
          accountStatus: "ACTIVE",
          userAccountState: "VERIFIED",
          reason: "User found on preapproved roster",
          source: "ROSTER_IMPORT",
          unusual: false,
        };
      }
      return {
        decision: "PENDING_REVIEW",
        accountStatus: "PENDING_APPROVAL",
        userAccountState: "REGISTERED",
        reason: "User not found on preapproved roster — sent for review",
        source: "SIGNUP_VERIFICATION",
        unusual: true,
      };
    }

    case "SSO":
      return {
        decision: "REQUIRES_INVITATION",
        accountStatus: "LIMITED",
        userAccountState: "REGISTERED",
        reason: "This organization uses SSO — sign in with your organization",
        source: "SSO_PROVISIONING",
        unusual: false,
      };

    case "SCIM":
      return {
        decision: "REQUIRES_INVITATION",
        accountStatus: "LIMITED",
        userAccountState: "REGISTERED",
        reason: "Accounts are provisioned by your organization's directory (SCIM)",
        source: "SCIM_PROVISIONING",
        unusual: false,
      };

    case "API_DIRECTORY_VERIFICATION":
      if (options?.hasDirectoryIdentity) {
        return {
          decision: "AUTO_APPROVED",
          accountStatus: "ACTIVE",
          userAccountState: "VERIFIED",
          reason: "Email matched the organization directory",
          source: "API_DIRECTORY",
          unusual: false,
        };
      }
      return {
        decision: "PENDING_REVIEW",
        accountStatus: "PENDING_APPROVAL",
        userAccountState: "REGISTERED",
        reason: "Not in the organization directory — sent to an administrator",
        source: "API_DIRECTORY",
        unusual: true,
      };

    case "MANUAL_ADMIN_APPROVAL":
    default:
      return {
        decision: "PENDING_REVIEW",
        accountStatus: "PENDING_APPROVAL",
        userAccountState: "REGISTERED",
        reason: "Pending administrator approval",
        source: "SIGNUP_VERIFICATION",
        unusual,
      };
  }
}

export async function verifyProviderSignup(
  context: VerificationContext
): Promise<VerificationResult | null> {
  if (!context.organizationId) return null;

  const org = await db.providerOrganization.findUnique({
    where: { id: context.organizationId },
  });
  if (!org) return null;

  const [invitation, rosterEntry, directoryIdentity] = await Promise.all([
    resolvePendingInvitation(
      context.email,
      org.id,
      null,
      context.invitationToken
    ),
    hasRosterEntry(context.email, org.id),
    findActiveDirectoryIdentity(context.email, org.id, null),
  ]);

  const result = evaluateVerificationMethod(
    {
      id: org.id,
      userVerificationMethod: org.userVerificationMethod,
      approvedEmailDomains: org.approvedEmailDomains,
      ssoEnabled: org.ssoEnabled,
      scimEnabled: org.scimEnabled,
      status: org.status,
      accessEnabled: org.accessEnabled,
    },
    context.email,
    {
      hasInvitation: Boolean(invitation),
      hasRosterEntry: Boolean(rosterEntry),
      hasDirectoryIdentity: Boolean(directoryIdentity),
      requireManualApproval: context.requireManualApproval,
    }
  );

  await applyProviderVerification(context, org.id, org.name, result);

  if (invitation && result.decision === "AUTO_APPROVED") {
    await db.platformInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByUserId: context.userId,
      },
    });
  }

  return result;
}

export async function verifyCompanySignup(
  context: VerificationContext
): Promise<VerificationResult | null> {
  if (!context.companyId) return null;

  const company = await db.company.findUnique({
    where: { id: context.companyId },
  });
  if (!company) return null;

  const [invitation, rosterEntry, directoryIdentity] = await Promise.all([
    resolvePendingInvitation(
      context.email,
      null,
      company.id,
      context.invitationToken
    ),
    hasRosterEntry(context.email, null, company.id),
    findActiveDirectoryIdentity(context.email, null, company.id),
  ]);

  const result = evaluateVerificationMethod(
    {
      id: company.id,
      userVerificationMethod: company.userVerificationMethod,
      approvedEmailDomains: company.approvedEmailDomains,
      ssoEnabled: company.ssoEnabled,
      scimEnabled: company.scimEnabled,
      accessEnabled: company.accessEnabled,
    },
    context.email,
    {
      hasInvitation: Boolean(invitation),
      hasRosterEntry: Boolean(rosterEntry),
      hasDirectoryIdentity: Boolean(directoryIdentity),
      requireManualApproval: context.requireManualApproval,
    }
  );

  await applyCompanyVerification(context, company.id, company.name, result);

  if (invitation && result.decision === "AUTO_APPROVED") {
    await db.platformInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByUserId: context.userId,
      },
    });
  }

  return result;
}

async function applyProviderVerification(
  context: VerificationContext,
  organizationId: string,
  organizationName: string,
  result: VerificationResult
) {
  const now = new Date();

  await db.userVerificationEvent.create({
    data: {
      userId: context.userId,
      email: context.email.trim().toLowerCase(),
      organizationId,
      verificationMethod: (
        await db.providerOrganization.findUnique({
          where: { id: organizationId },
          select: { userVerificationMethod: true },
        })
      )!.userVerificationMethod,
      decision: result.decision,
      reason: result.reason,
      source: result.source,
      metadata: { unusual: result.unusual, jobTitle: context.jobTitle },
    },
  });

  await db.providerProfile.update({
    where: { userId: context.userId },
    data: {
      accountStatus: result.accountStatus,
      verificationDecision: result.decision,
      verificationSource: result.source,
      identityVerifiedAt:
        result.decision === "AUTO_APPROVED" ? now : undefined,
      jobTitle: context.jobTitle ?? undefined,
    },
  });

  if (result.userAccountState === "VERIFIED") {
    await db.user.update({
      where: { id: context.userId },
      data: { accountState: "VERIFIED", verifiedAt: now },
    });
  }

  if (result.decision === "AUTO_APPROVED") {
    await recordAuthorizationGrant({
      userId: context.userId,
      organizationId,
      grantType: "ORG_ACCOUNT_ACCESS",
      source: result.source,
      ownerLabel: organizationName,
      metadata: {
        verificationDecision: result.decision,
        email: context.email,
        facilityId: context.facilityId,
      },
    });
  }

  await logPermissionChange({
    targetUserId: context.userId,
    changedById: context.userId,
    changeType: "USER_VERIFICATION_DECISION",
    beforeState: { accountStatus: "LIMITED" },
    afterState: {
      accountStatus: result.accountStatus,
      decision: result.decision,
      organizationId,
      source: result.source,
    },
    reason: result.reason,
  });
}

async function applyCompanyVerification(
  context: VerificationContext,
  companyId: string,
  companyName: string,
  result: VerificationResult
) {
  const now = new Date();

  await db.userVerificationEvent.create({
    data: {
      userId: context.userId,
      email: context.email.trim().toLowerCase(),
      companyId,
      verificationMethod: (
        await db.company.findUnique({
          where: { id: companyId },
          select: { userVerificationMethod: true },
        })
      )!.userVerificationMethod,
      decision: result.decision,
      reason: result.reason,
      source: result.source,
      metadata: { unusual: result.unusual },
    },
  });

  if (result.userAccountState === "VERIFIED") {
    const rep = await db.user.findUnique({
      where: { id: context.userId },
      select: { role: true, managerId: true },
    });
    if (rep?.role === "REP" && !rep.managerId) {
      throw new Error(
        "Assign a manager before activating this rep so missed requests can be escalated"
      );
    }
    await db.user.update({
      where: { id: context.userId },
      data: { accountState: "VERIFIED", verifiedAt: now },
    });

    await db.repProfile.update({
      where: { userId: context.userId },
      data: { credentialStatus: "ACTIVE" },
    });
  } else if (result.decision === "PENDING_REVIEW") {
    await db.repProfile.update({
      where: { userId: context.userId },
      data: { credentialStatus: "PENDING" },
    });
  }

  if (result.decision === "AUTO_APPROVED") {
    await recordAuthorizationGrant({
      userId: context.userId,
      companyId,
      grantType: "COMPANY_ACCOUNT_ACCESS",
      source: result.source,
      ownerLabel: companyName,
      metadata: {
        verificationDecision: result.decision,
        email: context.email,
      },
    });
  }

  await logPermissionChange({
    targetUserId: context.userId,
    changedById: context.userId,
    changeType: "USER_VERIFICATION_DECISION",
    beforeState: { credentialStatus: "PENDING" },
    afterState: {
      decision: result.decision,
      companyId,
      source: result.source,
    },
    reason: result.reason,
  });
}

export async function approveCompanyUser(
  targetUserId: string,
  approvedById: string,
  companyId: string,
  reason?: string
) {
  const user = await db.user.findFirst({
    where: { id: targetUserId, companyId },
    include: { repProfile: true },
  });
  if (!user) {
    throw new Error("User not found in company");
  }
  if (user.role === "REP" && !user.managerId) {
    throw new Error(
      "Assign a manager before activating this rep so missed requests can be escalated"
    );
  }

  const now = new Date();
  await db.user.update({
    where: { id: targetUserId },
    data: { accountState: "VERIFIED", verifiedAt: now },
  });

  if (user.repProfile) {
    await db.repProfile.update({
      where: { userId: targetUserId },
      data: { credentialStatus: "ACTIVE" },
    });
  }

  await recordAuthorizationGrant({
    userId: targetUserId,
    grantedById: approvedById,
    companyId,
    grantType: "COMPANY_ACCOUNT_ACCESS",
    source: "ADMIN_GRANT",
    metadata: { approvedBy: approvedById },
  });

  await logPermissionChange({
    targetUserId,
    changedById: approvedById,
    changeType: "USER_VERIFICATION_DECISION",
    beforeState: { accountState: user.accountState },
    afterState: { accountState: "VERIFIED", companyId },
    reason: reason ?? "Company administrator approved user access",
  });
}

export async function approveProviderUser(
  targetUserId: string,
  approvedById: string,
  organizationId: string,
  reason?: string
) {
  const profile = await db.providerProfile.findUnique({
    where: { userId: targetUserId },
    include: { organization: true },
  });
  if (!profile || profile.organizationId !== organizationId) {
    throw new Error("Provider not found in organization");
  }

  const before = {
    accountStatus: profile.accountStatus,
    isOrgAdministrator: profile.isOrgAdministrator,
  };

  const now = new Date();
  await db.providerProfile.update({
    where: { userId: targetUserId },
    data: {
      accountStatus: "ACTIVE",
      verificationDecision: "AUTO_APPROVED",
      verificationSource: "ADMIN_GRANT",
      identityVerifiedAt: now,
    },
  });

  await db.user.update({
    where: { id: targetUserId },
    data: { accountState: "VERIFIED", verifiedAt: now },
  });

  await recordAuthorizationGrant({
    userId: targetUserId,
    grantedById: approvedById,
    organizationId,
    grantType: "ORG_ACCOUNT_ACCESS",
    source: "ADMIN_GRANT",
    ownerLabel: profile.organization?.name,
    metadata: { approvedBy: approvedById },
  });

  await logPermissionChange({
    targetUserId,
    changedById: approvedById,
    changeType: "USER_VERIFICATION_DECISION",
    beforeState: before,
    afterState: { accountStatus: "ACTIVE", decision: "AUTO_APPROVED" },
    reason: reason ?? "Administrator approved user access",
  });
}
