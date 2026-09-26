"use client";

import { StatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPipeline } from "@/components/shared/status-pipeline";
import { format, isToday, isTomorrow } from "date-fns";
import { Heart, MapPin, Phone, User, X, Cpu, ArrowRightLeft, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import {
  RequestReplies,
  type RequestReply,
} from "@/components/shared/request-replies";
import { ShareRequestModal, type RequestShareInfo } from "@/components/provider/share-request-modal";

export interface RequestData {
  id: string;
  facilityName: string;
  facilityAddr?: string;
  facilityZipCode?: string | null;
  procedureType: string;
  requestType?: string;
  urgency: string;
  status: string;
  scheduledAt: string;
  department?: string;
  physicianName?: string;
  notes?: string | null;
  repLat?: number | null;
  repLng?: number | null;
  etaMinutes?: number | null;
  assignedRep?: { id: string; name: string; phone: string | null } | null;
  assignedAdmin?: { id: string; name: string } | null;
  provider?: { id: string; name: string; phone: string | null } | null;
  initiatedByRep?: { id: string; name: string; phone: string | null } | null;
  requesterName?: string | null;
  company?: { name: string } | null;
  deviceManufacturer?: string | null;
  deviceName?: string | null;
  deviceSerial?: string | null;
  crmLookupStatus?: string | null;
  phiRestricted?: boolean;
  identifiersHidden?: boolean;
  acknowledgedAt?: string | null;
  alertActive?: boolean;
  routingExpandedAt?: string | null;
  coverageStatus?: string | null;
  statusLogs?: { status: string; createdAt: string; note?: string | null }[];
  replies?: RequestReply[];
  shares?: RequestShareInfo[];
  activity?: { id: string; at: string; label: string }[];
  isRequestOwner?: boolean;
  isSharedWithMe?: boolean;
  sharedWithMeBy?: string | null;
  sharedWithMeReason?: string | null;
}

interface RepOption {
  id: string;
  name: string;
}

export function RequestCard({
  request,
  onAction,
  onAssignRep,
  onFavorite,
  isFavorite,
  role,
  showPipeline = false,
  availableReps = [],
  currentUserId,
  onRefresh,
}: {
  request: RequestData;
  onAction?: (action: string, requestId: string) => void;
  onAssignRep?: (requestId: string, repId: string) => void;
  onFavorite?: (repId: string) => void;
  isFavorite?: boolean;
  role: "provider" | "rep" | "company";
  showPipeline?: boolean;
  availableReps?: RepOption[];
  currentUserId?: string;
  onRefresh?: () => void;
}) {
  const [expanded, setExpanded] = useState(showPipeline && !request.isSharedWithMe);
  const [selectedRepId, setSelectedRepId] = useState("");
  const [opening, setOpening] = useState(false);
  const [localRequest, setLocalRequest] = useState(request);
  const [openError, setOpenError] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    setLocalRequest(request);
  }, [request]);

  const isCoverageAssignee =
    Boolean(currentUserId) &&
    (localRequest.assignedRep?.id === currentUserId ||
      (!localRequest.assignedRep && localRequest.assignedAdmin?.id === currentUserId));
  const isAssignedRep = (role === "rep" || role === "company") && isCoverageAssignee;
  const needsAck =
    isAssignedRep &&
    !localRequest.acknowledgedAt &&
    ["REQUESTING", "ACCEPTED"].includes(localRequest.status);
  const canRespond =
    isAssignedRep &&
    localRequest.status === "REQUESTING" &&
    Boolean(localRequest.acknowledgedAt);
  const canForwardAfterAccept =
    isAssignedRep &&
    localRequest.status === "ACCEPTED" &&
    Boolean(localRequest.acknowledgedAt);

  async function acknowledge() {
    setOpening(true);
    setOpenError("");
    try {
      await fetchJson(`/api/requests/${localRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACKNOWLEDGE" }),
      });
      const detail = await fetchJson<RequestData>(`/api/requests/${localRequest.id}`);
      setLocalRequest((prev) => ({ ...prev, ...detail, acknowledgedAt: detail.acknowledgedAt ?? new Date().toISOString() }));
      setExpanded(true);
      onRefresh?.();
      return true;
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not acknowledge request");
      return false;
    } finally {
      setOpening(false);
    }
  }

  async function toggleExpanded() {
    if (localRequest.isSharedWithMe && !expanded) {
      try {
        const detail = await fetchJson<RequestData>(`/api/requests/${localRequest.id}`);
        setLocalRequest((prev) => ({ ...prev, ...detail }));
      } catch (err) {
        setOpenError(err instanceof Error ? err.message : "Could not open request");
        return;
      }
    }
    setExpanded((value) => !value);
  }

  async function respond(action: "ACCEPTED" | "FORWARD" | "DECLINE") {
    if (!localRequest.acknowledgedAt) {
      const ok = await acknowledge();
      if (!ok) return;
    }
    onAction?.(action, localRequest.id);
  }

  const canManageAsAdmin = role === "company";
  const showRepAckStatus =
    canManageAsAdmin &&
    localRequest.assignedRep &&
    ["REQUESTING", "ACCEPTED"].includes(localRequest.status);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{localRequest.facilityName}</h3>
              <UrgencyBadge urgency={localRequest.urgency} />
              {localRequest.alertActive && isAssignedRep && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                  New
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {localRequest.requestType === "CHECK" ? "Check — " : localRequest.requestType === "CASE" ? "Case — " : ""}
              {localRequest.procedureType}
            </p>
            {localRequest.physicianName && (
              <p className="text-sm text-slate-800">{localRequest.physicianName}</p>
            )}
            {localRequest.facilityAddr && (
              <p className="text-xs text-slate-500">{localRequest.facilityAddr}</p>
            )}
            {localRequest.identifiersHidden && (role === "rep" || role === "company") && (
              <p className="text-xs font-medium text-amber-700">
                {needsAck
                  ? "Acknowledge this request to stop alerts and view protected details"
                  : "Protected details available after acknowledgment"}
              </p>
            )}
            {canRespond && (
              <p className="text-xs font-medium text-emerald-700">
                Acknowledged — choose Accept, Forward, or Decline
              </p>
            )}
            {role !== "provider" && localRequest.provider && (
              <p className="text-xs text-slate-500">
                {role === "company" ? "Provider" : "Created by"}: {localRequest.provider.name}
              </p>
            )}
            {!localRequest.provider && localRequest.initiatedByRep && (
              <p className="text-xs text-slate-500">
                Created by rep: {localRequest.initiatedByRep.name}
              </p>
            )}
            {localRequest.requesterName && (
              <p className="text-xs text-slate-500">
                Requester: {localRequest.requesterName}
              </p>
            )}
            {localRequest.isSharedWithMe && (
              <div className="mt-2 space-y-0.5 text-xs text-rose-800">
                <p>Created by: {localRequest.provider?.name ?? localRequest.initiatedByRep?.name ?? "A coworker"}</p>
                <p>Shared with you by: {localRequest.sharedWithMeBy ?? "a coworker"}</p>
                {localRequest.sharedWithMeReason && <p>Reason: {localRequest.sharedWithMeReason}</p>}
                {localRequest.phiRestricted !== false && <p className="font-medium">Patient details restricted</p>}
              </div>
            )}
            {role === "provider" && coverageSummary(localRequest) && (
              <p className="mt-1 text-xs font-medium text-slate-700">{coverageSummary(localRequest)}</p>
            )}
            {role !== "company" && localRequest.company && (
              <p className="text-xs text-slate-500">{localRequest.company.name}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {scheduleLabel(localRequest.scheduledAt)}
            </p>
          </div>
          <StatusBadge status={localRequest.status} />
        </div>

        <PeopleWithAccess request={localRequest} />

        {(expanded || (showPipeline && !localRequest.isSharedWithMe)) && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <StatusPipeline currentStatus={localRequest.status} />
            {(localRequest.activity?.length ?? 0) > 0 && (
              <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {localRequest.activity?.map((item) => (
                    <li key={item.id}>
                      {format(new Date(item.at), "h:mm a")} — {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {localRequest.department && (
              <p className="mt-2 text-xs text-slate-500">
                {localRequest.department}
                {localRequest.physicianName ? ` · ${localRequest.physicianName}` : ""}
              </p>
            )}
            {localRequest.notes && (
              <p className="mt-2 text-sm text-slate-600">{localRequest.notes}</p>
            )}
            {(localRequest.deviceManufacturer || localRequest.deviceName) &&
              (role === "rep" || role === "company") && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Cpu className="h-4 w-4 shrink-0 text-rose-500" />
                    <span className="font-medium">Device (CRM)</span>
                  </div>
                  {localRequest.deviceManufacturer && (
                    <p className="mt-1 text-xs text-slate-600">
                      Manufacturer: {localRequest.deviceManufacturer}
                    </p>
                  )}
                  {localRequest.deviceName && (
                    <p className="text-xs text-slate-800">{localRequest.deviceName}</p>
                  )}
                  {localRequest.deviceSerial && (
                    <p className="text-xs text-slate-500">Serial: {localRequest.deviceSerial}</p>
                  )}
                </div>
              )}
          </div>
        )}

        {canManageAsAdmin && localRequest.status === "REQUESTING" && (
          <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            New request — accept and assign a rep
          </div>
        )}

        {showRepAckStatus && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
              localRequest.acknowledgedAt
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900"
            }`}
          >
            {localRequest.acknowledgedAt ? (
              <>
                Seen by {localRequest.assignedRep!.name} ·{" "}
                {format(new Date(localRequest.acknowledgedAt), "MMM d, h:mm a")}
              </>
            ) : (
              <>Waiting for {localRequest.assignedRep!.name} to open this assignment</>
            )}
          </div>
        )}

        {!localRequest.isSharedWithMe && (
          <RequestReplies
            requestId={localRequest.id}
            replies={localRequest.replies ?? []}
            currentUserId={currentUserId}
            onPosted={(reply) =>
              setLocalRequest((prev) => ({
                ...prev,
                replies: [...(prev.replies ?? []), reply],
              }))
            }
          />
        )}

        {localRequest.assignedRep && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{localRequest.assignedRep.name}</span>
            </div>
            {localRequest.assignedRep.phone && (
              <a
                href={`tel:${localRequest.assignedRep.phone}`}
                className="flex items-center gap-1 text-rose-600 hover:underline"
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            )}
            {localRequest.etaMinutes != null &&
              localRequest.repLat != null &&
              localRequest.status === "EN_ROUTE" && (
              <span className="flex items-center gap-1 text-slate-500">
                <MapPin className="h-4 w-4" />
                ETA {localRequest.etaMinutes} min
              </span>
            )}
            {role === "provider" && onFavorite && localRequest.assignedRep && (
              <button
                onClick={() => onFavorite(localRequest.assignedRep!.id)}
                className="flex items-center gap-1 text-rose-500 hover:text-rose-700"
              >
                <Heart className={`h-4 w-4 ${isFavorite ? "fill-rose-500" : ""}`} />
                {isFavorite ? "Favorited" : "Favorite"}
              </button>
            )}
          </div>
        )}
      </div>

      {openError && (
        <p className="mt-2 text-xs text-red-600">{openError}</p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {role === "provider" && localRequest.isRequestOwner && (
          <Button size="sm" variant="outline" onClick={() => setShowShareModal(true)}>
            <Share2 className="h-4 w-4" />
            Share / Handoff
          </Button>
        )}
        {isAssignedRep && localRequest.status === "REQUESTING" && onAction && (
          <div className="grid gap-2">
            {needsAck && (
              <Button size="lg" onClick={acknowledge} disabled={opening}>
                {opening ? "Acknowledging..." : "Acknowledge"}
              </Button>
            )}
            <Button size="lg" disabled={opening} onClick={() => void respond("ACCEPTED")}>
              Accept
            </Button>
            <Button size="lg" variant="outline" disabled={opening} onClick={() => void respond("FORWARD")}>
              Forward
            </Button>
            <Button size="lg" variant="outline" disabled={opening} onClick={() => void respond("DECLINE")}>
              Decline
            </Button>
          </div>
        )}

        {(!showPipeline || localRequest.isSharedWithMe) && !needsAck && (
          <Button size="sm" variant="ghost" onClick={() => void toggleExpanded()}>
            {expanded ? "Hide" : "Track"} Status
          </Button>
        )}

        {canManageAsAdmin &&
          ["REQUESTING", "ACCEPTED"].includes(localRequest.status) &&
          onAssignRep &&
          availableReps.length > 0 && (
            <>
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              >
                <option value="">Assign rep...</option>
                {availableReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedRepId}
                onClick={() => {
                  if (selectedRepId) onAssignRep(localRequest.id, selectedRepId);
                }}
              >
                Assign
              </Button>
            </>
          )}

        {role === "provider" && localRequest.routingExpandedAt && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Coverage not yet acknowledged. Routing is open to other managers who cover this location.
          </div>
        )}

        {canManageAsAdmin && !isAssignedRep && localRequest.status === "REQUESTING" && onAction && (
          <Button size="sm" onClick={() => onAction("ACCEPTED", localRequest.id)}>
            Accept
          </Button>
        )}

        {role === "rep" &&
          localRequest.assignedRep &&
          localRequest.status === "ACCEPTED" &&
          localRequest.acknowledgedAt &&
          onAction && (
            <>
              <Button size="sm" onClick={() => onAction("EN_ROUTE", localRequest.id)}>
                Mark En Route
              </Button>
              {canForwardAfterAccept && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction("FORWARD", localRequest.id)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Forward
                </Button>
              )}
            </>
          )}

        {role === "rep" && localRequest.status === "EN_ROUTE" && onAction && (
          <Button size="sm" onClick={() => onAction("ARRIVED", localRequest.id)}>
            Mark Arrived
          </Button>
        )}

        {role === "rep" && localRequest.status === "ARRIVED" && onAction && (
          <Button size="sm" onClick={() => onAction("COMPLETED", localRequest.id)}>
            Complete Request
          </Button>
        )}

        {role === "provider" &&
          localRequest.isRequestOwner !== false &&
          !localRequest.isSharedWithMe &&
          !["COMPLETED", "CANCELLED", "DECLINED"].includes(localRequest.status) &&
          onAction && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("CANCELLED", localRequest.id)}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
      </div>
      {showShareModal && (
        <ShareRequestModal
          requestId={localRequest.id}
          shares={localRequest.shares ?? []}
          onClose={() => setShowShareModal(false)}
          onChange={() => onRefresh?.()}
        />
      )}
    </div>
  );
}

