"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { Plus, Search, Trash2, X } from "lucide-react";

export interface RequestShareInfo {
  id: string;
  reason: string;
  createdAt: string;
  requestAccess?: boolean;
  phiAccess?: boolean;
  user: {
    id: string;
    name: string;
    role: string;
    providerInfo?: { jobTitle?: string | null; facilityName?: string | null; department?: string | null } | null;
    providerSiteMemberships?: { department?: string | null; site?: { name: string } | null }[];
  };
  sharedBy: { id: string; name: string };
}

interface PersonOption {
  id: string;
  name: string;
  providerInfo?: { jobTitle?: string | null; facilityName?: string | null; department?: string | null } | null;
  providerSiteMemberships?: { department?: string | null; site?: { name: string } | null }[];
}

const REASONS = ["Shift Handoff", "Care Team", "Scheduler / Coordination", "Other"];

export function ShareRequestModal({
  requestId,
  shares,
  onClose,
  onChange,
}: {
  requestId: string;
  shares: RequestShareInfo[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchJson<{ people: PersonOption[] }>(`/api/requests/${requestId}/shares?q=${encodeURIComponent(query)}`)
          .then((result) => setPeople(result.people.filter((person) => !shares.some((share) => share.user.id === person.id))))
        .catch((err) => setError(err instanceof Error ? err.message : "Could not search coworkers"));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, requestId, shares]);

  async function share() {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      await fetchJson(`/api/requests/${requestId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedId, reason }),
      });
      setSelectedId("");
      onChange();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share request");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    setError("");
    try {
      await fetchJson(`/api/requests/${requestId}/shares`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove access");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="share-request-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="share-request-title" className="text-lg font-semibold text-slate-900">Share this request</h2>
            <p className="mt-1 text-sm text-slate-600">Search verified coworkers at your organization. An invitation to join does not grant access to this request or its patient details.</p>
          </div>
          <button aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <label className="mt-5 block text-sm font-medium text-slate-700">Search people or facility</label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, role, department, facility..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-rose-400" />
        </div>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-100">
          {people.length === 0 ? <p className="p-3 text-sm text-slate-500">No matching verified coworkers.</p> : people.map((person) => {
            const profile = person.providerInfo;
            const facilities = [
              profile?.facilityName ? [profile.facilityName, profile.department].filter(Boolean).join(" — ") : null,
              ...(person.providerSiteMemberships ?? []).map((membership) => [membership.site?.name, membership.department].filter(Boolean).join(" — ")),
            ].filter((value): value is string => Boolean(value));
            return <div key={person.id} className={`flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 ${selectedId === person.id ? "bg-rose-50" : ""}`}>
              <div className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{person.name}{profile?.jobTitle ? `, ${profile.jobTitle}` : ""}</span>
                <span className="block text-xs text-slate-500">{[...new Set(facilities)].join(" · ") || "Verified organization member"}</span>
              </div>
              <button type="button" onClick={() => setSelectedId(person.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">
                <Plus className="h-3.5 w-3.5" />
                {selectedId === person.id ? "Added" : "Add"}
              </button>
            </div>;
          })}
        </div>

        <p className="mt-4 text-sm font-medium text-slate-700">Reason for sharing</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {REASONS.map((item) => (
            <button key={item} type="button" onClick={() => setReason(item)} className={`rounded-lg border px-3 py-2 text-left text-sm ${reason === item ? "border-rose-400 bg-rose-50 font-medium text-rose-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              {item}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">People with request access</h3>
          {shares.length === 0 ? <p className="mt-2 text-sm text-slate-500">No coworkers added yet.</p> : <ul className="mt-2 divide-y divide-slate-100">
            {shares.map((shareItem) => <li key={shareItem.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{shareItem.user.name}{shareItem.user.providerInfo?.jobTitle ? ` · ${shareItem.user.providerInfo.jobTitle}` : ""}</p><p className="truncate text-xs text-slate-500">{[shareItem.user.providerInfo?.facilityName, shareItem.user.providerInfo?.department, shareItem.reason, ...(shareItem.user.providerSiteMemberships ?? []).map((membership) => membership.site?.name)].filter(Boolean).join(" · ")}</p><p className="text-[11px] text-slate-500">Request access ✓ · PHI access {shareItem.phiAccess ? "✓" : "— Restricted"}</p></div>
              <button onClick={() => void revoke(shareItem.id)} disabled={busy} className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${shareItem.user.name}`}><Trash2 className="h-4 w-4" /></button>
            </li>)}
          </ul>}
          <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">Request access covers the schedule, facility, physician, and status. It does not include patient name, date of birth, or other patient details.</p>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={!selectedId || busy} onClick={() => void share()}>{busy ? "Saving..." : reason === "Shift Handoff" ? "Confirm handoff" : "Share request"}</Button>
        </div>
      </section>
    </div>
  );
}
