import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAgreementAcceptances } from "@/lib/legal/acceptance";
import { PROVIDER_ACCEPTANCE_SLUGS } from "@/lib/legal/documents";
import { syncLegalDocumentsFromCode } from "@/lib/legal/sync-documents";
import { providerOnboardingSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "PROVIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.providerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: { facilities: true },
      },
      orgFacility: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    step: profile.onboardingStep,
    complete: profile.onboardingComplete,
    organizationId: profile.organizationId,
    facilityId: profile.facilityId,
    workEmail: profile.workEmail,
    organization: profile.organization,
    facility: profile.orgFacility,
    accountStatus: profile.accountStatus,
    termsAcceptedAt: profile.termsAcceptedAt,
    userAgreementAt: profile.userAgreementAt,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "PROVIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = providerOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const userId = session.user.id;

  if (data.step === 1) {
    let organizationId = data.organizationId ?? null;

    if (data.requestNewOrg && data.requestedOrgName?.trim()) {
      const orgName = data.requestedOrgName.trim();
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const existing = await db.providerOrganization.findFirst({
        where: {
          OR: [{ name: { equals: orgName, mode: "insensitive" } }, { slug }],
        },
      });

      const org =
        existing ??
        (await db.providerOrganization.create({
          data: {
            name: orgName,
            slug: `${slug}-${Date.now().toString(36)}`,
            status: "PENDING",
            complianceMode: "STANDARD",
          },
        }));

      organizationId = org.id;

      await db.organizationAccessRequest.create({
        data: {
          organizationId: org.id,
          requestedOrgName: orgName,
          userId,
          email: session.user.email ?? data.workEmail,
          name: session.user.name ?? "Provider",
          facilityName: data.facilityName,
          department: data.department,
          zipCode: data.zipCode,
          status: "PENDING",
        },
      });
    }

    const org = organizationId
      ? await db.providerOrganization.findUnique({ where: { id: organizationId } })
      : null;

    const phiEnabled =
      org?.complianceMode === "PHI_ENABLED" &&
      org?.status === "ACTIVATED" &&
      Boolean(org?.phiEnabledAt);

    await db.providerProfile.update({
      where: { userId },
      data: {
        organizationId,
        workEmail: data.workEmail?.trim() || session.user.email,
        workEmailVerified: true,
        facilityName: data.facilityName?.trim(),
        facilityAddress: data.facilityAddress?.trim(),
        facilityContactName: data.facilityContactName?.trim(),
        facilityContactPhone: data.facilityContactPhone?.trim(),
        department: data.department?.trim(),
        zipCode: data.zipCode?.trim().slice(0, 5),
        requesterPhone: data.requesterPhone?.trim(),
        requesterFax: data.requesterFax?.trim(),
        onboardingStep: 2,
        accountStatus: phiEnabled ? "PENDING_AGREEMENTS" : "LIMITED",
      },
    });

    return NextResponse.json({ step: 2, organizationId, phiEnabled });
  }

  if (data.step === 2) {
    await db.providerProfile.update({
      where: { userId },
      data: {
        facilityId: data.facilityId ?? null,
        onboardingStep: 3,
      },
    });
    return NextResponse.json({ step: 3 });
  }

  if (data.step === 3) {
    const profile = await db.providerProfile.findUnique({
      where: { userId },
      include: { organization: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const acceptedAllSix =
      Boolean(data.acceptProviderOrgAuth) &&
      Boolean(data.acceptProviderUserAgreement) &&
      Boolean(data.acceptProviderPhiUse) &&
      Boolean(data.acceptProviderNotEmergency) &&
      Boolean(data.acceptProviderPrivacyAck) &&
      Boolean(data.acceptProviderElectronicComm);

    if (!acceptedAllSix) {
      return NextResponse.json(
        { error: "You must accept all required RepYo agreements to continue" },
        { status: 400 }
      );
    }

    const phiEnabled =
      profile.organization?.complianceMode === "PHI_ENABLED" &&
      profile.organization?.status === "ACTIVATED" &&
      Boolean(profile.organization?.phiEnabledAt);

    const needsOrgApproval =
      profile.organization?.status === "PENDING" ||
      profile.organization?.status === "VERIFIED";

    await syncLegalDocumentsFromCode();
    await recordAgreementAcceptances([...PROVIDER_ACCEPTANCE_SLUGS], {
      userId,
      legalName: session.user.name ?? "Healthcare Provider",
      role: "PROVIDER",
      organizationId: profile.organizationId,
      organizationName: profile.organization?.name ?? null,
      facilityName: profile.facilityName,
      signatureText: `${session.user.name ?? "Healthcare Provider"} — onboarding acceptance`,
    });

    await db.providerProfile.update({
      where: { userId },
      data: {
        termsAcceptedAt: new Date(),
        userAgreementAt: new Date(),
        onboardingStep: 4,
        onboardingComplete: true,
        accountStatus: needsOrgApproval
          ? "LIMITED"
          : phiEnabled
            ? "ACTIVE"
            : "LIMITED",
      },
    });

    return NextResponse.json({
      complete: true,
      accountStatus: needsOrgApproval ? "LIMITED" : phiEnabled ? "ACTIVE" : "LIMITED",
    });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
