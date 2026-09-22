import { db } from "@/lib/db";
import { decryptPHI, encryptPHI } from "@/lib/encryption";
import { emailMatchesApprovedDomain } from "@/lib/verification/email-domain";

export type SsoTenant = {
  kind: "company" | "organization";
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
};

function tenantFromRow(
  kind: "company" | "organization",
  row: {
    id: string;
    name: string;
    ssoIssuer: string | null;
    ssoClientId: string | null;
    ssoClientSecretEnc: string | null;
  }
): SsoTenant | null {
  if (!row.ssoIssuer || !row.ssoClientId || !row.ssoClientSecretEnc) return null;
  return {
    kind,
    id: row.id,
    name: row.name,
    issuer: row.ssoIssuer.replace(/\/$/, ""),
    clientId: row.ssoClientId,
    clientSecret: decryptPHI(row.ssoClientSecretEnc),
  };
}

export async function findSsoTenantByEmail(email: string): Promise<SsoTenant | null> {
  const companies = await db.company.findMany({
    where: { ssoEnabled: true, userVerificationMethod: "SSO" },
    select: {
      id: true,
      name: true,
      approvedEmailDomains: true,
      ssoIssuer: true,
      ssoClientId: true,
      ssoClientSecretEnc: true,
    },
  });
  const company = companies.find((row) =>
    emailMatchesApprovedDomain(email, row.approvedEmailDomains)
  );
  if (company) return tenantFromRow("company", company);

  const organizations = await db.providerOrganization.findMany({
    where: { ssoEnabled: true, userVerificationMethod: "SSO" },
    select: {
      id: true,
      name: true,
      approvedEmailDomains: true,
      ssoIssuer: true,
      ssoClientId: true,
      ssoClientSecretEnc: true,
    },
  });
  const organization = organizations.find((row) =>
    emailMatchesApprovedDomain(email, row.approvedEmailDomains)
  );
  if (organization) return tenantFromRow("organization", organization);
  return null;
}

export async function findSsoTenantById(
  kind: "company" | "organization",
  id: string
): Promise<SsoTenant | null> {
  if (kind === "company") {
    const row = await db.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        ssoIssuer: true,
        ssoClientId: true,
        ssoClientSecretEnc: true,
      },
    });
    return row ? tenantFromRow("company", row) : null;
  }
  const row = await db.providerOrganization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ssoIssuer: true,
      ssoClientId: true,
      ssoClientSecretEnc: true,
    },
  });
  return row ? tenantFromRow("organization", row) : null;
}

export function encryptSsoSecret(secret: string) {
  return encryptPHI(secret);
}

export async function oidcMetadata(issuer: string) {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error("Could not read the identity provider configuration");
  }
  const data = (await response.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    userinfo_endpoint?: string;
  };
  if (!data.authorization_endpoint || !data.token_endpoint) {
    throw new Error("Identity provider configuration is incomplete");
  }
  return data;
}
