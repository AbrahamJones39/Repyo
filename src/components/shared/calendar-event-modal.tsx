"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Building2,
  Calendar,
  Clock,
  MapPin,
  Phone,
  Stethoscope,
  User,
  X,
} from "lucide-react";
import { StatusBadge, UrgencyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPipeline } from "@/components/shared/status-pipeline";
import type { RequestData } from "@/components/shared/request-card";
import { RequestReplies } from "@/components/shared/request-replies";
import { fetchJson } from "@/lib/api-client";

export type CalendarRequestPreview = {
  id: string;
  facilityName: string;
  procedureType?: string | null;
  scheduledAt: string;
  status: string;
  urgency?: string;
  companyName?: string;
  repName?: string;
  assignedRep?: { id: string; name: string } | null;
};

export type CalendarBlockPreview = {
  id: string;
  type: "VACATION" | "OFF";
  startAt: string;
  endAt: string;
  note?: string | null;
  repName?: string;
};

type CalendarEventModalProps =
  | {
      kind: "request";
      preview: CalendarRequestPreview;
      role: "provider" | "rep" | "company";
      onClose: () => void;
    }
  | {
      kind: "block";
      block: CalendarBlockPreview;
      onClose: () => void;
    };

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <div className="mt-0.5 text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function RequestEventModal({
  preview,
  role,
  onClose,
}: {
  preview: CalendarRequestPreview;
  role: "provider" | "rep" | "company";
  onClose: () => void;
}) {
  const [request, setRequest] = useState<RequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchJson<RequestData>(`/api/requests/${preview.id}`)
      .then(setRequest)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load request details");
      })
      .finally(() => setLoading(false));
  }, [preview.id]);

  const assignedRep =
    request?.assignedRep ??
    preview.assignedRep ??
    (preview.repName ? { id: "", name: preview.repName, phone: null } : null);
  const companyName = request?.company?.name ?? preview.companyName;

  const dashboardHref =
    role === "provider" ? "/provider" : role === "rep" ? "/rep" : "/company/requests";

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{preview.facilityName}</h2>
            <StatusBadge status={request?.status ?? preview.status} />
            <UrgencyBadge urgency={request?.urgency ?? preview.urgency ?? "SCHEDULED"} />
          </div>
          <p className="mt-1 text-sm text-slate-600">{preview.procedureType ?? "Request"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
        {loading && (
          <p className="text-sm text-slate-500">Loading details...</p>
        )}
        {error && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}. Showing summary from calendar.
          </div>
        )}

        {request?.identifiersHidden && (role === "rep" || role === "company") && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Protected patient details are hidden until you open this request from your dashboard.
          </p>
        )}

        <DetailRow
          icon={<Calendar className="h-4 w-4" />}
          label="Scheduled"
          value={format(
            new Date(request?.scheduledAt ?? preview.scheduledAt),
            "EEEE, MMMM d, yyyy 'at' h:mm a"
          )}
        />

        {companyName && (
          <DetailRow
            icon={<Building2 className="h-4 w-4" />}
            label="Company"
            value={companyName}
          />
        )}

        {assignedRep && (
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Assigned rep"
            value={
              <span className="inline-flex flex-wrap items-center gap-2">
                {assignedRep.name}
                {"phone" in assignedRep && assignedRep.phone && (
                  <a
                    href={`tel:${assignedRep.phone}`}
                    className="inline-flex items-center gap-1 text-rose-600 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {assignedRep.phone}
                  </a>
                )}
              </span>
            }
          />
        )}

        {request?.provider && (
          <DetailRow
            icon={<Stethoscope className="h-4 w-4" />}
            label="Provider"
            value={request.provider.name}
          />
        )}

        {request?.requesterName && (
          <DetailRow
            icon={<User className="h-4 w-4" />}
            label="Requester"
            value={request.requesterName}
          />
        )}

        {request?.facilityAddr && (
          <DetailRow
            icon={<MapPin className="h-4 w-4" />}
            label="Facility address"
            value={
              <>
                {request.facilityAddr}
                {request.facilityZipCode ? ` · ${request.facilityZipCode}` : ""}
              </>
            }
          />
        )}

        {request?.department && (
          <DetailRow
            icon={<Building2 className="h-4 w-4" />}
            label="Department"
            value={
              <>
                {request.department}
                {request.physicianName ? ` · ${request.physicianName}` : ""}
              </>
            }
          />
        )}

        {request?.deviceManufacturer && (
          <DetailRow
            icon={<Stethoscope className="h-4 w-4" />}
            label="Device"
            value={
              <>
                {request.deviceManufacturer}
                {request.deviceName ? ` · ${request.deviceName}` : ""}
              </>
            }
          />
        )}

        {request?.notes && (
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Case notes" value={request.notes} />
        )}

        {request && (
          <RequestReplies
            requestId={request.id}
            replies={request.replies ?? []}
            onPosted={(reply) =>
              setRequest((prev) =>
                prev ? { ...prev, replies: [...(prev.replies ?? []), reply] } : prev
              )
            }
          />
        )}

        {request?.etaMinutes != null && request.status === "EN_ROUTE" && (
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="ETA"
            value={`~${request.etaMinutes} minutes`}
          />
        )}

        {!loading && request && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status progress
            </p>
            <StatusPipeline currentStatus={request.status} />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Link
          href={dashboardHref}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700"
        >
          Open in dashboard
        </Link>
      </div>
    </>
  );
}

