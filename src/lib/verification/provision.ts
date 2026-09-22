import { db } from "@/lib/db";
import type { AuthorizationSource, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { recordAuthorizationGrant } from "@/lib/authorization/grants";

type Tenant =
  | { kind: "company"; id: string; name: string }
  | { kind: "organization"; id: string; name: string };

export async function upsertDirectoryIdentity(params: {
  tenant: Tenant;
  email: string;
  name?: string | null;
  externalId?: string | null;
  active?: boolean;
  source: AuthorizationSource;
}) {
  const email = params.email.trim().toLowerCase();
  const where =
    params.tenant.kind === "company"
      ? { companyId: params.tenant.id, email }
      : { organizationId: params.tenant.id, email };

  const existing = await db.directoryIdentity.findFirst({ where });
  const data = {
    email,
    name: params.name?.trim() || null,
    externalId: params.externalId?.trim() || null,
    active: params.active !== false,
    source: params.source,
    syncedAt: new Date(),
    companyId: params.tenant.kind === "company" ? params.tenant.id : null,
    organizationId: params.tenant.kind === "organization" ? params.tenant.id : null,
  };

  if (existing) {
    return db.directoryIdentity.update({ where: { id: existing.id }, data });
  }
  return db.directoryIdentity.create({ data });
}

export async function findActiveDirectoryIdentity(
  email: string,
  organizationId?: string | null,
  companyId?: string | null
) {
  const normalized = email.trim().toLowerCase();
  return db.directoryIdentity.findFirst({
    where: {
      email: normalized,
      active: true,
      ...(organizationId ? { organizationId } : {}),
      ...(companyId ? { companyId } : {}),
    },
  });
}

export async function provisionDirectoryUser(params: {
  tenant: Tenant;
  email: string;
  name: string;
  externalId?: string | null;
  active?: boolean;
  source: AuthorizationSource;
  method: "SCIM" | "SSO" | "API_DIRECTORY_VERIFICATION";
}) {
  const email = params.email.trim().toLowerCase();
  const active = params.active !== false;
  await upsertDirectoryIdentity({
    tenant: params.tenant,
    email,
    name: params.name,
    externalId: params.externalId,
    active,
    source: params.source,
  });

  const existing = await db.user.findUnique({ where: { email } });
  if (!active) {
    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: { disabledAt: new Date(), disableReason: "Removed by directory" },
      });
    }
    return existing;
  }

  const role: Role = params.tenant.kind === "company" ? "REP" : "PROVIDER";
  let managerId: string | null = null;
  if (role === "REP") {
    const admin = await db.user.findFirst({
      where: {
        companyId: params.tenant.id,
        role: "COMPANY_ADMIN",
        disabledAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!admin) {
      throw new Error("A company admin must exist before directory provisioning");
    }
    managerId = existing?.managerId ?? admin.id;
  }

  const now = new Date();
  const user =
    existing ??
    (await db.user.create({
      data: {
        email,
        name: params.name.trim() || email,
        passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 12),
        role,
        companyId: params.tenant.kind === "company" ? params.tenant.id : null,
        managerId,
        emailVerifiedAt: now,
        accountState: "VERIFIED",
        verifiedAt: now,
        ...(role === "REP"
          ? {
              repProfile: {
                create: {
                  credentialStatus: "ACTIVE",
                  products: [],
                  companies: [params.tenant.name],
                },
              },
            }
          : {
              providerInfo: {
                create: {
                  organizationId: params.tenant.id,
                  accountStatus: "ACTIVE",
                  workEmail: email,
                  workEmailVerified: true,
                  identityVerifiedAt: now,
                  verificationDecision: "AUTO_APPROVED",
                  verificationSource: params.source,
                },
              },
            }),
      },
    }));

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: params.name.trim() || existing.name,
        disabledAt: null,
        disableReason: null,
        accountState: "VERIFIED",
        verifiedAt: existing.verifiedAt ?? now,
        emailVerifiedAt: existing.emailVerifiedAt ?? now,
        ...(role === "REP" && !existing.managerId ? { managerId } : {}),
        ...(role === "REP" && params.tenant.kind === "company"
          ? { companyId: params.tenant.id }
          : {}),
      },
    });
    if (role === "REP") {
      await db.repProfile.upsert({
        where: { userId: existing.id },
        create: {
          userId: existing.id,
          credentialStatus: "ACTIVE",
          products: [],
          companies: [params.tenant.name],
        },
        update: { credentialStatus: "ACTIVE" },
      });
    }
  }

  await db.userVerificationEvent.create({
    data: {
      userId: user.id,
      email,
      companyId: params.tenant.kind === "company" ? params.tenant.id : null,
      organizationId: params.tenant.kind === "organization" ? params.tenant.id : null,
      verificationMethod: params.method,
      decision: "AUTO_APPROVED",
      reason: "Matched organization directory",
      source: params.source,
      metadata: { externalId: params.externalId ?? null },
    },
  });

  await recordAuthorizationGrant({
    userId: user.id,
    companyId: params.tenant.kind === "company" ? params.tenant.id : null,
    organizationId: params.tenant.kind === "organization" ? params.tenant.id : null,
    grantType:
      params.tenant.kind === "company" ? "COMPANY_ACCOUNT_ACCESS" : "ORG_ACCOUNT_ACCESS",
    source: params.source,
    ownerLabel: params.tenant.name,
    metadata: { email, externalId: params.externalId ?? null },
  });

  return db.user.findUnique({ where: { id: user.id } });
}
