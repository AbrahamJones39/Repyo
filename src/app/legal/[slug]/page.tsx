import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/shared/brand-mark";
import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { syncLegalDocumentsFromCode } from "@/lib/legal/sync-documents";

type PageProps = { params: Promise<{ slug: string }> };

function renderMarkdown(content: string) {
  return content.split("\n").map((line, i) => {
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="mb-4 text-2xl font-bold text-slate-900">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mb-2 mt-6 text-lg font-semibold text-slate-900">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("**") && line.endsWith("**")) {
      return (
        <p key={i} className="mb-2 text-sm font-medium text-slate-700">
          {line.replace(/\*\*/g, "")}
        </p>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-4 list-disc text-sm text-slate-700">
          {line.slice(2)}
        </li>
      );
    }
    if (!line.trim()) return <br key={i} />;
    return (
      <p key={i} className="mb-2 text-sm leading-relaxed text-slate-700">
        {line}
      </p>
    );
  });
}

export default async function LegalDocumentPage({ params }: PageProps) {
  const { slug } = await params;
  await syncLegalDocumentsFromCode();

  const doc =
    (await db.legalDocument.findFirst({
      where: { slug, active: true },
    })) ?? LEGAL_DOCUMENTS.find((d) => d.slug === slug);

  if (!doc) notFound();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark size="md" />
          <Link
            href="/signup"
            className="text-sm font-medium text-rose-600 hover:underline"
          >
            Back to signup
          </Link>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-6 text-xs text-slate-500">Version {doc.version}</p>
          {renderMarkdown(doc.content)}
        </article>
      </div>
    </div>
  );
}
