"use server";

import { signIn } from "@/lib/auth";
import { canAccessRoute, getDefaultRoute } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  evaluateVerificationMethod,
} from "@/lib/verification/user-verification";
import {
  validateInvitationToken,
} from "@/lib/invitations/service";
import { sendSignupConfirmationEmail } from "@/lib/email/send-confirmation";
import { resolveInviteSignupRequirements } from "@/lib/signup/invite-requirements";
import { createPendingSignup } from "@/lib/signup/pending-signup";
import type { SignupPayload } from "@/lib/signup/types";
import { signupSchema } from "@/lib/validations";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    companyId: formData.get("companyId") || undefined,
    facilityName: formData.get("facilityName") || undefined,
    facilityAddress: formData.get("facilityAddress") || undefined,
    department: formData.get("department") || undefined,
    zipCode: formData.get("zipCode") || undefined,
    facilityContactName: formData.get("facilityContactName") || undefined,
    facilityContactPhone: formData.get("facilityContactPhone") || undefined,
    requesterPhone: formData.get("requesterPhone") || undefined,
    requesterFax: formData.get("requesterFax") || undefined,
    zipCodeStart: formData.get("zipCodeStart") || undefined,
    zipCodeEnd: formData.get("zipCodeEnd") || undefined,
    organizationId: formData.get("organizationId") || undefined,
    requestedOrgName: formData.get("requestedOrgName") || undefined,
    requestOrgAccess: formData.get("requestOrgAccess") === "true" || undefined,
    acceptProviderAuthorization:
      formData.get("acceptProviderAuthorization") === "true" || undefined,
    acceptProviderPrivacy:
      formData.get("acceptProviderPrivacy") === "true" || undefined,
    acceptOrgAdminAcknowledgment:
      formData.get("acceptOrgAdminAcknowledgment") === "true" || undefined,
    acceptTermsAndPrivacy:
      formData.get("acceptTermsAndPrivacy") === "true" || undefined,
    acceptProviderOrgAuth:
      formData.get("acceptProviderOrgAuth") === "true" || undefined,
    acceptProviderUserAgreement:
      formData.get("acceptProviderUserAgreement") === "true" || undefined,
    acceptProviderPhiUse:
      formData.get("acceptProviderPhiUse") === "true" || undefined,
    acceptProviderNotEmergency:
      formData.get("acceptProviderNotEmergency") === "true" || undefined,
    acceptProviderPrivacyAck:
      formData.get("acceptProviderPrivacyAck") === "true" || undefined,
    acceptProviderElectronicComm:
      formData.get("acceptProviderElectronicComm") === "true" || undefined,
    siteIds: formData.get("siteIds") || undefined,
    primarySiteId: formData.get("primarySiteId") || undefined,
    inviteToken: formData.get("inviteToken") || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Validation failed";
    return { error: firstIssue };
  }

  const {
    name,
    email,
    password,
    role,
    companyId,
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
    organizationId,
    requestedOrgName,
    requestOrgAccess,
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
    siteIds: siteIdsRaw,
    primarySiteId,
    inviteToken,
  } = parsed.data;

  let siteIds: string[] = [];
  if (typeof siteIdsRaw === "string" && siteIdsRaw.trim()) {
    try {
      const parsedIds = JSON.parse(siteIdsRaw);
      if (Array.isArray(parsedIds)) {
        siteIds = parsedIds.map(String);
      }
    } catch {
      siteIds = siteIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  const normalizedEmail = email.trim().toLowerCase();

  let invitationContext: Awaited<
    ReturnType<typeof validateInvitationToken>
  > | null = null;
  if (inviteToken?.trim()) {
    const validation = await validateInvitationToken(inviteToken.trim());
    if (!validation.valid) {
      return { error: validation.reason };
    }
    if (
      validation.invitation.inviteeEmail &&
      validation.invitation.inviteeEmail !== normalizedEmail
    ) {
      return {
        error: "This invitation was sent to a different email address",
      };
    }
    invitationContext = validation;
  }

  let effectiveRole = role;
  let effectiveOrganizationId = organizationId ?? null;
  let effectiveCompanyId = companyId ?? null;

  if (invitationContext?.valid) {
    const inv = invitationContext.invitation;
    effectiveRole = inv.targetRole as typeof role;
    if (inv.organization?.id) effectiveOrganizationId = inv.organization.id;
    if (inv.company?.id) effectiveCompanyId = inv.company.id;
    if (effectiveRole !== role) {
      return { error: "Account type does not match this invitation" };
    }
  }

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return { error: "An account with this email already exists. Try signing in." };
  }

  if (effectiveCompanyId) {
    const company = await db.company.findFirst({
      where: { id: effectiveCompanyId, active: true },
    });
    if (!company) {
      return { error: "Selected device company not found" };
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const requiresEmailConfirmation =
    Boolean(inviteToken?.trim()) ||
    Boolean(effectiveCompanyId && ["REP", "COMPANY_ADMIN"].includes(effectiveRole)) ||
    Boolean(effectiveOrganizationId && effectiveRole === "PROVIDER");

  let linkedOrganizationId = effectiveOrganizationId;
  let grantOrgAdministrator = false;
  if (role === "PROVIDER" && requestOrgAccess && requestedOrgName?.trim()) {
    grantOrgAdministrator = true;
    const orgName = requestedOrgName.trim();
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const org = await db.providerOrganization.create({
      data: {
        name: orgName,
        slug: `${slug}-${Date.now().toString(36)}`,
        status: "PENDING",
        complianceMode: "STANDARD",
      },
    });
    linkedOrganizationId = org.id;

    await db.organizationAccessRequest.create({
      data: {
        organizationId: org.id,
        requestedOrgName: orgName,
        email: normalizedEmail,
        name: name.trim(),
        facilityName: facilityName?.trim(),
        department: department?.trim(),
        zipCode: zipCode?.trim().slice(0, 5),
        status: "PENDING",
      },
    });
  }

  if (role === "PROVIDER" && linkedOrganizationId) {
    const org = await db.providerOrganization.findUnique({
      where: { id: linkedOrganizationId },
    });
    if (org) {
      const preview = evaluateVerificationMethod(
        {
          id: org.id,
          userVerificationMethod: org.userVerificationMethod,
          approvedEmailDomains: org.approvedEmailDomains,
          ssoEnabled: org.ssoEnabled,
          scimEnabled: org.scimEnabled,
          status: org.status,
          accessEnabled: org.accessEnabled,
        },
        normalizedEmail,
        { hasInvitation: Boolean(invitationContext?.valid) }
      );
      if (preview.decision === "REJECTED") {
        return { error: preview.reason };
      }
      if (
        preview.decision === "REQUIRES_INVITATION" &&
        !invitationContext?.valid
      ) {
        return { error: preview.reason };
      }
    }
  }

  if (["REP", "COMPANY_ADMIN"].includes(role) && effectiveCompanyId) {
    const company = await db.company.findUnique({
      where: { id: effectiveCompanyId },
    });
    if (company) {
      const preview = evaluateVerificationMethod(
        {
          id: company.id,
          userVerificationMethod: company.userVerificationMethod,
          approvedEmailDomains: company.approvedEmailDomains,
          ssoEnabled: company.ssoEnabled,
          scimEnabled: company.scimEnabled,
          accessEnabled: company.accessEnabled,
        },
        normalizedEmail,
        { hasInvitation: Boolean(invitationContext?.valid) }
      );
      if (preview.decision === "REJECTED") {
        return { error: preview.reason };
      }
      if (
        preview.decision === "REQUIRES_INVITATION" &&
        !invitationContext?.valid
      ) {
        return { error: preview.reason };
      }
    }
  }

  if (requiresEmailConfirmation) {
    const requirements = await resolveInviteSignupRequirements({
      email: normalizedEmail,
      companyId: effectiveCompanyId,
      organizationId: linkedOrganizationId,
      invitationId: invitationContext?.valid
        ? (
            await db.platformInvitation.findFirst({
              where: { token: inviteToken?.trim() },
              select: { id: true },
            })
          )?.id
        : null,
    });

    if (!requirements.domainAllowed) {
      return { error: requirements.domainReason ?? "Email domain not approved" };
    }

    const signupPayload: SignupPayload = {
      name: name.trim(),
      role: effectiveRole,
      companyId: effectiveCompanyId,
      organizationId: effectiveOrganizationId,
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
      siteIds,
      primarySiteId,
      inviteToken: inviteToken?.trim() ?? null,
      requireManualApproval: requirements.requireManualApproval,
      grantOrgAdministrator,
    };

    const invitationRecord = inviteToken?.trim()
      ? await db.platformInvitation.findFirst({
          where: { token: inviteToken.trim() },
          select: { id: true },
        })
      : null;

    const { confirmToken } = await createPendingSignup({
      email: normalizedEmail,
      passwordHash,
      payload: signupPayload,
      invitationId: invitationRecord?.id ?? null,
    });

    await sendSignupConfirmationEmail({
      to: normalizedEmail,
      name: name.trim(),
      confirmToken,
    });

    return {
      needsEmailVerification: true,
      email: normalizedEmail,
      pendingApproval: requirements.requireManualApproval,
      approver: requirements.approver,
    };
  }

  const { completeSignup } = await import("@/lib/signup/complete-signup");

  await completeSignup({
    email: normalizedEmail,
    passwordHash,
    payload: {
      name: name.trim(),
      role: effectiveRole,
      companyId: effectiveCompanyId,
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
      siteIds,
      primarySiteId,
      inviteToken: inviteToken?.trim() ?? null,
      grantOrgAdministrator,
    },
  });

  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirectTo:
        effectiveRole === "PROVIDER"
          ? "/provider/onboarding"
          : getDefaultRoute(effectiveRole),
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return {
        error:
          "Account created, but automatic sign-in failed. Please sign in with your email and password.",
      };
    }
    throw error;
  }
}

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const callbackUrl = (formData.get("callbackUrl") as string) || "/";

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Invalid email or password" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password" };
  }

  const safeCallback =
    callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : getDefaultRoute(user.role);

  const redirectTo = canAccessRoute(user.role, safeCallback)
    ? safeCallback
    : getDefaultRoute(user.role);

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw error;
  }

  return null;
}
