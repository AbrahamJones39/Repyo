"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import type { HealthcareSiteStatus, HealthcareSiteType, Role } from "@prisma/client";

type ReviewSite = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
  siteType: HealthcareSiteType;
  status: HealthcareSiteStatus;
  createdAt: string;
  verifiedAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  _count: {
    providerMemberships: number;
    repCoverages: number;
    serviceRequests: number;
  };
};

type StatusFilter = "PENDING_REVIEW" | "ACTIVE" | "REJECTED" | "MERGED";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "PENDING_REVIEW", label: "Pending" },
  { id: "ACTIVE", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "MERGED", label: "Merged" },
];

function overlapScore(a: ReviewSite, b: ReviewSite) {
  let score = 0;
  if (a.zipCode && a.zipCode === b.zipCode) score += 3;
  if (a.city.toLowerCase() === b.city.toLowerCase() && a.state === b.state) score += 1;
  const tokens = (value: string) =>
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3 && !["hospital", "medical", "center", "clinic", "health"].includes(token));
  const left = new Set(tokens(a.name));
  for (const token of tokens(b.name)) {
    if (left.has(token)) score += 2;
  }
  return score;
}

export function AdminFacilitiesPage({ userName }: { userName: string }) {
  const [sites, setSites] = useState<ReviewSite[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("PENDING_REVIEW");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<ReviewSite>>>({});
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<ReviewSite[]>("/api/admin/healthcare-sites");
      setSites(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load facilities");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    return {
      PENDING_REVIEW: sites.filter((s) => s.status === "PENDING_REVIEW").length,
      ACTIVE: sites.filter((s) => s.status === "ACTIVE").length,
      REJECTED: sites.filter((s) => s.status === "REJECTED").length,
      MERGED: sites.filter((s) => s.status === "MERGED").length,
    };
  }, [sites]);

  const visible = sites.filter((site) => site.status === filter);
  const mergeTargets = sites.filter(
    (site) => site.status === "ACTIVE" || site.status === "PENDING_REVIEW"
  );

  function similarFor(site: ReviewSite) {
    return mergeTargets
      .filter((other) => other.id !== site.id)
      .map((other) => ({ other, score: overlapScore(site, other) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((row) => row.other);
  }

  function draft(site: ReviewSite) {
    return {
      name: edits[site.id]?.name ?? site.name,
      address: edits[site.id]?.address ?? site.address,
      city: edits[site.id]?.city ?? site.city,
      state: edits[site.id]?.state ?? site.state,
      zipCode: edits[site.id]?.zipCode ?? site.zipCode,
      phone: edits[site.id]?.phone ?? site.phone ?? "",
    };
  }

  async function runAction(
    site: ReviewSite,
    action: "approve" | "reject" | "merge"
  ) {
    setBusyId(site.id);
    setError("");
    setMessage("");
    try {
      const values = draft(site);
      await fetchJson(`/api/admin/healthcare-sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          mergeIntoId: mergeInto[site.id],
          ...values,
        }),
      });
      setMessage(
        action === "approve"
          ? "Facility approved."
          : action === "reject"
            ? "Facility rejected."
            : "Facility merged into the existing directory entry."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update facility");
    } finally {
      setBusyId("");
    }
  }

  return (
    <PortalShell portal="admin" userName={userName}>
      <h1 className="text-2xl font-bold text-slate-900">Facilities</h1>
      <p className="mt-1 text-sm text-slate-600">
        Review user-submitted hospitals and clinics. Approve a new location, or
        merge it into the one Banner / Mayo / HonorHealth already in the
        directory.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === item.id
                ? "bg-rose-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {item.label} ({counts[item.id]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-slate-500">Loading facilities...</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          {filter === "PENDING_REVIEW"
            ? "No facilities waiting for review."
            : "No facilities in this list."}
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {visible.map((site) => {
            const values = draft(site);
            const similar = similarFor(site);
            const canReview = site.status === "PENDING_REVIEW";
            return (
              <article
                key={site.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">{site.name}</h2>
                    <p className="text-sm text-slate-600">
                      {site.address}, {site.city}, {site.state} {site.zipCode}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {site.siteType.replaceAll("_", " ")} · requested{" "}
                      {new Date(site.createdAt).toLocaleDateString()}
                      {site.createdBy
                        ? ` by ${site.createdBy.name} (${site.createdBy.email})`
                        : " from import"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {site._count.providerMemberships} providers ·{" "}
                      {site._count.repCoverages} coverage rows ·{" "}
                      {site._count.serviceRequests} requests
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {site.status.replace("_", " ")}
                  </span>
                </div>

                {canReview && (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Input
                        id={`${site.id}-name`}
                        label="Facility name"
                        value={values.name}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [site.id]: { ...prev[site.id], name: e.target.value },
                          }))
                        }
                      />
                      <Input
                        id={`${site.id}-address`}
                        label="Street address"
                        value={values.address}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [site.id]: { ...prev[site.id], address: e.target.value },
                          }))
                        }
                      />
                      <Input
                        id={`${site.id}-city`}
                        label="City"
                        value={values.city}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [site.id]: { ...prev[site.id], city: e.target.value },
                          }))
                        }
                      />
                      <Input
                        id={`${site.id}-state`}
                        label="State"
                        value={values.state}
                        maxLength={2}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [site.id]: { ...prev[site.id], state: e.target.value },
                          }))
                        }
                      />
                      <Input
                        id={`${site.id}-zip`}
                        label="Zip"
                        value={values.zipCode}
                        maxLength={5}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [site.id]: { ...prev[site.id], zipCode: e.target.value },
                          }))
                        }
                      />
                      <Input
                        id={`${site.id}-phone`}
                        label="Phone"
                        value={values.phone ?? ""}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [site.id]: { ...prev[site.id], phone: e.target.value },
                          }))
                        }
                      />
                    </div>

                    {similar.length > 0 && (
                      <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3">
                        <p className="text-xs font-medium text-amber-900">
                          Possible duplicates already in the directory
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-amber-900">
                          {similar.map((match) => (
                            <li key={match.id}>
                              <button
                                type="button"
                                className="text-left hover:underline"
                                onClick={() =>
                                  setMergeInto((prev) => ({
                                    ...prev,
                                    [site.id]: match.id,
                                  }))
                                }
                              >
                                {match.name} · {match.city}, {match.state}{" "}
                                {match.zipCode} ({match.status.replace("_", " ")})
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
                      <label className="flex-1 text-sm">
                        <span className="mb-1 block text-slate-700">
                          Merge into existing facility
                        </span>
                        <select
                          value={mergeInto[site.id] ?? ""}
                          onChange={(e) =>
                            setMergeInto((prev) => ({
                              ...prev,
                              [site.id]: e.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          <option value="">Keep as a new facility</option>
                          {mergeTargets
                            .filter((other) => other.id !== site.id)
                            .map((other) => (
                              <option key={other.id} value={other.id}>
                                {other.name} · {other.city}, {other.state}{" "}
                                {other.zipCode}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === site.id}
                          onClick={() => runAction(site, "approve")}
                        >
                          {busyId === site.id ? "Saving..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === site.id || !mergeInto[site.id]}
                          onClick={() => runAction(site, "merge")}
                        >
                          Merge duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === site.id}
                          onClick={() => runAction(site, "reject")}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
