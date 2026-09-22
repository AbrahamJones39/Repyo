import { db } from "@/lib/db";

export type RosterRow = {
  email: string;
  name?: string;
  jobTitle?: string;
};

export function parseRosterText(text: string): RosterRow[] {
  const rows: RosterRow[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("email")) continue;
    const parts = trimmed.split(",").map((part) => part.trim());
    const email = parts[0]?.toLowerCase() ?? "";
    if (!email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    rows.push({
      email,
      name: parts[1] || undefined,
      jobTitle: parts[2] || undefined,
    });
  }

  return rows;
}

export async function replaceRoster(params: {
  companyId?: string | null;
  organizationId?: string | null;
  rows: RosterRow[];
  importedById: string;
}) {
  const scope = params.companyId
    ? { companyId: params.companyId }
    : { organizationId: params.organizationId ?? undefined };

  await db.preapprovedRosterEntry.deleteMany({ where: scope });

  if (params.rows.length === 0) return [];

  await db.preapprovedRosterEntry.createMany({
    data: params.rows.map((row) => ({
      email: row.email,
      name: row.name ?? null,
      jobTitle: row.jobTitle ?? null,
      companyId: params.companyId ?? null,
      organizationId: params.organizationId ?? null,
      importedById: params.importedById,
      source: "ROSTER_IMPORT" as const,
      active: true,
    })),
  });

  return db.preapprovedRosterEntry.findMany({
    where: scope,
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, jobTitle: true },
  });
}
