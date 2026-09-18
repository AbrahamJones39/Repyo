import type { Role } from "@prisma/client";
import {
  TERMS_OF_USE_CONTENT,
  TERMS_OF_USE_VERSION,
} from "@/lib/legal/terms-of-use-v2";
import {
  PRIVACY_POLICY_CONTENT,
  PRIVACY_POLICY_VERSION,
} from "@/lib/legal/privacy-policy-v2";
import {
  REP_USER_AGREEMENT_CONTENT,
  REP_USER_AGREEMENT_VERSION,
} from "@/lib/legal/rep-user-agreement-v2";
import {
  PROVIDER_USER_AGREEMENT_CONTENT,
  PROVIDER_USER_AGREEMENT_VERSION,
} from "@/lib/legal/provider-user-agreement-v2";

export const LEGAL_DOCUMENT_VERSION = "1.0.0";

export type LegalDocDefinition = {
  slug: string;
  title: string;
  version: string;
  roleScopes: Role[];
  summary: string;
  content: string;
};

export const PROVIDER_REQUIRED_SLUGS = [
  "provider-user-agreement",
  "phi-security-requirements",
  "privacy-policy",
  "terms-of-use",
] as const;

export const REP_REQUIRED_SLUGS = [
  "terms-of-use",
  "privacy-policy",
  "rep-user-agreement",
] as const;

export const COMPANY_ADMIN_REQUIRED_SLUGS = ["terms-of-use", "privacy-policy"] as const;

export function requiredSlugsForRole(role: Role): readonly string[] {
  if (role === "PROVIDER") return PROVIDER_REQUIRED_SLUGS;
  if (role === "REP") return REP_REQUIRED_SLUGS;
  if (role === "COMPANY_ADMIN") return COMPANY_ADMIN_REQUIRED_SLUGS;
  return [];
}

export function userAgreementSlugForRole(role: Role): string {
  if (role === "PROVIDER") return "provider-user-agreement";
  if (role === "REP") return "rep-user-agreement";
  return "terms-of-use";
}

/** Rep/Admin checkbox 1 — authorization, terms, and role-specific user agreement */
export function authorizationSlugsForRole(role: Role): readonly string[] {
  if (role === "PROVIDER") {
    return ["terms-of-use", "provider-user-agreement", "phi-security-requirements"];
  }
  if (role === "REP") {
    return ["terms-of-use", "rep-user-agreement"];
  }
  return ["terms-of-use"];
}

/** Rep/Admin checkbox 2 — privacy policy */
export const ACCOUNT_PRIVACY_SLUGS = ["privacy-policy"] as const;

/**
 * Provider recorded slugs when all six checkboxes are accepted:
 * checkbox 2 → provider-user-agreement, checkbox 5 → privacy-policy,
 * terms-of-use (shown in the Account Agreement box),
 * phi-security-requirements (tied to PHI checkbox 3; not shown as an embed).
 */
export const PROVIDER_ACCEPTANCE_SLUGS = PROVIDER_REQUIRED_SLUGS;

export const PROVIDER_AGREEMENT_FIELD_KEYS = [
  "acceptProviderOrgAuth",
  "acceptProviderUserAgreement",
  "acceptProviderPhiUse",
  "acceptProviderNotEmergency",
  "acceptProviderPrivacyAck",
  "acceptProviderElectronicComm",
] as const;

export type ProviderAgreementFieldKey =
  (typeof PROVIDER_AGREEMENT_FIELD_KEYS)[number];

/** Checkbox 2 → provider-user-agreement; checkbox 3 also records phi-security-requirements */
export const PROVIDER_AUTHORIZATION_SLUGS = [
  "provider-user-agreement",
  "phi-security-requirements",
] as const;

/** Checkbox 5 → privacy-policy; terms-of-use is also recorded because it is shown in the box */
export const PROVIDER_PRIVACY_SLUGS = ["privacy-policy", "terms-of-use"] as const;

export const LEGAL_DOCUMENTS: LegalDocDefinition[] = [
  {
    slug: "provider-user-agreement",
    title: "RepYo Healthcare Provider User Agreement",
    version: PROVIDER_USER_AGREEMENT_VERSION,
    roleScopes: ["PROVIDER"],
    summary:
      "Healthcare Provider User Agreement v2.0 for authorized healthcare personnel using RepYo on behalf of a participating organization.",
    content: PROVIDER_USER_AGREEMENT_CONTENT,
  },
  {
    slug: "phi-security-requirements",
    title: "PHI, Privacy & Security Requirements",
    version: LEGAL_DOCUMENT_VERSION,
    roleScopes: ["PROVIDER"],
    summary:
      "Security and privacy requirements for healthcare providers accessing PHI through RepYo.",
    content: `# PHI, Privacy & Security Requirements

**Version ${LEGAL_DOCUMENT_VERSION} · GoRepYo LLC**

## Scope

These requirements apply when you access or submit protected health information (PHI) through RepYo on behalf of a PHI-enabled healthcare organization.

## Access controls

- PHI is visible only to authorized users after appropriate request workflow states.
- Patient identifiers are not displayed in notifications, alerts, or lock screens.
- Access is logged for audit purposes (who, when, organization context).

## Permitted use

You may use PHI in RepYo only to:

- Request medical device representative support
- Coordinate scheduling and case support with manufacturer representatives
- Complete CRM device lookups when enabled by your organization

## Prohibited conduct

You must not:

- Access PHI for unrelated purposes
- Export or screenshot PHI except as permitted by organizational policy
- Include PHI in free-text fields when not required
- Share request details with unauthorized parties

## Incident reporting

Report suspected breaches, misrouted requests, or unauthorized access immediately to your organization's privacy officer and to RepYo at security@gorepyo.com.

## Organizational agreements

Enterprise HIPAA obligations (including BAA execution) are between your healthcare organization and GoRepYo LLC. This document describes your individual responsibilities as an authorized user.
`,
  },
  {
    slug: "privacy-policy",
    title: "RepYo Privacy Policy",
    version: PRIVACY_POLICY_VERSION,
    roleScopes: ["PROVIDER", "REP", "COMPANY_ADMIN", "SUPER_ADMIN"],
    summary:
      "Privacy Policy v2.0 explaining how GoRepYo collects, uses, discloses, and protects information on the RepYo platform.",
    content: PRIVACY_POLICY_CONTENT,
  },
  {
    slug: "terms-of-use",
    title: "RepYo Terms of Use",
    version: TERMS_OF_USE_VERSION,
    roleScopes: ["PROVIDER", "REP", "COMPANY_ADMIN", "SUPER_ADMIN"],
    summary:
      "Terms of Use v2.0 governing access to the RepYo website, mobile application, and platform.",
    content: TERMS_OF_USE_CONTENT,
  },
  {
    slug: "rep-user-agreement",
    title: "RepYo Medical Device Representative User Agreement",
    version: REP_USER_AGREEMENT_VERSION,
    roleScopes: ["REP"],
    summary:
      "Individual clickwrap agreement for authorized medical device representatives using RepYo.",
    content: REP_USER_AGREEMENT_CONTENT,
  },
];
