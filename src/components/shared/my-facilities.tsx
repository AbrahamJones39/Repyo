"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import {
  FacilitySearchPicker,
  type HealthcareSiteOption,
} from "@/components/shared/facility-search-picker";
import { fetchJson } from "@/lib/api-client";
import { formatSiteLabel } from "@/lib/healthcare-sites/normalize";
import { MapPin, Star } from "lucide-react";

type CoveredFacility = HealthcareSiteOption & {
  isPrimary?: boolean;
};

export function MyFacilitiesPage({
  portal,
  userName,
  apiPath,
  description,
  allowPrimary = false,
}: {
  portal: "provider" | "rep" | "company";
  userName: string;
  apiPath: string;
  description: string;
  allowPrimary?: boolean;
}) {
  const [sites, setSites] = useState<CoveredFacility[]>([]);
  const [primarySiteId, setPrimarySiteId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<CoveredFacility[]>(apiPath);
      const list = Array.isArray(data) ? data : [];
      setSites(list);
      setPrimarySiteId(list.find((site) => site.isPrimary)?.id ?? list[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load facilities");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await fetchJson<CoveredFacility[]>(apiPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteIds: sites.map((site) => site.id),
          primarySiteId: allowPrimary ? primarySiteId || sites[0]?.id : undefined,
        }),
      });
      const list = Array.isArray(updated) ? updated : sites;
      setSites(list);
      setPrimarySiteId(list.find((site) => site.isPrimary)?.id ?? list[0]?.id ?? "");
      setMessage("Facilities saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save facilities");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell portal={portal} userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Facilities</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading facilities...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-3">
            <h2 className="font-semibold text-slate-900">Covered locations</h2>
            {sites.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No facilities yet. Search the directory to add the hospitals and clinics you cover.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {sites.map((site) => (
                  <li
                    key={site.id}
                    className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {site.name}
                        {allowPrimary && primarySiteId === site.id && (
                          <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                            Primary
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-600">
                        {site.address}, {site.city}, {site.state} {site.zipCode}
                      </p>
                    </div>
                    {allowPrimary && sites.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPrimarySiteId(site.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Make primary
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rose-600" />
              <h2 className="font-semibold text-slate-900">Add facilities</h2>
            </div>
            <FacilitySearchPicker
              selected={sites}
              onChange={setSites}
              multiple
              helperText="Search the shared directory. Requests route to people who cover a facility, or the nearest covered facility."
            />
            <Button className="w-full" disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save facilities"}
            </Button>
            {sites.length > 0 && (
              <p className="text-xs text-slate-500">
                {sites.length} location{sites.length === 1 ? "" : "s"} selected
                {allowPrimary && primarySiteId
                  ? ` · primary ${formatSiteLabel(sites.find((s) => s.id === primarySiteId) ?? sites[0])}`
                  : ""}
              </p>
            )}
          </section>
        </div>
      )}
    </PortalShell>
  );
}
