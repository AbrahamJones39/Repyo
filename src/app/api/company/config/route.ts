import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAdminPermission, ADMIN_PERMISSIONS } from "@/lib/security/authorization";
import { toSessionUser } from "@/lib/security/sanitize-request";
import { updateCompanySchema } from "@/lib/validations";
import { encryptSsoSecret } from "@/lib/verification/sso";
import { validateAlertTiming } from "@/lib/coverage-alerts";
import { NextResponse } from "next/server";

const companyConfigSelect = {
  id: true,
  name: true,
  forwardEnabled: true,
  forwardTeamMembersOnly: true,
  forwardAllowManagers: true,
  alertFirstReminderMin: true,
  alertSecondReminderMin: true,
  alertEscalateMin: true,
  alertProviderNoticeMin: true,
  onCallDndOverrideEnabled: true,
  userVerificationMethod: true,
  approvedEmailDomains: true,
  ssoEnabled: true,
  scimEnabled: true,
  ssoIssuer: true,
  ssoClientId: true,
  ssoClientSecretEnc: true,
  scimTokenHash: true,
  directoryTokenHash: true,
} as const;

function publicCompanyConfig(company: {
  ssoClientSecretEnc: string | null;
  scimTokenHash: string | null;
  directoryTokenHash: string | null;
  [key: string]: unknown;
}) {
  const { ssoClientSecretEnc, scimTokenHash, directoryTokenHash, ...rest } = company;
  return {
    ...rest,
    ssoSecretSet: Boolean(ssoClientSecretEnc),
    scimTokenSet: Boolean(scimTokenHash),
    directoryTokenSet: Boolean(directoryTokenHash),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: companyConfigSelect,
  });

  return NextResponse.json(company ? publicCompanyConfig(company) : company);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = toSessionUser({
    id: session.user.id,
    role: session.user.role,
    companyId: session.user.companyId,
    adminPermissions: session.user.adminPermissions,
  });

  if (!hasAdminPermission(user, ADMIN_PERMISSIONS.MANAGE_REQUESTS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const current = await db.company.findUnique({
    where: { id: companyId },
    select: {
      alertFirstReminderMin: true,
      alertSecondReminderMin: true,
      alertEscalateMin: true,
      alertProviderNoticeMin: true,
    },
  });
  if (
    parsed.data.alertFirstReminderMin !== undefined ||
    parsed.data.alertSecondReminderMin !== undefined ||
    parsed.data.alertEscalateMin !== undefined ||
    parsed.data.alertProviderNoticeMin !== undefined
  ) {
    const timingError = validateAlertTiming({
      firstReminderMin: parsed.data.alertFirstReminderMin ?? current?.alertFirstReminderMin ?? 2,
      secondReminderMin:
        parsed.data.alertSecondReminderMin ?? current?.alertSecondReminderMin ?? 5,
      escalateMin: parsed.data.alertEscalateMin ?? current?.alertEscalateMin ?? 10,
      providerNoticeMin:
        parsed.data.alertProviderNoticeMin ?? current?.alertProviderNoticeMin ?? 15,
    });
    if (timingError) {
      return NextResponse.json({ error: timingError }, { status: 400 });
    }
  }

  const data = {
    ...(parsed.data.forwardEnabled !== undefined
      ? { forwardEnabled: parsed.data.forwardEnabled }
      : {}),
    ...(parsed.data.forwardTeamMembersOnly !== undefined
      ? { forwardTeamMembersOnly: parsed.data.forwardTeamMembersOnly }
      : {}),
    ...(parsed.data.forwardAllowManagers !== undefined
      ? { forwardAllowManagers: parsed.data.forwardAllowManagers }
      : {}),
    ...(parsed.data.alertFirstReminderMin !== undefined
      ? { alertFirstReminderMin: parsed.data.alertFirstReminderMin }
      : {}),
    ...(parsed.data.alertSecondReminderMin !== undefined
      ? { alertSecondReminderMin: parsed.data.alertSecondReminderMin }
      : {}),
    ...(parsed.data.alertEscalateMin !== undefined
      ? { alertEscalateMin: parsed.data.alertEscalateMin }
      : {}),
    ...(parsed.data.alertProviderNoticeMin !== undefined
      ? { alertProviderNoticeMin: parsed.data.alertProviderNoticeMin }
      : {}),
    ...(parsed.data.onCallDndOverrideEnabled !== undefined
      ? { onCallDndOverrideEnabled: parsed.data.onCallDndOverrideEnabled }
      : {}),
    ...(parsed.data.userVerificationMethod !== undefined
      ? { userVerificationMethod: parsed.data.userVerificationMethod }
      : {}),
    ...(parsed.data.approvedEmailDomains !== undefined
      ? {
          approvedEmailDomains: parsed.data.approvedEmailDomains.map((d: string) =>
            d.trim().toLowerCase().replace(/^@/, "")
          ),
        }
      : {}),
    ...(parsed.data.userVerificationMethod === "SSO" ? { ssoEnabled: true } : {}),
    ...(parsed.data.userVerificationMethod &&
    parsed.data.userVerificationMethod !== "SSO"
      ? { ssoEnabled: false }
      : {}),
    ...(parsed.data.userVerificationMethod === "SCIM" ? { scimEnabled: true } : {}),
    ...(parsed.data.userVerificationMethod &&
    parsed.data.userVerificationMethod !== "SCIM"
      ? { scimEnabled: false }
      : {}),
    ...(parsed.data.ssoIssuer !== undefined
      ? { ssoIssuer: parsed.data.ssoIssuer.trim() || null }
      : {}),
    ...(parsed.data.ssoClientId !== undefined
      ? { ssoClientId: parsed.data.ssoClientId.trim() || null }
      : {}),
    ...(parsed.data.ssoClientSecret
      ? { ssoClientSecretEnc: encryptSsoSecret(parsed.data.ssoClientSecret) }
      : {}),
  };

  const company = await db.company.update({
    where: { id: companyId },
    data,
    select: companyConfigSelect,
  });

  return NextResponse.json(publicCompanyConfig(company));
}
