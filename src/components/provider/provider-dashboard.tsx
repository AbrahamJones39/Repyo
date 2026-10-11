"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { RequestRepModal } from "@/components/provider/request-rep-modal";
import { RequestCard, type RequestData } from "@/components/shared/request-card";
import { Button } from "@/components/ui/button";
import { ApiError, connectEventSource, fetchJson } from "@/lib/api-client";
import type { FacilityDefaults, RequesterDefaults } from "@/lib/request-form-types";
import { Inbox, Plus, RefreshCw, UserPlus } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { InviteModal } from "@/components/invitations/invite-modal";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/loading";

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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? "Loading your requests…"
              : `${active.length} active request${active.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadData} aria-label="Refresh" title="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
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

      <Segmented
        className="mb-5"
        value={scope}
        onChange={setScope}
        options={[
          { value: "all", label: "All", count: active.length },
          { value: "created", label: "Created by me" },
          { value: "shared", label: "Shared with me", count: sharedCount },
        ]}
      />

      {loading ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <Inbox className="h-6 w-6" />
          </span>
          <p className="font-medium text-slate-700">
            {scope === "shared"
              ? "No requests have been shared with you."
              : scope === "created"
                ? "No active requests you created."
                : "No active requests"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {scope === "shared"
              ? "When a coworker hands off a request, it'll show up here."
              : "Need device support? Dispatch a rep in a few taps."}
          </p>
          {scope !== "shared" && (
            <Button className="mt-5" onClick={() => setShowModal(true)} disabled={companies.length === 0}>
              <Plus className="h-4 w-4" />
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
