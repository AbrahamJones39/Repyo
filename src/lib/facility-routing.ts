import { db } from "./db";
import { normalizeZip } from "./healthcare-sites/normalize";
import { distanceMiles } from "./utils";

export type SiteSnapshot = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number | null;
  lng: number | null;
};

export type CoverageMatch = "exact" | "nearest" | "uncovered";

export type CoverageTarget = {
  siteId: string | null;
  match: CoverageMatch;
  nearestDistanceMiles?: number;
};

const SITE_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  zipCode: true,
  lat: true,
  lng: true,
} as const;

export async function resolveHealthcareSite(input: {
  healthcareSiteId?: string | null;
  facilityName?: string | null;
  facilityZip?: string | null;
}): Promise<SiteSnapshot | null> {
  if (input.healthcareSiteId) {
    const site = await db.healthcareSite.findUnique({
      where: { id: input.healthcareSiteId },
      select: SITE_SELECT,
    });
    if (site) return site;
  }

  const name = input.facilityName?.trim();
  const zip = input.facilityZip ? normalizeZip(input.facilityZip) : "";
  if (!name || !zip) return null;

  return db.healthcareSite.findFirst({
    where: {
      zipCode: zip,
      name: { equals: name, mode: "insensitive" },
      status: { not: "MERGED" },
    },
    select: SITE_SELECT,
  });
}

export async function listCompanyCoveredSites(companyId: string) {
  const users = await db.user.findMany({
    where: { companyId, role: { in: ["REP", "COMPANY_ADMIN"] } },
    select: { id: true, role: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return [];

  const rows = await db.repSiteCoverage.findMany({
    where: { repUserId: { in: userIds } },
    include: { site: { select: SITE_SELECT } },
  });

  const roleByUser = new Map(users.map((u) => [u.id, u.role]));
  return rows.map((row) => ({
    userId: row.repUserId,
    role: roleByUser.get(row.repUserId) ?? null,
    site: row.site,
  }));
}

export function pickCoverageTargetSite(
  requestSite: { id?: string | null; lat: number | null; lng: number | null } | null,
  coveredSites: { site: SiteSnapshot }[]
): CoverageTarget {
  if (coveredSites.length === 0) {
    return { siteId: requestSite?.id ?? null, match: "uncovered" };
  }

  if (
    requestSite?.id &&
    coveredSites.some((row) => row.site.id === requestSite.id)
  ) {
    return { siteId: requestSite.id, match: "exact" };
  }

  if (requestSite?.lat != null && requestSite?.lng != null) {
    let best: { id: string; distance: number } | null = null;
    const seen = new Set<string>();
    for (const row of coveredSites) {
      if (seen.has(row.site.id)) continue;
      seen.add(row.site.id);
      if (row.site.lat == null || row.site.lng == null) continue;
      const distance = distanceMiles(
        requestSite.lat,
        requestSite.lng,
        row.site.lat,
        row.site.lng
      );
      if (!best || distance < best.distance) {
        best = { id: row.site.id, distance };
      }
    }
    if (best) {
      return {
        siteId: best.id,
        match: "nearest",
        nearestDistanceMiles: best.distance,
      };
    }
  }

  return { siteId: requestSite?.id ?? null, match: "uncovered" };
}

export function coversTargetSite(
  coveredSiteIds: string[],
  target: CoverageTarget
): boolean {
  if (target.match === "uncovered" && !target.siteId) {
    return true;
  }
  if (!target.siteId) return coveredSiteIds.length === 0;
  if (target.match === "uncovered" && coveredSiteIds.length === 0) {
    return true;
  }
  return coveredSiteIds.includes(target.siteId);
}
