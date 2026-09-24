"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { RequestRepModal } from "@/components/provider/request-rep-modal";
import { RequestCard, type RequestData } from "@/components/shared/request-card";
import { Button } from "@/components/ui/button";
import { connectEventSource, fetchJson } from "@/lib/api-client";
import { REP_STATUS_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, UserPlus } from "lucide-react";
import { InviteModal } from "@/components/invitations/invite-modal";
import { ForwardRequestModal } from "@/components/shared/forward-request-modal";

const REP_STATUSES = ["AVAILABLE", "BUSY", "OFF_DUTY", "VACATION"] as const;

export function RepDashboard({
  userName,
  userId,
  companyId,
}: {
  userName: string;
  userId: string;
  companyId?: string | null;
}) {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [status, setStatus] = useState("OFF_DUTY");
  const [onCall, setOnCall] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companyReps, setCompanyReps] = useState<{ id: string; name: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string; products: string[] }[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [forwardRequestId, setForwardRequestId] = useState<string | null>(null);
  const [teamMetrics, setTeamMetrics] = useState<{
    reportCount: number;
    reports?: string[];
    phiIncluded: false;
    totals: {
      all: number;
      active: number;
      completed: number;
      escalated: number;
      available: number;
    } | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reqData, profile] = await Promise.all([
        fetchJson<RequestData[]>("/api/requests"),
        fetchJson<{ status?: string; onCallEnabled?: boolean } | null>("/api/rep/profile"),
      ]);
      setRequests(Array.isArray(reqData) ? reqData : []);
      if (profile?.status) setStatus(profile.status);
      if (profile?.onCallEnabled != null) setOnCall(profile.onCallEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const es = connectEventSource("/api/notifications/stream", loadData);
    fetchJson<{ id: string; name: string; products: string[] }[]>("/api/companies")
      .then((data) => setCompanies(Array.isArray(data) ? data : []))
      .catch(() => setCompanies([]));
    fetchJson<{
      reportCount: number;
      reports?: string[];
      phiIncluded: false;
      totals: {
        all: number;
        active: number;
        completed: number;
        escalated: number;
        available: number;
      } | null;
    }>("/api/rep/team-metrics")
      .then(setTeamMetrics)
      .catch(() => setTeamMetrics(null));
    return () => es.close();
  }, [loadData]);

  const adminRequests = requests.filter(
    (r) => r.status === "REQUESTING" && r.assignedRep?.id !== userId
  );
  const fieldRequests = requests.filter(
    (r) =>
      ["ACCEPTED", "EN_ROUTE", "ARRIVED"].includes(r.status) ||
      (r.status === "REQUESTING" && r.assignedRep?.id === userId)
  );

  useEffect(() => {
    if (adminRequests.length > 0) {
      fetchJson<{ id: string; name: string }[]>("/api/company/reps")
        .then((data) =>
          setCompanyReps(
            Array.isArray(data) ? data.map((r) => ({ id: r.id, name: r.name })) : []
          )
        )
        .catch(() => setCompanyReps([]));
    }
  }, [adminRequests.length]);

  async function updateStatus(newStatus: string) {
    try {
      await fetchJson("/api/rep/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setStatus(newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function toggleOnCall() {
    try {
      const next = !onCall;
      await fetchJson("/api/rep/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onCallEnabled: next }),
      });
      setOnCall(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update on-call status");
    }
  }

  async function handleAction(action: string, requestId: string) {
    if (action === "FORWARD") {
      setForwardRequestId(requestId);
      return;
    }

    try {
      if (action === "DECLINE") {
        await fetchJson(`/api/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DECLINE" }),
        });
      } else {
        await fetchJson(`/api/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action }),
        });
      }
      loadData();
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
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign rep");
    }
  }

  const pending = [...adminRequests, ...fieldRequests];
  const urgent = pending.filter((r) => r.urgency === "ASAP");

  return (
    <PortalShell portal="rep" userName={userName}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rep Dashboard</h1>
          <p className="text-sm text-slate-600">
            {pending.length} pending · {urgent.length} urgent
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInviteModal(true)}>
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
          <Button onClick={() => setShowCreateModal(true)} disabled={companies.length === 0}>
            <Plus className="h-4 w-4" />
            Create Provider Request
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {teamMetrics && teamMetrics.reportCount > 0 && teamMetrics.totals && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">People you oversee</h2>
          <p className="mt-1 text-xs text-slate-500">
            Operational metrics for your reporting line. Patient information is not included.
            A missed request reroutes to the designated manager.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {[
              { label: "Reps", value: teamMetrics.reportCount },
              { label: "Available", value: teamMetrics.totals.available },
              { label: "Active cases", value: teamMetrics.totals.active },
              { label: "Completed", value: teamMetrics.totals.completed },
              { label: "Escalated", value: teamMetrics.totals.escalated },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
          {teamMetrics.reports && teamMetrics.reports.length > 0 && (
            <p className="mt-3 text-sm text-slate-600">{teamMetrics.reports.join(", ")}</p>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Your Status</p>
          <div className="flex flex-wrap gap-2">
            {REP_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  status === s ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {REP_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">On-Call Schedule</p>
          <button
            onClick={toggleOnCall}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              onCall ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600"
            )}
          >
            {onCall ? "On Call — Active" : "Off Call"}
          </button>
        </div>
      </div>

      {adminRequests.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
            Admin Queue (Forwarded)
          </h2>
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
            {adminRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                role="company"
                currentUserId={userId}
                availableReps={companyReps}
                onAction={handleAction}
                onAssignRep={handleAssignRep}
              />
            ))}
          </div>
        </section>
      )}

      {urgent.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase text-red-600">ASAP Requests</h2>
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
            {urgent.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                role="rep"
                currentUserId={userId}
                onAction={handleAction}
                onRefresh={loadData}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">Your Assignments</h2>
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : fieldRequests.length === 0 && adminRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">No pending requests</p>
            <Button className="mt-3" variant="secondary" onClick={() => updateStatus("AVAILABLE")}>
              Go Available
            </Button>
          </div>
        ) : fieldRequests.length === 0 ? (
          <p className="text-slate-500">No active field assignments.</p>
        ) : (
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
            {fieldRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                role="rep"
                currentUserId={userId}
                onAction={handleAction}
                onRefresh={loadData}
              />
            ))}
          </div>
        )}
      </section>

      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}

      {forwardRequestId && (
        <ForwardRequestModal
          requestId={forwardRequestId}
          onClose={() => setForwardRequestId(null)}
          onSuccess={loadData}
        />
      )}

      {showCreateModal && companies.length > 0 && (
        <RequestRepModal
          mode="rep"
          companies={companies}
          currentRepId={userId}
          defaultCompanyId={companyId ?? undefined}
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadData}
        />
      )}
    </PortalShell>
  );
}
