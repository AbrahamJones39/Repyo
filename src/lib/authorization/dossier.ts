import { db } from "@/lib/db";
import {
  AUTHORIZATION_SOURCE_LABELS,
  emailDomainLabel,
  formatVerificationMethod,
  GRANT_TYPE_LABELS,
  VERIFICATION_DECISION_LABELS,
} from "@/lib/authorization/labels";

export type AuthorizationDossier = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    accountState: string;
    verifiedAt: string | null;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  summary: {
    tenantName: string | null;
    tenantType: "organization" | "company" | null;
    verificationMethod: string | null;
    verificationSource: string | null;
    accountStatus: string;
    lastVerified: string | null;
    companyStatus: string;
    authorizationEffective: string | null;
    jobTitle: string | null;
    isOrgAdministrator: boolean;
  };
  territories: {
    label: string;
    source: string;
    note: string;
  }[];
  products: {
    label: string;
    source: string;
    note: string;
  }[];
  grants: {
    id: string;
    grantType: string;
    grantTypeLabel: string;
    source: string;
    sourceLabel: string;
    ownerLabel: string | null;
    grantedByName: string | null;
    organizationName: string | null;
    companyName: string | null;
    permissions: string[];
    grantedAt: string;
    revokedAt: string | null;
    active: boolean;
  }[];
  verificationEvents: {
    id: string;
    email: string;
    verificationMethod: string;
    verificationMethodLabel: string;
    decision: string;
    decisionLabel: string;
    reason: string | null;
    source: string;
    sourceLabel: string;
    organizationName: string | null;
    companyName: string | null;
    createdAt: string;
  }[];
};

function formatTerritoryLabel(t: {
  state: string | null;
  county: string | null;
  zipCode: string | null;
}) {
  const parts = [t.county, t.state, t.zipCode ? `Zip ${t.zipCode}` : null].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(", ") : "Unspecified territory";
}

