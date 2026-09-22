"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { formatSiteLabel } from "@/lib/healthcare-sites/normalize";
import { cn } from "@/lib/utils";
import { Plus, Search, X } from "lucide-react";

export type HealthcareSiteOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  siteType?: string;
  status?: string;
};

type FacilitySearchPickerProps = {
  selected: HealthcareSiteOption[];
  onChange: (sites: HealthcareSiteOption[]) => void;
  multiple?: boolean;
  stateDefault?: string;
  organizationId?: string;
  label?: string;
  helperText?: string;
};

export function FacilitySearchPicker({
  selected,
  onChange,
  multiple = false,
  stateDefault = "AZ",
  organizationId,
  label = "Hospital or clinic",
  helperText = "Search the shared RepYo facility directory. Each location exists once platform-wide.",
}: FacilitySearchPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HealthcareSiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    address: "",
    city: "",
    state: stateDefault,
    zipCode: "",
  });
  const [error, setError] = useState("");

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (stateDefault) params.set("state", stateDefault);
      if (organizationId) params.set("organizationId", organizationId);
      const sites = await fetchJson<HealthcareSiteOption[]>(
        `/api/healthcare-sites?${params.toString()}`
      );
      setResults(sites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [organizationId, stateDefault]);

  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  function addSite(site: HealthcareSiteOption) {
    if (selected.some((s) => s.id === site.id)) return;
    if (multiple) {
      onChange([...selected, site]);
    } else {
      onChange([site]);
    }
    setQuery("");
  }

  function removeSite(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  async function submitNewSite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const site = await fetchJson<HealthcareSiteOption>("/api/healthcare-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      addSite(site);
      setShowAdd(false);
      setAddForm({
        name: "",
        address: "",
        city: "",
        state: stateDefault,
        zipCode: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add facility");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {helperText && (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="space-y-2">
          {selected.map((site) => (
            <li
              key={site.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-900">{site.name}</p>
                <p className="text-xs text-slate-600">
                  {site.address}, {site.city}, {site.state} {site.zipCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeSite(site.id)}
                className="text-slate-400 hover:text-red-500"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(multiple || selected.length === 0) && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search hospitals and clinics..."
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {loading ? (
              <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">
                {query.trim()
                  ? "No matching facilities. You can add a new one below."
                  : "Type to search Arizona hospitals and clinics."}
              </p>
            ) : (
              results.map((site) => {
                const isSelected = selected.some((s) => s.id === site.id);
                return (
                  <button
                    key={site.id}
                    type="button"
                    disabled={isSelected}
                    onClick={() => addSite(site)}
                    className={cn(
                      "block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50",
                      isSelected && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <span className="font-medium text-slate-900">{site.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {formatSiteLabel(site)}
                    </span>
                    {site.status === "PENDING_REVIEW" && (
                      <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Pending review
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {!showAdd ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add a facility not listed
            </Button>
          ) : (
            <form
              onSubmit={submitNewSite}
              className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-xs font-medium text-slate-600">
                New facilities are submitted for super admin review. They stay
                hidden from everyone else until approved.
              </p>
              <Input
                label="Facility name"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
              <Input
                label="Street address"
                value={addForm.address}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, address: e.target.value }))
                }
                required
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="City"
                  value={addForm.city}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, city: e.target.value }))
                  }
                  required
                />
                <Input
                  label="State"
                  value={addForm.state}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, state: e.target.value }))
                  }
                  maxLength={2}
                  required
                />
                <Input
                  label="Zip"
                  value={addForm.zipCode}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, zipCode: e.target.value }))
                  }
                  pattern="\d{5}"
                  maxLength={5}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Submit facility
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
