import { Role } from "@prisma/client";

export const ROLE_ROUTES: Record<Role, string> = {
  PROVIDER: "/provider",
  REP: "/rep",
  COMPANY_ADMIN: "/company",
  SUPER_ADMIN: "/admin",
};

export const ROLE_LABELS: Record<Role, string> = {
  PROVIDER: "Healthcare Provider",
  REP: "Device Representative",
  COMPANY_ADMIN: "Device Team Administrator/Manager",
  SUPER_ADMIN: "Platform Admin",
};

export function canAccessRoute(role: Role, pathname: string): boolean {
  if (role === "SUPER_ADMIN") return true;

  const prefix = ROLE_ROUTES[role];
  return pathname.startsWith(prefix);
}

export function getDefaultRoute(role: Role): string {
  return ROLE_ROUTES[role];
}
