"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { RequestCard, type RequestData } from "@/components/shared/request-card";
import { connectEventSource, fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn, PROCEDURE_TYPES, QUALIFIED_STATUS_LABELS, REP_STATUS_LABELS } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { CompanyInviteButton } from "@/components/company/company-invite-button";
import {
  FacilitySearchPicker,
  type HealthcareSiteOption,
} from "@/components/shared/facility-search-picker";

interface Rep {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  manager?: { id: string; name: string; role: string } | null;
  homeOrgUnit?: { id: string; name: string; typeLabel: string } | null;
  repProfile: {
    status: string;
    credentialStatus: string;
    products: string[];
    territories: { state: string | null; county: string | null; zipCode: string | null }[];
  } | null;
}

const QUALIFIED_STATUSES = ["ACTIVE", "PENDING", "EXPIRED", "REVOKED"] as const;

const REQUEST_TABS = ["all", "active", "completed", "cancelled"] as const;

export function CompanyRequestsPage({
  userName,
  userId,
}: {
  userName: string;
  userId: string;
}) {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [delegation, setDelegation] = useState<{
    delegationActive: boolean;
    delegatedRep: { id: string; name: string } | null;
    zipCodeStart: string | null;
    zipCodeEnd: string | null;
    reps: { id: string; name: string }[];
  } | null>(null);
  const [delegateRepId, setDelegateRepId] = useState("");
  const [tab, setTab] = useState<(typeof REQUEST_TABS)[number]>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, delegationData, repsData] = await Promise.all([
        fetchJson<RequestData[]>("/api/requests"),
        fetchJson<{
          delegationActive: boolean;
          delegatedRep: { id: string; name: string } | null;
          zipCodeStart: string | null;
          zipCodeEnd: string | null;
          reps: { id: string; name: string }[];
        }>("/api/company/delegation"),
        fetchJson<{ id: string; name: string }[]>("/api/company/reps"),
      ]);
      setRequests(Array.isArray(data) ? data : []);
      setDelegation(delegationData);
      setReps(
        Array.isArray(repsData)
          ? repsData.map((r) => ({ id: r.id, name: r.name }))
          : delegationData.reps ?? []
      );
      setDelegateRepId(delegationData.delegatedRep?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const es = connectEventSource("/api/notifications/stream", load);
    return () => es.close();
  }, [load]);

  async function handleAction(action: string, requestId: string) {
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleAssignRep(requestId: string, repId: string) {
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repId }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign rep");
    }
  }

  async function toggleDelegation(active: boolean) {
    try {
      await fetchJson("/api/company/delegation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active,
          repId: active ? delegateRepId : null,
        }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update delegation");
    }
  }

  const filtered = requests.filter((r) => {
    if (tab === "active") return !["COMPLETED", "CANCELLED"].includes(r.status);
    if (tab === "completed") return r.status === "COMPLETED";
    if (tab === "cancelled") return r.status === "CANCELLED";
    return true;
  });

  return (
    <PortalShell portal="company" userName={userName}>
      <h1 className="text-2xl font-bold text-slate-900">Provider Requests</h1>
      <p className="mt-1 text-sm text-slate-600">
        Requests routed to the facilities you cover, or the nearest covered facility
      </p>

      {delegation && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Forward requests to a rep</h2>
          <p className="mt-1 text-xs text-slate-500">
            Temporarily let a rep accept and assign requests on your behalf.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={delegateRepId}
              onChange={(e) => setDelegateRepId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select rep...</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
            {delegation.delegationActive ? (
              <Button size="sm" variant="outline" onClick={() => toggleDelegation(false)}>
                Stop forwarding
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!delegateRepId}
                onClick={() => toggleDelegation(true)}
              >
                Forward to rep
              </Button>
            )}
            {delegation.delegationActive && delegation.delegatedRep && (
              <span className="text-sm text-emerald-700">
                Forwarding to {delegation.delegatedRep.name}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {REQUEST_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium capitalize transition",
              tab === t
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-500">No requests in this category.</p>
        ) : (
          filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              role="company"
              showPipeline
              currentUserId={userId}
              availableReps={reps}
              onAction={handleAction}
              onAssignRep={handleAssignRep}
            />
          ))
        )}
      </div>
    </PortalShell>
  );
}

