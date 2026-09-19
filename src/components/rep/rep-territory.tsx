"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FacilitySearchPicker,
  type HealthcareSiteOption,
} from "@/components/shared/facility-search-picker";
import { fetchJson } from "@/lib/api-client";
import { PROCEDURE_TYPES, REP_STATUS_LABELS } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

interface Territory {
  state: string;
  county: string;
  zipCode: string;
}

interface RepProfile {
  status: string;
  travelRadiusMiles: number;
  onCallEnabled: boolean;
  products: string[];
  territories: Territory[];
  user: { name: string; company: { name: string } | null };
}

export function RepTerritoryPage({ userName }: { userName: string }) {
  const [profile, setProfile] = useState<RepProfile | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [coveredSites, setCoveredSites] = useState<HealthcareSiteOption[]>([]);
  const [travelRadius, setTravelRadius] = useState(50);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [data, sites] = await Promise.all([
        fetchJson<RepProfile | null>("/api/rep/profile"),
        fetchJson<HealthcareSiteOption[]>("/api/rep/site-coverage"),
      ]);
      if (!data) {
        setError("Profile not found");
        return;
      }
      setProfile(data);
      setCoveredSites(sites ?? []);
      setTerritories(
        data.territories?.map((t) => ({
          state: t.state ?? "",
          county: t.county ?? "",
          zipCode: t.zipCode ?? "",
        })) ?? [{ state: "", county: "", zipCode: "" }]
      );
      setTravelRadius(data.travelRadiusMiles ?? 50);
      setSelectedProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function addTerritory() {
    setTerritories([...territories, { state: "", county: "", zipCode: "" }]);
  }

  function removeTerritory(idx: number) {
    setTerritories(territories.filter((_, i) => i !== idx));
  }

  function updateTerritory(idx: number, field: keyof Territory, value: string) {
    const next = [...territories];
    next[idx] = { ...next[idx], [field]: value };
    setTerritories(next);
  }

  function toggleProduct(product: string) {
    setSelectedProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    );
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await Promise.all([
        fetchJson("/api/rep/territory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            territories: territories.filter((t) => t.state || t.county || t.zipCode),
          }),
        }),
        fetchJson("/api/rep/site-coverage", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteIds: coveredSites.map((s) => s.id),
          }),
        }),
        fetchJson("/api/rep/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ travelRadiusMiles: travelRadius, products: selectedProducts }),
        }),
      ]);
      setMessage("Profile saved");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PortalShell portal="rep" userName={userName}>
        <p className="text-slate-500">Loading...</p>
      </PortalShell>
    );
  }

  if (!profile) {
    return (
      <PortalShell portal="rep" userName={userName}>
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Could not load profile"}
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell portal="rep" userName={userName}>
      <h1 className="text-2xl font-bold text-slate-900">Territory & Profile</h1>
      <p className="mt-1 text-sm text-slate-600">{profile.user.company?.name}</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Current Status</h2>
          <p className="mt-2 text-sm text-slate-600">
            {REP_STATUS_LABELS[profile.status] ?? profile.status}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Update your status and weekly hours on the Dashboard and Calendar pages.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Travel Settings</h2>
          <div className="mt-4">
            <Input
              label="Travel Radius (miles)"
              type="number"
              value={travelRadius}
              onChange={(e) => setTravelRadius(Number(e.target.value))}
              min={1}
              max={500}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Products</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROCEDURE_TYPES.map((p) => (
              <button
                key={p}
                onClick={() => toggleProduct(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  selectedProducts.includes(p)
                    ? "bg-rose-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <FacilitySearchPicker
            selected={coveredSites}
            onChange={setCoveredSites}
            multiple
            label="Hospitals & clinics you cover"
            helperText="Add every hospital or clinic where you support cases. Providers at these locations will find you when requesting a rep."
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Legacy zip notes</h2>
              <p className="mt-1 text-xs text-slate-500">
                Requests route by covered facility. Use My Facilities for the hospitals you cover.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={addTerritory}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {territories.map((t, idx) => (
              <div key={idx} className="flex gap-3">
                <Input placeholder="State" value={t.state} onChange={(e) => updateTerritory(idx, "state", e.target.value)} />
                <Input placeholder="County" value={t.county} onChange={(e) => updateTerritory(idx, "county", e.target.value)} />
                <Input placeholder="Zip" value={t.zipCode} onChange={(e) => updateTerritory(idx, "zipCode", e.target.value)} />
                <button onClick={() => removeTerritory(idx)} className="shrink-0 p-2 text-slate-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </Button>
        {message && <p className="text-sm text-rose-600">{message}</p>}
      </div>
    </PortalShell>
  );
}
