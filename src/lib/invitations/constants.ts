import { randomBytes } from "crypto";

export const INVITE_LIMITS = {
  perUserPerDay: 25,
  perOrgPerDay: 100,
  perCompanyPerDay: 100,
  defaultExpiryDays: 7,
  maxExpiryDays: 30,
} as const;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildInviteUrl(token: string, baseUrl?: string): string {
  const origin =
    baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/invite/${token}`;
}

/** Invitations must never include PHI — only operational context. */
export type InvitationPreconfig = {
  organizationId?: string;
  companyId?: string;
    teamId?: string;
    orgUnitId?: string;
    managerId?: string;
    adminPermissions?: string[];
    healthcareSiteId?: string;
  facilityId?: string;
  territoryContext?: { state?: string; county?: string; zipCode?: string };
  /** Does not grant PHI — verification policy still applies after signup. */
  grantsPhiAccess?: false;
};
