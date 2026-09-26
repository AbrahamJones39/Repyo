"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { RequestRepModal } from "@/components/provider/request-rep-modal";
import { RequestCard, type RequestData } from "@/components/shared/request-card";
import { Button } from "@/components/ui/button";
import { ApiError, connectEventSource, fetchJson } from "@/lib/api-client";
import type { FacilityDefaults, RequesterDefaults } from "@/lib/request-form-types";
import { Plus, RefreshCw, UserPlus } from "lucide-react";
import { InviteModal } from "@/components/invitations/invite-modal";
import { cn } from "@/lib/utils";

interface ProviderDashboardProps {
  userName: string;
  defaultFacility?: FacilityDefaults;
  defaultRequester?: RequesterDefaults;
}

export function ProviderDashboard({
  userName,
  defaultFacility,
  defaultRequester,
}: ProviderDashboardProps) {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [favorites, setFavorites] = useState<{ id: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string; products: string[] }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [phiEnabled, setPhiEnabled] = useState(true);
  const [scope, setScope] = useState<"all" | "created" | "shared">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reqData, compData, favData, access] = await Promise.all([
        fetchJson<RequestData[]>("/api/requests"),
        fetchJson<{ id: string; name: string; products: string[] }[]>("/api/companies"),
        fetchJson<{ id: string }[]>("/api/favorites"),
        fetchJson<{ canSubmitPhi: boolean; message: string | null }>("/api/provider/access"),
      ]);
      setRequests(Array.isArray(reqData) ? reqData : []);
      setCompanies(Array.isArray(compData) ? compData : []);
      setFavorites(Array.isArray(favData) ? favData : []);
      setPhiEnabled(access.canSubmitPhi);
      setAccessMessage(access.message);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login?callbackUrl=/provider&error=session";
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load dashboard"
      );
      setRequests([]);
      setCompanies([]);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const es = connectEventSource("/api/notifications/stream", loadData);
    return () => es.close();
  }, [loadData]);

  async function handleAction(action: string, requestId: string) {
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleFavorite(repId: string) {
    try {
      const isFav = favorites.some((f) => f.id === repId);
      if (isFav) {
        await fetch(`/api/favorites?repId=${repId}`, { method: "DELETE" });
      } else {
        await fetchJson("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repId }),
        });
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update favorite");
    }
  }

  const active = requests.filter(
    (r) => !["COMPLETED", "CANCELLED"].includes(r.status)
  );
  const visible = active.filter((request) => {
    if (scope === "created") return !request.isSharedWithMe;
    if (scope === "shared") return Boolean(request.isSharedWithMe);
    return true;
  });
  const sharedCount = active.filter((request) => request.isSharedWithMe).length;

  return (
    <PortalShell portal="provider" userName={userName}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">
            {active.length} active request{active.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setShowInviteModal(true)}>
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
          <Button onClick={() => setShowModal(true)} disabled={companies.length === 0}>
            <Plus className="h-4 w-4" />
            Request a Rep
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!phiEnabled && accessMessage && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {accessMessage}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["all", "All"],
          ["created", "Created by me"],
          ["shared", "Shared with me"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              scope === value
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {label}
            {value === "shared" && sharedCount > 0 ? ` (${sharedCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-600">
            {scope === "shared"
              ? "No requests have been shared with you."
              : scope === "created"
                ? "No active requests you created."
                : "No active requests"}
          </p>
          {scope !== "shared" && (
            <Button className="mt-4" onClick={() => setShowModal(true)} disabled={companies.length === 0}>
              Request a Rep
            </Button>
          )}
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              role="provider"
              onAction={handleAction}
              onFavorite={handleFavorite}
              isFavorite={favorites.some((f) => f.id === req.assignedRep?.id)}
              onRefresh={loadData}
            />
          ))}
        </div>
      )}

      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}

      {showModal && companies.length > 0 && (
        <RequestRepModal
          companies={companies}
          defaultFacility={defaultFacility}
          defaultRequester={defaultRequester}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </PortalShell>
  );
}
