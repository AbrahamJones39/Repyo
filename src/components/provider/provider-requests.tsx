"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { RequestCard, type RequestData } from "@/components/shared/request-card";
import { connectEventSource, fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const TABS = ["created", "shared", "all", "active", "completed", "cancelled"] as const;

export function ProviderRequestsPage({ userName }: { userName: string }) {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("created");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<RequestData[]>("/api/requests");
      setRequests(Array.isArray(data) ? data : []);
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

  const filtered = requests.filter((r) => {
    if (tab === "active") return !["COMPLETED", "CANCELLED"].includes(r.status);
    if (tab === "created") return Boolean(r.isRequestOwner);
    if (tab === "completed") return r.status === "COMPLETED";
    if (tab === "cancelled") return r.status === "CANCELLED";
    if (tab === "shared") return Boolean(r.isSharedWithMe);
    return true;
  });

  return (
    <PortalShell portal="provider" userName={userName}>
      <h1 className="text-2xl font-bold text-slate-900">My Requests</h1>
      <p className="mt-1 text-sm text-slate-600">{requests.length} total requests</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 flex gap-2">
        {TABS.map((t) => (
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
            {t === "created" ? "Created by me" : t === "shared" ? "Shared with me" : t === "all" ? "All" : t}
          </button>
        ))}
      </div>

      <div className="mt-6 grid auto-rows-fr gap-4 md:grid-cols-2">
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-500">No requests in this category.</p>
        ) : (
          filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              role="provider"
              onAction={handleAction}
              showPipeline
              onRefresh={load}
            />
          ))
        )}
      </div>
    </PortalShell>
  );
}
