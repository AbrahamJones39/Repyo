import { db } from "@/lib/db";
import {
  linkSiteToOrganization,
  setProviderSites,
  setRepSiteCoverage,
} from "@/lib/healthcare-sites/service";
import { ORGANIZATION_ADMIN_ACKNOWLEDGMENT_VERSION } from "@/lib/legal/organization-admin-acknowledgment";
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/privacy-policy-v2";
import { PROVIDER_USER_AGREEMENT_VERSION } from "@/lib/legal/provider-user-agreement-v2";
import { REP_USER_AGREEMENT_VERSION } from "@/lib/legal/rep-user-agreement-v2";
import { TERMS_OF_USE_VERSION } from "@/lib/legal/terms-of-use-v2";
import {
  acceptInvitation,
  applyInvitationPreconfig,
} from "@/lib/invitations/service";
import { recordAgreementAcceptances } from "@/lib/legal/acceptance";
import {
  ACCOUNT_PRIVACY_SLUGS,
  PROVIDER_ACCEPTANCE_SLUGS,
  authorizationSlugsForRole,
} from "@/lib/legal/documents";
import { syncLegalDocumentsFromCode } from "@/lib/legal/sync-documents";
import type { SignupPayload } from "@/lib/signup/types";
import {
  verifyCompanySignup,
  verifyProviderSignup,
} from "@/lib/verification/user-verification";
import { grantOrgAdministrator as grantOrgAdministratorRole } from "@/lib/authorization/grants";

