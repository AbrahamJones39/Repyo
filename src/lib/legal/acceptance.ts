import { db } from "@/lib/db";
import type { Prisma, Role } from "@prisma/client";
import { randomUUID } from "crypto";
import { headers } from "next/headers";

export type AcceptanceContext = {
  userId: string;
  legalName: string;
  email?: string | null;
  role: Role;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationType?: string | null;
  facilityName?: string | null;
  facilityNames?: string[];
  signatureText?: string;
  authenticationStatus?: string | null;
  organizationVerificationStatus?: string | null;
  administratorRole?: string | null;
  permissionsGranted?: string[];
  grantedBy?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  termsVersion?: string | null;
  roleAgreementVersion?: string | null;
  privacyPolicyVersion?: string | null;
  acknowledgmentVersion?: string | null;
};

export async function recordAgreementAcceptances(
  slugs: string[],
  context: AcceptanceContext
) {
  const documents = await db.legalDocument.findMany({
    where: { slug: { in: slugs }, active: true },
  });

  if (documents.length !== slugs.length) {
    const found = new Set(documents.map((d) => d.slug));
    const missing = slugs.filter((s) => !found.has(s));
    throw new Error(`Missing legal documents: ${missing.join(", ")}`);
  }

  const headerStore = await headers();
  const ipAddress =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    null;
  const userAgent = headerStore.get("user-agent");

  const signature =
    context.signatureText ??
    `${context.legalName} — electronic acceptance ${new Date().toISOString()}`;
  const acceptanceEventId = randomUUID();
  const acceptedAt = new Date().toISOString();

  await db.agreementAcceptance.createMany({
    data: documents.map((doc) => ({
      userId: context.userId,
      documentId: doc.id,
      documentSlug: doc.slug,
      documentVersion: doc.version,
      documentTitle: doc.title,
      legalName: context.legalName,
      role: context.role,
      organizationId: context.organizationId ?? null,
      organizationName: context.organizationName ?? null,
      facilityName: context.facilityName ?? null,
      signatureText: signature,
      ipAddress,
      userAgent,
      metadata: {
        acceptanceMethod: "signup_checkbox",
        platform: "web",
        acceptanceEventId,
        acceptedAt,
        email: context.email ?? null,
        facilityNames: context.facilityNames ?? [],
        organizationType: context.organizationType ?? null,
        authenticationStatus: context.authenticationStatus ?? "ACCOUNT_CREATED",
        organizationVerificationStatus:
          context.organizationVerificationStatus ?? null,
        administratorRole: context.administratorRole ?? null,
        permissionsGranted: context.permissionsGranted ?? [],
        grantedBy: context.grantedBy ?? "SIGNUP",
        managerId: context.managerId ?? null,
        managerName: context.managerName ?? null,
        termsVersion: context.termsVersion ?? null,
        roleAgreementVersion: context.roleAgreementVersion ?? null,
        privacyPolicyVersion: context.privacyPolicyVersion ?? null,
        acknowledgmentVersion: context.acknowledgmentVersion ?? null,
      } as Prisma.InputJsonValue,
    })),
  });
}

export async function userHasRequiredAgreements(
  userId: string,
  role: Role
): Promise<boolean> {
  const { requiredSlugsForRole } = await import("@/lib/legal/documents");
  const required = requiredSlugsForRole(role);
  if (required.length === 0) return true;

  const acceptances = await db.agreementAcceptance.findMany({
    where: {
      userId,
      documentSlug: { in: [...required] },
    },
    select: { documentSlug: true },
  });

  const accepted = new Set(acceptances.map((a) => a.documentSlug));
  return required.every((slug) => accepted.has(slug));
}