function scheduleLabel(iso: string) {
  const date = new Date(iso);
  const day = isToday(date) ? "Today" : isTomorrow(date) ? "Tomorrow" : format(date, "MMM d, yyyy");
  return `${day} · ${format(date, "h:mm a")}`;
}

function coverageSummary(request: RequestData) {
  const name = request.assignedRep?.name;
  switch (request.status) {
    case "REQUESTING":
      return name ? `Waiting for ${name}` : "Waiting for a rep";
    case "ACCEPTED":
      return name ? `${name} accepted` : "Rep accepted";
    case "EN_ROUTE":
      return name ? `${name} is on the way` : "Rep is on the way";
    case "ARRIVED":
      return name ? `${name} arrived` : "Rep arrived";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "DECLINED":
      return "Declined";
    default:
      return "";
  }
}

function repAccessLabel(status: string) {
  switch (status) {
    case "ACCEPTED":
      return "Accepted / Assigned";
    case "EN_ROUTE":
      return "On the way";
    case "ARRIVED":
      return "Arrived";
    case "COMPLETED":
      return "Completed";
    case "DECLINED":
      return "Declined";
    default:
      return "Notified";
  }
}

function PeopleWithAccess({ request }: { request: RequestData }) {
  const rows = [
    request.provider ? { key: `creator-${request.provider.id}`, name: request.provider.name, detail: "Creator" } : null,
    request.initiatedByRep && !request.provider
      ? { key: `rep-creator-${request.initiatedByRep.id}`, name: request.initiatedByRep.name, detail: "Created by rep" }
      : null,
    request.physicianName
      ? { key: "physician", name: request.physicianName, detail: "Requesting physician" }
      : null,
    ...(request.shares ?? []).map((share) => ({
      key: share.id,
      name: share.user.name,
      detail: `Shared · ${share.reason}`,
      permissions: true,
      phiAccess: share.phiAccess === true,
    })),
    request.assignedRep
      ? { key: `assigned-${request.assignedRep.id}`, name: `Rep: ${request.assignedRep.name}`, detail: repAccessLabel(request.status) }
      : null,
  ].filter((row): row is { key: string; name: string; detail: string; permissions?: boolean; phiAccess?: boolean } => Boolean(row));

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        People with access ({rows.length})
      </p>
      <ul className="mt-2 space-y-2 text-xs text-slate-700">
        {rows.map((row) => (
          <li key={row.key}>
            <p>{row.name} — {row.detail}</p>
            {row.permissions && (
              <p className="text-[11px] text-slate-500">
                Request access ✓ · PHI access {row.phiAccess ? "✓" : "— Restricted"}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
