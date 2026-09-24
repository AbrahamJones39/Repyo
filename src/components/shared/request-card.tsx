"use client";

import { StatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPipeline } from "@/components/shared/status-pipeline";
import { format } from "date-fns";
import { Heart, MapPin, Phone, User, X, Cpu, ArrowRightLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import {
  RequestReplies,
  type RequestReply,
} from "@/components/shared/request-replies";

export interface RequestData {
  id: string;
  facilityName: string;
  facilityAddr?: string;
  facilityZipCode?: string | null;
  procedureType: string;
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
  const [expanded, setExpanded] = useState(showPipeline);
  const [selectedRepId, setSelectedRepId] = useState("");
  const [opening, setOpening] = useState(false);
  const [localRequest, setLocalRequest] = useState(request);
  const [openError, setOpenError] = useState("");

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
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not acknowledge request");
    } finally {
      setOpening(false);
    }
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
            <p className="mt-1 text-sm text-slate-600">{localRequest.procedureType}</p>
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
            {role === "company" && localRequest.provider && (
              <p className="text-xs text-slate-500">
                Provider: {localRequest.provider.name}
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
            {role !== "company" && localRequest.company && (
              <p className="text-xs text-slate-500">{localRequest.company.name}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {format(new Date(localRequest.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <StatusBadge status={localRequest.status} />
        </div>

        {(expanded || showPipeline) && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <StatusPipeline currentStatus={localRequest.status} />
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

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {needsAck && (
          <Button size="lg" className="w-full sm:w-auto" onClick={acknowledge} disabled={opening}>
            {opening ? "Acknowledging..." : "Acknowledge"}
          </Button>
        )}

        {!showPipeline && !needsAck && (
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Hide" : "Track"} Status
          </Button>
        )}

        {canManageAsAdmin && localRequest.status === "REQUESTING" && onAction && (
          <Button size="sm" onClick={() => onAction("ACCEPTED", localRequest.id)}>
            Accept
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

        {canRespond && onAction && (
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button size="lg" className="flex-1" onClick={() => onAction("ACCEPTED", localRequest.id)}>
              Accept
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => onAction("DECLINE", localRequest.id)}
            >
              Decline
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => onAction("FORWARD", localRequest.id)}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Forward
            </Button>
          </div>
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
    </div>
  );
}
