import { db } from "@/lib/db";
import { hashSecret } from "@/lib/verification/tokens";

export type TokenTenant = { kind: "company" | "organization"; id: string; name: string };

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function tenantFromBearer(
  request: Request,
  kind: "scim" | "directory"
): Promise<TokenTenant | null> {
  const raw = bearerToken(request);
  if (!raw) return null;
  const hash = hashSecret(raw);
  const field = kind === "scim" ? "scimTokenHash" : "directoryTokenHash";

  const company = await db.company.findFirst({
    where: { [field]: hash },
    select: { id: true, name: true },
  });
  if (company) return { kind: "company", id: company.id, name: company.name };

  const organization = await db.providerOrganization.findFirst({
    where: { [field]: hash },
    select: { id: true, name: true },
  });
  if (organization) {
    return { kind: "organization", id: organization.id, name: organization.name };
  }
  return null;
}
