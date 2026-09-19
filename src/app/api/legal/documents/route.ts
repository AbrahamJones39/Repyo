import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { syncLegalDocumentsFromCode } from "@/lib/legal/sync-documents";
import { NextResponse } from "next/server";

export async function GET() {
  await syncLegalDocumentsFromCode();
  const docs = await db.legalDocument.findMany({
    where: { active: true },
    select: {
      slug: true,
      title: true,
      version: true,
      summary: true,
      roleScopes: true,
      effectiveAt: true,
    },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(docs.length ? docs : LEGAL_DOCUMENTS.map((d) => ({
    slug: d.slug,
    title: d.title,
    version: d.version,
    summary: d.summary,
    roleScopes: d.roleScopes,
  })));
}
