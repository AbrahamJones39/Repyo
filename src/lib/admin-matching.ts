import { db } from "./db";
import { listCompanyCoveredSites } from "./facility-routing";

type MatchedAdmin = {
  id: string;
  name: string;
  delegatedRepId: string | null;
  delegationActive: boolean;
};

export async function findMatchingAdmin(
  companyId: string,
  site: { id?: string | null; lat: number | null; lng: number | null } | null
): Promise<MatchedAdmin | null> {
  // Auto-routing is a site-specific company decision. Do not route to an
  // administrator merely because they cover a nearby facility.
  if (!site?.id) return null;

  const admins = await db.user.findMany({
    where: {
      role: "COMPANY_ADMIN",
      companyId,
      accountState: "VERIFIED",
      disabledAt: null,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      delegatedRepId: true,
      delegationActive: true,
    },
  });
  if (admins.length === 0) return null;

  const covered = (await listCompanyCoveredSites(companyId)).filter(
    (row) => row.role === "COMPANY_ADMIN" && row.site.id === site.id
  );
  const coveringIds = new Set(covered.map((row) => row.userId));
  const match = admins.find((admin) => coveringIds.has(admin.id));
  if (!match) return null;

  return {
    id: match.id,
    name: match.name,
    delegatedRepId: match.delegatedRepId,
    delegationActive: match.delegationActive,
  };
}

export async function getDelegatedAdminIdsForRep(repId: string): Promise<string[]> {
  const admins = await db.user.findMany({
    where: {
      role: "COMPANY_ADMIN",
      delegationActive: true,
      delegatedRepId: repId,
    },
    select: { id: true },
  });

  return admins.map((a) => a.id);
}

export async function canActAsAdminForRequest(
  userId: string,
  role: string,
  assignedAdminId: string | null
): Promise<boolean> {
  if (role === "COMPANY_ADMIN" && assignedAdminId === userId) return true;
  if (role !== "REP" || !assignedAdminId) return false;

  const admin = await db.user.findFirst({
    where: {
      id: assignedAdminId,
      role: "COMPANY_ADMIN",
      delegationActive: true,
      delegatedRepId: userId,
    },
  });

  return !!admin;
}