export async function completeSignup(params: {
  email: string;
  passwordHash: string;
  payload: SignupPayload;
  invitationId?: string | null;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const {
    name,
    role,
    companyId,
    linkedOrganizationId,
    facilityName,
    facilityAddress,
    department,
    zipCode,
    facilityContactName,
    facilityContactPhone,
    requesterPhone,
    requesterFax,
    zipCodeStart,
    zipCodeEnd,
    acceptProviderAuthorization,
    acceptProviderPrivacy,
    acceptOrgAdminAcknowledgment,
    acceptTermsAndPrivacy,
    acceptProviderOrgAuth,
    acceptProviderUserAgreement,
    acceptProviderPhiUse,
    acceptProviderNotEmergency,
    acceptProviderPrivacyAck,
    acceptProviderElectronicComm,
    siteIds = [],
    primarySiteId,
    managerId,
    inviteToken,
    grantOrgAdministrator,
  } = params.payload;

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    throw new Error("An account with this email already exists");
  }

  let organizationName: string | null = null;
  if (linkedOrganizationId) {
    const org = await db.providerOrganization.findUnique({
      where: { id: linkedOrganizationId },
      select: { name: true },
    });
    organizationName = org?.name ?? null;
  }

  let invitationManagerId: string | null = null;
  let invitationOrgUnitId: string | null = null;
  if (inviteToken?.trim()) {
    const pendingInvite = await db.platformInvitation.findFirst({
      where: { token: inviteToken.trim(), status: "PENDING" },
      select: { managerId: true, orgUnitId: true, targetRole: true },
    });
    invitationManagerId = pendingInvite?.managerId ?? null;
    invitationOrgUnitId = pendingInvite?.orgUnitId ?? null;
  }

  if (role === "REP") {
    if (!companyId) {
      throw new Error("Rep accounts must belong to a company");
    }
    const { requireRepManager } = await import("@/lib/org-scope");
    invitationManagerId = await requireRepManager({
      managerId: invitationManagerId ?? managerId,
      companyId,
    });
  }

  const user = await db.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: params.passwordHash,
      role,
      emailVerifiedAt: new Date(),
      companyId: companyId ?? null,
      managerId: invitationManagerId,
      orgUnitId: invitationOrgUnitId,
      ...(role === "COMPANY_ADMIN" && {
        zipCodeStart: zipCodeStart?.trim().slice(0, 5) ?? null,
        zipCodeEnd: zipCodeEnd?.trim().slice(0, 5) ?? null,
      }),
      ...(role === "PROVIDER" && {
        phone: requesterPhone?.trim() || null,
        providerInfo: {
          create: {
            organizationId: linkedOrganizationId,
            accountStatus: "LIMITED",
            onboardingComplete: false,
            onboardingStep: linkedOrganizationId ? 2 : 1,
            isOrgAdministrator: grantOrgAdministrator ?? false,
            facilityName: facilityName?.trim() || null,
            facilityAddress: facilityAddress?.trim() || null,
            facilityContactName: facilityContactName?.trim() || null,
            facilityContactPhone: facilityContactPhone?.trim() || null,
            department: department?.trim() || null,
            zipCode: zipCode?.trim().slice(0, 5) ?? null,
            requesterPhone: requesterPhone?.trim() || null,
            requesterFax: requesterFax?.trim() || null,
            workEmail: normalizedEmail,
          },
        },
      }),
      ...(role === "REP" && {
        repProfile: {
          create: {
            status: "OFF_DUTY",
            credentialStatus: "PENDING",
            products: [],
            companies: companyId
              ? [
                  (
                    await db.company.findUnique({
                      where: { id: companyId },
                      select: { name: true },
                    })
                  )?.name ?? "",
                ].filter(Boolean)
              : [],
          },
        },
      }),
    },
  });

  const legalName = name.trim();

  const providerAcceptedAllSix =
    Boolean(acceptProviderOrgAuth) &&
    Boolean(acceptProviderUserAgreement) &&
    Boolean(acceptProviderPhiUse) &&
    Boolean(acceptProviderNotEmergency) &&
    Boolean(acceptProviderPrivacyAck) &&
    Boolean(acceptProviderElectronicComm);

  const acceptedAgreements =
    role === "PROVIDER"
      ? providerAcceptedAllSix
      : role === "COMPANY_ADMIN"
        ? (Boolean(acceptProviderAuthorization && acceptProviderPrivacy) ||
            Boolean(acceptTermsAndPrivacy)) &&
          Boolean(acceptOrgAdminAcknowledgment)
        : Boolean(acceptProviderAuthorization && acceptProviderPrivacy) ||
          Boolean(acceptTermsAndPrivacy);

  if ((role === "REP" || role === "COMPANY_ADMIN") && siteIds.length > 0) {
    await setRepSiteCoverage(user.id, siteIds);
  }

  if (acceptedAgreements) {
    await syncLegalDocumentsFromCode();
    const slugs =
      role === "PROVIDER"
        ? [...PROVIDER_ACCEPTANCE_SLUGS]
        : [...authorizationSlugsForRole(role), ...ACCOUNT_PRIVACY_SLUGS];
    const coveredSites =
      siteIds.length > 0
        ? await db.healthcareSite.findMany({
            where: { id: { in: siteIds } },
            select: { name: true },
          })
        : [];
    const facilityNames = coveredSites.map((site) => site.name);
    const managerRecord = invitationManagerId
      ? await db.user.findUnique({
          where: { id: invitationManagerId },
          select: { id: true, name: true },
        })
      : null;
    const companyName = companyId
      ? (
          await db.company.findUnique({
            where: { id: companyId },
            select: { name: true },
          })
        )?.name ?? null
      : null;
    const roleAgreementVersion =
      role === "PROVIDER"
        ? PROVIDER_USER_AGREEMENT_VERSION
        : role === "REP"
          ? REP_USER_AGREEMENT_VERSION
          : ORGANIZATION_ADMIN_ACKNOWLEDGMENT_VERSION;

    await recordAgreementAcceptances([...new Set(slugs)], {
      userId: user.id,
      legalName,
      email: normalizedEmail,
      role,
      organizationId: linkedOrganizationId ?? companyId ?? null,
      organizationName: organizationName ?? companyName,
      organizationType:
        role === "PROVIDER"
          ? "HEALTHCARE_ORGANIZATION"
          : "MEDICAL_DEVICE_COMPANY",
      facilityName: facilityNames[0] ?? facilityName?.trim() ?? null,
      facilityNames,
      signatureText: `${legalName} — account signup acceptance`,
      authenticationStatus: "ACCOUNT_CREATED",
      organizationVerificationStatus: "PENDING",
      administratorRole:
        role === "COMPANY_ADMIN" ? "Medical Device Company Administrator" : null,
      permissionsGranted:
        role === "COMPANY_ADMIN" ? ["organization administrator"] : [],
      grantedBy: inviteToken?.trim() ? "INVITATION" : "SIGNUP",
      managerId: managerRecord?.id ?? null,
      managerName: managerRecord?.name ?? null,
      termsVersion: TERMS_OF_USE_VERSION,
      roleAgreementVersion,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      acknowledgmentVersion:
        role === "COMPANY_ADMIN"
          ? ORGANIZATION_ADMIN_ACKNOWLEDGMENT_VERSION
          : null,
    });
  }

  if (
    grantOrgAdministrator &&
    role === "PROVIDER" &&
    linkedOrganizationId
  ) {
    await grantOrgAdministratorRole({
      targetUserId: user.id,
      grantedById: user.id,
      organizationId: linkedOrganizationId,
      reason: "Initial organization administrator at signup",
      source: "SIGNUP_VERIFICATION",
    });
  }

  if (role === "PROVIDER" && linkedOrganizationId) {
    await verifyProviderSignup({
      userId: user.id,
      email: normalizedEmail,
      legalName,
      organizationId: linkedOrganizationId,
      jobTitle: department?.trim() ?? null,
      facilityId: null,
      invitationToken: inviteToken?.trim() ?? null,
      requireManualApproval: params.payload.requireManualApproval,
    });

    await db.organizationAccessRequest.updateMany({
      where: {
        email: normalizedEmail,
        organizationId: linkedOrganizationId,
        status: "PENDING",
      },
      data: { userId: user.id },
    });
  }

  if (role === "PROVIDER" && siteIds.length > 0) {
    await setProviderSites(user.id, siteIds, {
      organizationId: linkedOrganizationId,
      primarySiteId: primarySiteId ?? siteIds[0],
      department: department?.trim() ?? null,
    });
    if (linkedOrganizationId) {
      for (const siteId of siteIds) {
        await linkSiteToOrganization(
          linkedOrganizationId,
          siteId,
          siteId === (primarySiteId ?? siteIds[0])
        );
      }
    }
  }

  if (["REP", "COMPANY_ADMIN"].includes(role) && companyId) {
    await verifyCompanySignup({
      userId: user.id,
      email: normalizedEmail,
      legalName,
      companyId,
      invitationToken: inviteToken?.trim() ?? null,
      requireManualApproval: params.payload.requireManualApproval,
    });
  }

  if (inviteToken?.trim()) {
    try {
      const accepted = await acceptInvitation({
        token: inviteToken.trim(),
        acceptedByUserId: user.id,
        acceptedEmail: normalizedEmail,
      });
      await applyInvitationPreconfig(user.id, accepted);
    } catch {
      const pending = await db.platformInvitation.findFirst({
        where: { token: inviteToken.trim(), status: "PENDING" },
      });
      if (pending) {
        await applyInvitationPreconfig(user.id, pending);
      }
    }
  }

  if (role === "COMPANY_ADMIN" && companyId) {
    const { placeUnassignedAdminOnCompanyRoot } = await import("@/lib/org-scope");
    await placeUnassignedAdminOnCompanyRoot({
      id: user.id,
      role: user.role,
      companyId,
      adminPermissions: user.adminPermissions,
    });
  }

  return user;
}