function BlockEventModal({
  block,
  onClose,
}: {
  block: CalendarBlockPreview;
  onClose: () => void;
}) {
  const label = block.type === "VACATION" ? "Vacation" : "Time off";

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
          {block.repName && (
            <p className="mt-1 text-sm text-slate-600">{block.repName}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <DetailRow
          icon={<Calendar className="h-4 w-4" />}
          label="Dates"
          value={
            <>
              {format(new Date(block.startAt), "MMM d, yyyy")} –{" "}
              {format(new Date(block.endAt), "MMM d, yyyy")}
            </>
          }
        />
        {block.note && (
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Note" value={block.note} />
        )}
        <p className="text-xs text-slate-500">
          Providers cannot request this rep during this period.
        </p>
      </div>

      <div className="flex justify-end border-t border-slate-100 px-5 py-4">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}

export function CalendarEventModal(props: CalendarEventModalProps | null) {
  if (!props) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={props.onClose}
        aria-label="Close"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {props.kind === "request" ? (
          <RequestEventModal preview={props.preview} role={props.role} onClose={props.onClose} />
        ) : (
          <BlockEventModal block={props.block} onClose={props.onClose} />
        )}
      </div>
    </div>
  );
}

export function CalendarDayOverflowModal({
  date,
  requests,
  blocks,
  onSelectRequest,
  onSelectBlock,
  onClose,
}: {
  date: Date;
  requests: CalendarRequestPreview[];
  blocks: CalendarBlockPreview[];
  onSelectRequest: (request: CalendarRequestPreview) => void;
  onSelectBlock: (block: CalendarBlockPreview) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">
            {format(date, "EEEE, MMMM d")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              onClick={() => {
                onClose();
                onSelectBlock(block);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              <span className="font-medium text-slate-800">
                {block.type === "VACATION" ? "Vacation" : "Time off"}
                {block.repName ? ` · ${block.repName}` : ""}
              </span>
            </button>
          ))}
          {requests.map((req) => (
            <button
              key={req.id}
              type="button"
              onClick={() => {
                onClose();
                onSelectRequest(req);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 truncate font-medium text-slate-800">
                {req.facilityName}
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                {format(new Date(req.scheduledAt), "h:mm a")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const calendarEventChipClass =
  "cursor-pointer truncate rounded border px-1 py-0.5 text-[10px] transition hover:opacity-80 hover:ring-1 hover:ring-slate-300";
