"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { fetchJson } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/auth-utils";
import type { AuthorizationDossier } from "@/lib/authorization/dossier";
import type { Role } from "@prisma/client";
import Link from "next/link";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function AuthorizationDossierView({
  dossier,
  backHref,
  backLabel = "Back",
}: {
  dossier: AuthorizationDossier;
  backHref?: string;
  backLabel?: string;
}) {
  const { user, summary } = dossier;

  return (
    <div className="space-y-6">
      {backHref && (
        <Link
          href={backHref}
          className="text-sm font-medium text-rose-600 hover:underline"
        >
          ← {backLabel}
        </Link>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Authorization Dossier</h1>
        <p className="mt-1 text-sm text-slate-600">
          Verification and grant history for HIPAA audit review
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Identity summary
        </h2>
        <dl className="mt-4 space-y-3">
          <SummaryRow label="User" value={user.name} />
          <SummaryRow label="Email" value={user.email} />
          <SummaryRow
            label="Role"
            value={ROLE_LABELS[user.role as Role] ?? user.role}
          />
          <SummaryRow
            label={summary.tenantType === "organization" ? "Organization" : "Company"}
            value={summary.tenantName ?? "—"}
          />
          <SummaryRow
            label="Verification method"
            value={summary.verificationMethod ?? "—"}
          />
          <SummaryRow
            label="Verification source"
            value={summary.verificationSource ?? "—"}
          />
          <SummaryRow label="Account status" value={summary.accountStatus} />
          <SummaryRow label="Company status" value={summary.companyStatus} />
          <SummaryRow label="Last verified" value={formatWhen(summary.lastVerified)} />
          <SummaryRow
            label="Authorization effective"
            value={
              summary.authorizationEffective
                ? format(new Date(summary.authorizationEffective), "M/d/yy")
                : "—"
            }
          />
          {summary.jobTitle && (
            <SummaryRow label="Job title" value={summary.jobTitle} />
          )}
          {summary.isOrgAdministrator && (
            <SummaryRow label="Org admin" value="Yes" />
          )}
        </dl>
      </section>

      {dossier.territories.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Territories
          </h2>
          <ul className="mt-4 space-y-3">
            {dossier.territories.map((t, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
              >
                <p className="font-medium text-slate-900">{t.label}</p>
                <p className="text-xs text-slate-600">Source: {t.source}</p>
                <p className="mt-1 text-xs text-slate-500">{t.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dossier.products.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Products
          </h2>
          <ul className="mt-4 space-y-3">
            {dossier.products.map((p, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
              >
                <p className="font-medium text-slate-900">{p.label}</p>
                <p className="text-xs text-slate-600">Source: {p.source}</p>
                <p className="mt-1 text-xs text-slate-500">{p.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Authorization grants
        </h2>
        {dossier.grants.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No grants recorded yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {dossier.grants.map((g) => (
              <li
                key={g.id}
                className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{g.grantTypeLabel}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      g.active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {g.active ? "Active" : "Revoked"}
                  </span>
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    <span className="text-slate-500">Source: </span>
                    {g.sourceLabel}
                  </div>
                  <div>
                    <span className="text-slate-500">Effective: </span>
                    {formatWhen(g.grantedAt)}
                  </div>
                  {g.grantedByName && (
                    <div>
                      <span className="text-slate-500">Granted by: </span>
                      {g.grantedByName}
                    </div>
                  )}
                  {g.ownerLabel && (
                    <div>
                      <span className="text-slate-500">Owner: </span>
                      {g.ownerLabel}
                    </div>
                  )}
                  {(g.organizationName || g.companyName) && (
                    <div>
                      <span className="text-slate-500">Tenant: </span>
                      {g.organizationName ?? g.companyName}
                    </div>
                  )}
                  {g.revokedAt && (
                    <div>
                      <span className="text-slate-500">Revoked: </span>
                      {formatWhen(g.revokedAt)}
                    </div>
                  )}
                </dl>
                {g.permissions.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Permissions: {g.permissions.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Verification events
        </h2>
        {dossier.verificationEvents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No verification events recorded.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {dossier.verificationEvents.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{e.decisionLabel}</p>
                  <span className="text-xs text-slate-500">
                    {formatWhen(e.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Method: {e.verificationMethodLabel} · Source: {e.sourceLabel}
                </p>
                {e.reason && (
                  <p className="mt-1 text-xs text-slate-600">{e.reason}</p>
                )}
                {(e.organizationName || e.companyName) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {e.organizationName ?? e.companyName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AuthorizationDossierLoader({
  apiPath,
  backHref,
  backLabel,
}: {
  apiPath: string;
  backHref?: string;
  backLabel?: string;
}) {
  const [dossier, setDossier] = useState<AuthorizationDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<AuthorizationDossier>(apiPath);
      setDossier(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dossier");
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading authorization dossier...</p>;
  }

  if (error || !dossier) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || "Dossier unavailable"}
      </div>
    );
  }

  return (
    <AuthorizationDossierView
      dossier={dossier}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
