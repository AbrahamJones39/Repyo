import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { syncLegalDocumentsFromCode } from "@/lib/legal/sync-documents";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  await syncLegalDocumentsFromCode();

  const doc =
    (await db.legalDocument.findFirst({
      where: { slug, active: true },
    })) ?? LEGAL_DOCUMENTS.find((d) => d.slug === slug);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({
    slug: doc.slug,
    title: doc.title,
    version: doc.version,
    summary: "summary" in doc ? doc.summary : null,
    content: doc.content,
    effectiveAt: "effectiveAt" in doc ? doc.effectiveAt : null,
  });
}
