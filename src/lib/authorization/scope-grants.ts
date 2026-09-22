import { db } from "@/lib/db";
import { recordAuthorizationGrant } from "@/lib/authorization/grants";

export async function syncTerritoryGrant(params: {
  userId: string;
  companyId: string;
  territoryLabel: string;
  grantedById: string;
  ownerLabel: string;
}) {
  const label = params.territoryLabel.trim();
  if (!label) return;

  const now = new Date();
  await db.authorizationGrant.updateMany({
    where: { userId: params.userId, grantType: "TERRITORY", revokedAt: null },
    data: { revokedAt: now, revokedById: params.grantedById },
  });

  await recordAuthorizationGrant({
    userId: params.userId,
    grantedById: params.grantedById,
    companyId: params.companyId,
    grantType: "TERRITORY",
    source: "ADMIN_GRANT",
    ownerLabel: params.ownerLabel,
    metadata: { label, effectiveAt: now.toISOString() },
  });
}

export async function syncProductGrants(params: {
  userId: string;
  companyId: string;
  products: string[];
  grantedById: string;
  ownerLabel: string;
}) {
  const wanted = [...new Set(params.products.map((product) => product.trim()).filter(Boolean))];
  const now = new Date();
  const existing = await db.authorizationGrant.findMany({
    where: { userId: params.userId, grantType: "PRODUCT", revokedAt: null },
    select: { id: true, metadata: true },
  });

  const labelOf = (metadata: unknown) => {
    if (metadata && typeof metadata === "object" && "label" in metadata) {
      const label = (metadata as { label?: unknown }).label;
      return typeof label === "string" ? label : "";
    }
    return "";
  };

  const current = new Set(existing.map((grant) => labelOf(grant.metadata)));
  const removeIds = existing
    .filter((grant) => !wanted.includes(labelOf(grant.metadata)))
    .map((grant) => grant.id);

  if (removeIds.length > 0) {
    await db.authorizationGrant.updateMany({
      where: { id: { in: removeIds } },
      data: { revokedAt: now, revokedById: params.grantedById },
    });
  }

  for (const product of wanted) {
    if (current.has(product)) continue;
    await recordAuthorizationGrant({
      userId: params.userId,
      grantedById: params.grantedById,
      companyId: params.companyId,
      grantType: "PRODUCT",
      source: "ADMIN_GRANT",
      ownerLabel: params.ownerLabel,
      metadata: { label: product, effectiveAt: now.toISOString() },
    });
  }
}
