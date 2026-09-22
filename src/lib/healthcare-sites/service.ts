import { db } from "@/lib/db";
import type { HealthcareSiteStatus, Prisma } from "@prisma/client";
import {
  normalizeSiteSlug,
  normalizeZip,
  type HealthcareSiteInput,
} from "./normalize";

export async function findOrCreateHealthcareSite(
  input: HealthcareSiteInput,
  options?: {
    createdById?: string;
    status?: HealthcareSiteStatus;
  }
) {
  const slug = normalizeSiteSlug(input.name, input.city, input.state);
  const zipCode = normalizeZip(input.zipCode);

  const existing = await db.healthcareSite.findUnique({ where: { slug } });
  if (existing) return existing;

  const similar = await db.healthcareSite.findFirst({
    where: {
      zipCode,
      name: { equals: input.name.trim(), mode: "insensitive" },
      status: { not: "MERGED" },
    },
  });
  if (similar) return similar;

  return db.healthcareSite.create({
    data: {
      slug,
      name: input.name.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase().slice(0, 2),
      zipCode,
      phone: input.phone?.trim() || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      siteType: input.siteType ?? "HOSPITAL",
      status: options?.status ?? "PENDING_REVIEW",
      createdById: options?.createdById ?? null,
      verifiedAt: options?.status === "ACTIVE" ? new Date() : null,
    },
  });
}

export async function searchHealthcareSites(params: {
  q?: string;
  state?: string;
  organizationId?: string;
  limit?: number;
}) {
  const limit = Math.min(params.limit ?? 20, 50);
  const q = params.q?.trim();

  let siteIds: string[] | undefined;
  if (params.organizationId) {
    const links = await db.organizationSiteLink.findMany({
      where: { organizationId: params.organizationId },
      select: { siteId: true },
    });
    siteIds = links.map((l) => l.siteId);
    if (siteIds.length === 0) {
      return [];
    }
  }

  const where: Prisma.HealthcareSiteWhereInput = {
    status: "ACTIVE",
    ...(siteIds ? { id: { in: siteIds } } : {}),
    ...(params.state
      ? { state: params.state.trim().toUpperCase().slice(0, 2) }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
            { zipCode: { startsWith: q.replace(/\D/g, "").slice(0, 5) } },
          ],
        }
      : {}),
  };

  return db.healthcareSite.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
      lat: true,
      lng: true,
      siteType: true,
      status: true,
    },
  });
}

export async function linkSiteToOrganization(
  organizationId: string,
  siteId: string,
  isPrimary = false
) {
  return db.organizationSiteLink.upsert({
    where: {
      organizationId_siteId: { organizationId, siteId },
    },
    create: { organizationId, siteId, isPrimary },
    update: { isPrimary },
  });
}

export async function setProviderSites(
  userId: string,
  siteIds: string[],
  options?: {
    organizationId?: string | null;
    primarySiteId?: string | null;
    jobTitle?: string | null;
    department?: string | null;
  }
) {
  const uniqueIds = [...new Set(siteIds.filter(Boolean))];
  const primaryId =
    options?.primarySiteId && uniqueIds.includes(options.primarySiteId)
      ? options.primarySiteId
      : uniqueIds[0] ?? null;

  await db.$transaction([
    db.providerSiteMembership.deleteMany({ where: { userId } }),
    ...uniqueIds.map((siteId) =>
      db.providerSiteMembership.create({
        data: {
          userId,
          siteId,
          organizationId: options?.organizationId ?? null,
          isPrimary: siteId === primaryId,
          jobTitle: options?.jobTitle ?? null,
          department: options?.department ?? null,
        },
      })
    ),
  ]);

  if (primaryId) {
    const site = await db.healthcareSite.findUnique({ where: { id: primaryId } });
    if (site) {
      await db.providerProfile.update({
        where: { userId },
        data: {
          facilityName: site.name,
          facilityAddress: `${site.address}, ${site.city}, ${site.state} ${site.zipCode}`,
          zipCode: site.zipCode,
        },
      });
    }
  }

  return db.providerSiteMembership.findMany({
    where: { userId },
    include: { site: true },
  });
}

export async function setRepSiteCoverage(repUserId: string, siteIds: string[]) {
  const uniqueIds = [...new Set(siteIds.filter(Boolean))];

  await db.$transaction([
    db.repSiteCoverage.deleteMany({ where: { repUserId } }),
    ...uniqueIds.map((siteId) =>
      db.repSiteCoverage.create({
        data: { repUserId, siteId },
      })
    ),
  ]);

  return db.repSiteCoverage.findMany({
    where: { repUserId },
    include: { site: true },
  });
}

export async function importHealthcareSitesFromJson(
  sites: HealthcareSiteInput[],
  options?: { defaultStatus?: HealthcareSiteStatus }
) {
  const imported = [];
  for (const site of sites) {
    const record = await findOrCreateHealthcareSite(site, {
      status: options?.defaultStatus ?? "ACTIVE",
    });
    imported.push(record);
  }
  return imported;
}

const ADMIN_SITE_INCLUDE = {
  createdBy: {
    select: { id: true, name: true, email: true, role: true },
  },
  _count: {
    select: {
      providerMemberships: true,
      repCoverages: true,
      serviceRequests: true,
    },
  },
} satisfies Prisma.HealthcareSiteInclude;

export async function listHealthcareSitesForAdmin() {
  return db.healthcareSite.findMany({
    include: ADMIN_SITE_INCLUDE,
    orderBy: [{ createdAt: "desc" }],
  });
}