export function CompanyRepsPage({
  userName,
  companyName,
  companyProducts,
}: {
  userName: string;
  companyName: string;
  companyProducts: string[];
}) {
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<Rep[]>("/api/company/reps");
      setReps(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reps");
      setReps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateQualifiedStatus(repId: string, credentialStatus: string) {
    try {
      await fetchJson(`/api/company/reps/${repId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialStatus }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update qualification status");
    }
  }

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rep Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            {reps.length} field rep{reps.length !== 1 ? "s" : ""} · {companyName}
          </p>
        </div>
        <div className="flex gap-2">
          <CompanyInviteButton />
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add Rep
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="mt-6 text-slate-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Rep</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Qualified</th>
                <th className="px-4 py-3">Territories</th>
                <th className="px-4 py-3">Products</th>
              </tr>
            </thead>
            <tbody>
              {reps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No reps found</td>
                </tr>
              ) : (
                reps.map((rep) => (
                  <tr key={rep.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{rep.name}</p>
                      <p className="text-xs text-slate-500">{rep.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {rep.manager?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {rep.homeOrgUnit?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {rep.repProfile && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          {REP_STATUS_LABELS[rep.repProfile.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={rep.repProfile?.credentialStatus ?? "PENDING"}
                        onChange={(e) => updateQualifiedStatus(rep.id, e.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        {QUALIFIED_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {QUALIFIED_STATUS_LABELS[s] ?? s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {rep.repProfile?.territories.length ?? 0} areas
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {rep.repProfile?.products.join(", ") || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddRepModal
          companyName={companyName}
          companyProducts={companyProducts.length > 0 ? companyProducts : [...PROCEDURE_TYPES]}
          onClose={() => setShowAddModal(false)}
          onSuccess={(rep) => {
            setShowAddModal(false);
            setSuccessMessage(`${rep.name} was added. Share their login details so they can sign in at /login.`);
            load();
          }}
        />
      )}
    </PortalShell>
  );
}

function AddRepModal({
  companyName,
  companyProducts,
  onClose,
  onSuccess,
}: {
  companyName: string;
  companyProducts: string[];
  onClose: () => void;
  onSuccess: (rep: Rep) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedSites, setSelectedSites] = useState<HealthcareSiteOption[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [orgUnits, setOrgUnits] = useState<
    { id: string; name: string; typeLabel: string; depth: number }[]
  >([]);

  useEffect(() => {
    fetchJson<{
      people: { id: string; name: string; role: string }[];
      flat: { id: string; name: string; typeLabel: string; depth: number }[];
    }>("/api/company/org-units")
      .then((data) => {
        setManagers(data.people ?? []);
        setOrgUnits(data.flat ?? []);
      })
      .catch(() => {
        setManagers([]);
        setOrgUnits([]);
      });
  }, []);

  function toggleProduct(product: string) {
    setSelectedProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (selectedSites.length === 0) {
      setError("Select at least one facility this rep covers");
      setLoading(false);
      return;
    }

    const form = new FormData(e.currentTarget);

    try {
      const rep = await fetchJson<Rep>("/api/company/reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          phone: form.get("phone") || undefined,
          managerId: form.get("managerId"),
          orgUnitId: form.get("orgUnitId") || undefined,
          credentialStatus: form.get("credentialStatus"),
          status: form.get("status"),
          products: selectedProducts,
          siteIds: selectedSites.map((site) => site.id),
        }),
      });
      onSuccess(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add rep");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add Field Rep</h2>
            <p className="text-sm text-slate-500">{companyName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <Input label="Full Name" name="name" required autoComplete="name" />
          <Input label="Email" name="email" type="email" required autoComplete="email" />
          <Input label="Phone" name="phone" type="tel" autoComplete="tel" />
          <Input
            label="Temporary Password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="-mt-2 text-xs text-slate-500">
            Share this password with the rep so they can sign in at /login.
          </p>

          <Select
            label="Designated manager"
            name="managerId"
            required
            options={[
              { value: "", label: "Select manager..." },
              ...managers.map((m) => ({
                value: m.id,
                label: `${m.name} (${m.role === "REP" ? "Rep" : "Admin"})`,
              })),
            ]}
          />
          <p className="-mt-2 text-xs text-slate-500">
            Required. A missed request is rerouted to this manager.
          </p>

          <Select
            label="Organizational unit"
            name="orgUnitId"
            required={orgUnits.length > 0}
            defaultValue={orgUnits.find((unit) => unit.depth === 0)?.id ?? orgUnits[0]?.id ?? ""}
            options={[
              {
                value: "",
                label: orgUnits.length ? "Select a unit" : "Company unit will be assigned",
              },
              ...orgUnits.map((unit) => ({
                value: unit.id,
                label: `${"· ".repeat(unit.depth)}${unit.name} (${unit.typeLabel})`,
              })),
            ]}
          />

          <FacilitySearchPicker
            selected={selectedSites}
            onChange={setSelectedSites}
            multiple
            label="Facilities this rep covers"
            helperText="Choose the hospitals and clinics from the shared directory."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Qualification Status"
              name="credentialStatus"
              defaultValue="ACTIVE"
              options={QUALIFIED_STATUSES.map((s) => ({
                value: s,
                label: QUALIFIED_STATUS_LABELS[s] ?? s,
              }))}
            />
            <Select
              label="Availability"
              name="status"
              defaultValue="AVAILABLE"
              options={[
                { value: "AVAILABLE", label: "Available" },
                { value: "OFF_DUTY", label: "Off Duty" },
                { value: "BUSY", label: "Busy" },
                { value: "VACATION", label: "Vacation" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Products</p>
            <p className="text-xs text-slate-500">
              Select products this rep covers. Leave empty to match any product.
            </p>
            <div className="flex flex-wrap gap-2">
              {companyProducts.map((product) => (
                <button
                  key={product}
                  type="button"
                  onClick={() => toggleProduct(product)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    selectedProducts.includes(product)
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {product}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Rep"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface Analytics {
  totals: {
    all: number;
    active: number;
    completed: number;
    cancelled: number;
    escalated?: number;
    unacknowledged?: number;
  };
  avgResponseMinutes: number | null;
  medianAckMinutes?: number | null;
  medianAcceptMinutes?: number | null;
  byProcedure: { name: string; count: number }[];
  byUrgency: { name: string; count: number }[];
  coverage: { totalReps: number; availableReps: number; credentialedReps: number };
  phiIncluded?: boolean;
  scope?: { isCompanyWide: boolean };
}

export function CompanyAnalyticsPage({ userName }: { userName: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<Analytics>("/api/company/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"));
  }, []);

  if (error) {
    return (
      <PortalShell portal="company" userName={userName}>
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </PortalShell>
    );
  }

  if (!data) {
    return (
      <PortalShell portal="company" userName={userName}>
        <p className="text-slate-500">Loading analytics...</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell portal="company" userName={userName}>
      <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
      <p className="mt-1 text-sm text-slate-600">
        Operational metrics for your unit and everyone below you. Patient information is not included.
        {data.scope && !data.scope.isCompanyWide ? " Scoped to your assigned organization units." : ""}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Cases", value: data.totals.all },
          { label: "Active", value: data.totals.active },
          { label: "Completed", value: data.totals.completed },
          { label: "Escalated", value: data.totals.escalated ?? 0 },
          { label: "Unacknowledged", value: data.totals.unacknowledged ?? 0 },
          { label: "Median ack", value: data.medianAckMinutes != null ? `${data.medianAckMinutes}m` : "—" },
          { label: "Median accept", value: data.medianAcceptMinutes != null ? `${data.medianAcceptMinutes}m` : "—" },
          { label: "Avg Response", value: data.avgResponseMinutes != null ? `${data.avgResponseMinutes}m` : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Cases by Procedure</h2>
          <div className="mt-4 space-y-2">
            {data.byProcedure.length === 0 ? (
              <p className="text-sm text-slate-500">No case data yet</p>
            ) : (
              data.byProcedure.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-32 truncate text-sm text-slate-600">{p.name}</span>
                  <div className="flex-1 rounded-full bg-slate-100 h-2">
                    <div
                      className="h-2 rounded-full bg-rose-500"
                      style={{ width: `${data.totals.all ? Math.min(100, (p.count / data.totals.all) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-900">{p.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Coverage</h2>
          <dl className="mt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500">Total Reps</dt>
              <dd className="font-medium">{data.coverage.totalReps}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500">Available Now</dt>
              <dd className="font-medium text-rose-600">{data.coverage.availableReps}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500">Qualified</dt>
              <dd className="font-medium">{data.coverage.credentialedReps}</dd>
            </div>
          </dl>
        </div>
      </div>
    </PortalShell>
  );
}