export async function buildAuthorizationDossier(
  userId: string
): Promise<AuthorizationDossier | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          userVerificationMethod: true,
        },
      },
      providerInfo: {
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              status: true,
              userVerificationMethod: true,
            },
          },
          orgAdminGrantedBy: { select: { id: true, name: true } },
        },
      },
      repProfile: {
        include: { territories: true },
      },
      homeOrgUnit: { select: { name: true } },
    },
  });

  if (!user) return null;

  const [grants, verificationEvents] = await Promise.all([
    db.authorizationGrant.findMany({
      where: { userId },
      include: {
        grantedBy: { select: { name: true } },
        organization: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: { grantedAt: "desc" },
    }),
    db.userVerificationEvent.findMany({
      where: { userId },
      include: {
        organization: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const latestEvent = verificationEvents[0];
  const domain = emailDomainLabel(user.email);

  let tenantName: string | null = null;
  let tenantType: AuthorizationDossier["summary"]["tenantType"] = null;
  let verificationMethod: string | null = null;
  let accountStatus: string = user.accountState;
  let jobTitle: string | null = null;
  let isOrgAdministrator = false;
  let verificationSource: string | null = null;

  if (user.providerInfo) {
    tenantName = user.providerInfo.organization?.name ?? null;
    tenantType = "organization";
    verificationMethod = user.providerInfo.organization?.userVerificationMethod ?? null;
    accountStatus = user.providerInfo.accountStatus;
    jobTitle = user.providerInfo.jobTitle;
    isOrgAdministrator = user.providerInfo.isOrgAdministrator;
    verificationSource =
      user.providerInfo.verificationSource != null
        ? AUTHORIZATION_SOURCE_LABELS[user.providerInfo.verificationSource]
        : latestEvent
          ? AUTHORIZATION_SOURCE_LABELS[latestEvent.source]
          : domain;
  } else if (user.company) {
    tenantName = user.company.name;
    tenantType = "company";
    verificationMethod = user.company.userVerificationMethod;
    if (user.repProfile) {
      accountStatus = user.repProfile.credentialStatus;
    }
    verificationSource = latestEvent
      ? AUTHORIZATION_SOURCE_LABELS[latestEvent.source]
      : domain;
  }

  if (
    verificationSource &&
    latestEvent?.verificationMethod === "APPROVED_EMAIL_DOMAIN"
  ) {
    verificationSource = domain;
  }

  const lastVerified =
    user.verifiedAt?.toISOString() ??
    user.providerInfo?.identityVerifiedAt?.toISOString() ??
    null;

  const labelOf = (metadata: unknown) => {
    if (metadata && typeof metadata === "object" && "label" in metadata) {
      const label = (metadata as { label?: unknown }).label;
      return typeof label === "string" ? label : "";
    }
    return "";
  };
  const effectiveOf = (metadata: unknown, grantedAt: Date) => {
    if (metadata && typeof metadata === "object" && "effectiveAt" in metadata) {
      const value = (metadata as { effectiveAt?: unknown }).effectiveAt;
      if (typeof value === "string") return value;
    }
    return grantedAt.toISOString();
  };
  const shortDate = (iso: string) => {
    const date = new Date(iso);
    return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`;
  };

  const activeGrants = grants.filter((grant) => grant.revokedAt == null);
  const territoryGrants = activeGrants.filter((grant) => grant.grantType === "TERRITORY");
  const productGrants = activeGrants.filter((grant) => grant.grantType === "PRODUCT");

  const territories =
    territoryGrants.length > 0
      ? territoryGrants.map((grant) => {
          const effective = effectiveOf(grant.metadata, grant.grantedAt);
          return {
            label: labelOf(grant.metadata) || "Territory",
            source: grant.ownerLabel || grant.grantedBy?.name || "Administrator grant",
            note: `Authorization effective ${shortDate(effective)}`,
          };
        })
      : user.homeOrgUnit
        ? [
            {
              label: user.homeOrgUnit.name,
              source: "Organization assignment",
              note: "Owner is recorded when an administrator assigns this unit.",
            },
          ]
        : (user.repProfile?.territories.map((t) => ({
            label: formatTerritoryLabel(t),
            source: "Rep profile",
            note: "Owner is recorded when an administrator assigns a territory.",
          })) ?? []);

  const products =
    productGrants.length > 0
      ? productGrants.map((grant) => {
          const effective = effectiveOf(grant.metadata, grant.grantedAt);
          return {
            label: labelOf(grant.metadata) || "Product",
            source: grant.ownerLabel || grant.grantedBy?.name || "Administrator grant",
            note: `Authorization effective ${shortDate(effective)}`,
          };
        })
      : (user.repProfile?.products.map((product) => ({
          label: product,
          source: user.company?.name ?? "Company",
          note: "Owner is recorded when products are saved by an administrator.",
        })) ?? []);

  const authorizationEffective =
    [...territoryGrants, ...productGrants]
      .map((grant) => effectiveOf(grant.metadata, grant.grantedAt))
      .sort()[0] ?? lastVerified;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountState: user.accountState,
      verifiedAt: user.verifiedAt?.toISOString() ?? null,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    summary: {
      tenantName,
      tenantType,
      verificationMethod: verificationMethod
        ? formatVerificationMethod(verificationMethod)
        : null,
      verificationSource,
      accountStatus,
      lastVerified,
      companyStatus: user.accountState === "VERIFIED" ? "Verified" : user.accountState,
      authorizationEffective,
      jobTitle,
      isOrgAdministrator,
    },
    territories,
    products,
    grants: grants.map((g) => ({
      id: g.id,
      grantType: g.grantType,
      grantTypeLabel: GRANT_TYPE_LABELS[g.grantType] ?? g.grantType,
      source: g.source,
      sourceLabel: AUTHORIZATION_SOURCE_LABELS[g.source],
      ownerLabel: g.ownerLabel,
      grantedByName: g.grantedBy?.name ?? null,
      organizationName: g.organization?.name ?? null,
      companyName: g.company?.name ?? null,
      permissions: g.permissions,
      grantedAt: g.grantedAt.toISOString(),
      revokedAt: g.revokedAt?.toISOString() ?? null,
      active: g.revokedAt == null,
    })),
    verificationEvents: verificationEvents.map((e) => ({
      id: e.id,
      email: e.email,
      verificationMethod: e.verificationMethod,
      verificationMethodLabel: formatVerificationMethod(e.verificationMethod),
      decision: e.decision,
      decisionLabel: VERIFICATION_DECISION_LABELS[e.decision],
      reason: e.reason,
      source: e.source,
      sourceLabel: AUTHORIZATION_SOURCE_LABELS[e.source],
      organizationName: e.organization?.name ?? null,
      companyName: e.company?.name ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