export type HealthcareSiteEdits = {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string | null;
  siteType?: HealthcareSiteInput["siteType"];
};

function applySiteEdits(
  current: {
    name: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string | null;
    siteType: HealthcareSiteInput["siteType"] | "HOSPITAL" | "CLINIC" | "SURGERY_CENTER" | "OTHER";
  },
  edits?: HealthcareSiteEdits
) {
  const name = edits?.name?.trim() || current.name;
  const address = edits?.address?.trim() || current.address;
  const city = edits?.city?.trim() || current.city;
  const state = (edits?.state?.trim() || current.state).toUpperCase().slice(0, 2);
  const zipCode = edits?.zipCode ? normalizeZip(edits.zipCode) : current.zipCode;
  const phone =
    edits?.phone === undefined ? current.phone : edits.phone?.trim() || null;
  const siteType = edits?.siteType ?? current.siteType;
  const slug = normalizeSiteSlug(name, city, state);
  return { name, address, city, state, zipCode, phone, siteType, slug };
}

async function uniqueSlug(desired: string, siteId: string) {
  const clash = await db.healthcareSite.findFirst({
    where: { slug: desired, id: { not: siteId } },
    select: { id: true },
  });
  if (!clash) return desired;
  return `${desired}-${siteId.slice(0, 8)}`;
}

export async function approveHealthcareSite(
  siteId: string,
  edits?: HealthcareSiteEdits
) {
  const site = await db.healthcareSite.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Facility not found");
  if (site.status === "MERGED") {
    throw new Error("Merged facilities cannot be approved");
  }

  const next = applySiteEdits(site, edits);
  const slug = await uniqueSlug(next.slug, siteId);

  return db.healthcareSite.update({
    where: { id: siteId },
    data: {
      ...next,
      slug,
      status: "ACTIVE",
      verifiedAt: new Date(),
    },
    include: ADMIN_SITE_INCLUDE,
  });
}

export async function rejectHealthcareSite(siteId: string) {
  const site = await db.healthcareSite.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Facility not found");
  if (site.status === "MERGED") {
    throw new Error("Merged facilities cannot be rejected");
  }

  return db.healthcareSite.update({
    where: { id: siteId },
    data: { status: "REJECTED" },
    include: ADMIN_SITE_INCLUDE,
  });
}

export async function mergeHealthcareSite(sourceId: string, targetId: string) {
  if (sourceId === targetId) {
    throw new Error("Cannot merge a facility into itself");
  }

  const [source, target] = await Promise.all([
    db.healthcareSite.findUnique({ where: { id: sourceId } }),
    db.healthcareSite.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) throw new Error("Facility not found");
  if (target.status === "MERGED" || target.status === "REJECTED") {
    throw new Error("Merge target must be an active or pending facility");
  }

  await db.$transaction(async (tx) => {
    const sourceMemberships = await tx.providerSiteMembership.findMany({
      where: { siteId: sourceId },
    });
    const targetMemberUserIds = new Set(
      (
        await tx.providerSiteMembership.findMany({
          where: { siteId: targetId },
          select: { userId: true },
        })
      ).map((row) => row.userId)
    );
    for (const row of sourceMemberships) {
      if (targetMemberUserIds.has(row.userId)) {
        await tx.providerSiteMembership.delete({ where: { id: row.id } });
      } else {
        await tx.providerSiteMembership.update({
          where: { id: row.id },
          data: { siteId: targetId },
        });
      }
    }

    const sourceCoverages = await tx.repSiteCoverage.findMany({
      where: { siteId: sourceId },
    });
    const targetCoverageRepIds = new Set(
      (
        await tx.repSiteCoverage.findMany({
          where: { siteId: targetId },
          select: { repUserId: true },
        })
      ).map((row) => row.repUserId)
    );
    for (const row of sourceCoverages) {
      if (targetCoverageRepIds.has(row.repUserId)) {
        await tx.repSiteCoverage.delete({ where: { id: row.id } });
      } else {
        await tx.repSiteCoverage.update({
          where: { id: row.id },
          data: { siteId: targetId },
        });
      }
    }

    const sourceLinks = await tx.organizationSiteLink.findMany({
      where: { siteId: sourceId },
    });
    const targetLinkOrgIds = new Set(
      (
        await tx.organizationSiteLink.findMany({
          where: { siteId: targetId },
          select: { organizationId: true },
        })
      ).map((row) => row.organizationId)
    );
    for (const row of sourceLinks) {
      if (targetLinkOrgIds.has(row.organizationId)) {
        await tx.organizationSiteLink.delete({ where: { id: row.id } });
      } else {
        await tx.organizationSiteLink.update({
          where: { id: row.id },
          data: { siteId: targetId },
        });
      }
    }

    await tx.providerOrgFacility.updateMany({
      where: { siteId: sourceId },
      data: { siteId: targetId },
    });
    await tx.serviceRequest.updateMany({
      where: { healthcareSiteId: sourceId },
      data: { healthcareSiteId: targetId },
    });
    await tx.platformInvitation.updateMany({
      where: { healthcareSiteId: sourceId },
      data: { healthcareSiteId: targetId },
    });

    await tx.healthcareSite.update({
      where: { id: sourceId },
      data: { status: "MERGED" },
    });
  });

  return db.healthcareSite.findUniqueOrThrow({
    where: { id: sourceId },
    include: ADMIN_SITE_INCLUDE,
  });
}
