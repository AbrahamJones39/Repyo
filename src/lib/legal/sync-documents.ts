import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export async function syncLegalDocumentsFromCode() {
  for (const doc of LEGAL_DOCUMENTS) {
    await db.legalDocument.upsert({
      where: { slug: doc.slug },
      create: {
        slug: doc.slug,
        title: doc.title,
        version: doc.version,
        roleScopes: doc.roleScopes,
        summary: doc.summary,
        content: doc.content,
        active: true,
      },
      update: {
        title: doc.title,
        version: doc.version,
        roleScopes: doc.roleScopes,
        summary: doc.summary,
        content: doc.content,
        active: true,
      },
    });
  }
}
