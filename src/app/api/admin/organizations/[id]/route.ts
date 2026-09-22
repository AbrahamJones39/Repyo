import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSsoSecret } from "@/lib/verification/sso";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (body.status) data.status = body.status;
  if (body.complianceMode) data.complianceMode = body.complianceMode;
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail;
  if (body.userVerificationMethod) {
    data.userVerificationMethod = body.userVerificationMethod;
    data.ssoEnabled = body.userVerificationMethod === "SSO";
    data.scimEnabled = body.userVerificationMethod === "SCIM";
  }
  if (body.approvedEmailDomains !== undefined) {
    data.approvedEmailDomains = Array.isArray(body.approvedEmailDomains)
      ? body.approvedEmailDomains.map((d: string) =>
          d.trim().toLowerCase().replace(/^@/, "")
        )
      : [];
  }
  if (body.ssoEnabled !== undefined && !body.userVerificationMethod) {
    data.ssoEnabled = Boolean(body.ssoEnabled);
  }
  if (body.scimEnabled !== undefined && !body.userVerificationMethod) {
    data.scimEnabled = Boolean(body.scimEnabled);
  }
  if (body.ssoIssuer !== undefined) data.ssoIssuer = String(body.ssoIssuer).trim() || null;
  if (body.ssoClientId !== undefined) data.ssoClientId = String(body.ssoClientId).trim() || null;
  if (typeof body.ssoClientSecret === "string" && body.ssoClientSecret.trim()) {
    data.ssoClientSecretEnc = encryptSsoSecret(body.ssoClientSecret.trim());
  }

  if (body.status === "VERIFIED" && !body.skipVerifiedAt) {
    data.verifiedAt = new Date();
  }
  if (body.baaExecuted) data.baaExecutedAt = new Date();
  if (body.orgAgreement) data.orgAgreementAt = new Date();
  if (body.phiEnabled) {
    data.phiEnabledAt = new Date();
    data.complianceMode = "PHI_ENABLED";
    data.status = "ACTIVATED";
  }

  const org = await db.providerOrganization.update({
    where: { id },
    data,
  });

  if (body.phiEnabled) {
    await db.providerProfile.updateMany({
      where: {
        organizationId: id,
        onboardingComplete: true,
        termsAcceptedAt: { not: null },
      },
      data: { accountStatus: "ACTIVE" },
    });
  }

  const {
    ssoClientSecretEnc: _secret,
    scimTokenHash: _scim,
    directoryTokenHash: _directory,
    ...safe
  } = org;
  return NextResponse.json({
    ...safe,
    ssoSecretSet: Boolean(_secret),
    scimTokenSet: Boolean(_scim),
    directoryTokenSet: Boolean(_directory),
  });
}
