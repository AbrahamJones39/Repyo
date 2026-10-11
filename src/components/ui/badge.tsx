import { cn } from "@/lib/utils";
import { REQUEST_STATUS_LABELS } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  REQUESTING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ACCEPTED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  EN_ROUTE: "bg-purple-50 text-purple-700 ring-purple-600/20",
  ARRIVED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CANCELLED: "bg-slate-50 text-slate-500 ring-slate-500/20",
  DECLINED: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_DOTS: Record<string, string> = {
  REQUESTING: "bg-amber-500",
  ACCEPTED: "bg-indigo-500",
  EN_ROUTE: "bg-purple-500",
  ARRIVED: "bg-rose-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
  DECLINED: "bg-red-500",
};

const PULSING = new Set(["REQUESTING", "EN_ROUTE"]);

const badgeBase =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({ status }: { status: string }) {
  const dot = STATUS_DOTS[status] ?? "bg-slate-400";
  return (
    <span className={cn(badgeBase, STATUS_COLORS[status] ?? "bg-slate-50 text-slate-600 ring-slate-500/20")}>
      <span className="relative flex h-1.5 w-1.5">
        {PULSING.has(status) && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden", dot)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dot)} />
      </span>
      {REQUEST_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const colors: Record<string, string> = {
    ASAP: "bg-red-50 text-red-700 ring-red-600/20",
    SAME_DAY: "bg-orange-50 text-orange-700 ring-orange-600/20",
    SCHEDULED: "bg-slate-50 text-slate-600 ring-slate-500/20",
  };

  const labels: Record<string, string> = {
    ASAP: "ASAP",
    SAME_DAY: "Same Day",
    SCHEDULED: "Scheduled",
  };

  return (
    <span className={cn(badgeBase, colors[urgency] ?? "bg-slate-50 text-slate-600 ring-slate-500/20")}>
      {labels[urgency] ?? urgency}
    </span>
  );
}
