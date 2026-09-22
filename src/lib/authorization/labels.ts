import type { AuthorizationSource, VerificationDecision } from "@prisma/client";
import { VERIFICATION_METHOD_LABELS } from "@/lib/verification/constants";

export const AUTHORIZATION_SOURCE_LABELS: Record<AuthorizationSource, string> = {
  SIGNUP_VERIFICATION: "Signup verification",
  ADMIN_GRANT: "Administrator grant",
  SSO_PROVISIONING: "SSO provisioning",
  SCIM_PROVISIONING: "SCIM provisioning",
  API_DIRECTORY: "API / directory",
  ROSTER_IMPORT: "Preapproved roster",
  INVITATION: "Platform invitation",
  SUPER_ADMIN: "Platform super admin",
  SYSTEM: "System",
};

export const VERIFICATION_DECISION_LABELS: Record<VerificationDecision, string> = {
  AUTO_APPROVED: "Auto-approved",
  PENDING_REVIEW: "Pending review",
  REJECTED: "Rejected",
  REQUIRES_INVITATION: "Requires invitation",
};

export const GRANT_TYPE_LABELS: Record<string, string> = {
  ORG_ACCOUNT_ACCESS: "Organization account access",
  ORG_ADMINISTRATOR: "Organization administrator",
  COMPANY_ACCOUNT_ACCESS: "Company account access",
  COMPANY_ADMIN_PERMISSION: "Company admin permissions",
  TERRITORY: "Territory",
  PRODUCT: "Product authorization",
};

export function formatVerificationMethod(method: string) {
  return (
    VERIFICATION_METHOD_LABELS[method as keyof typeof VERIFICATION_METHOD_LABELS] ??
    method
  );
}

export function emailDomainLabel(email: string) {
  const at = email.indexOf("@");
  return at >= 0 ? `@${email.slice(at + 1).toLowerCase()}` : email;
}
