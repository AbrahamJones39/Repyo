"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CalendarDayOverflowModal,
  CalendarEventModal,
  calendarEventChipClass,
  type CalendarRequestPreview,
} from "@/components/shared/calendar-event-modal";
import {
  CalendarDayView,
  CalendarViewToggle,
  type CalendarViewMode,
} from "@/components/shared/calendar-day-view";

interface CalendarRequest {
  id: string;
  facilityName: string;
  procedureType: string | null;
  scheduledAt: string;
  status: string;
  urgency: string;
  companyName: string;
  assignedRep: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTING: "bg-amber-100 text-amber-800 border-amber-200",
  ACCEPTED: "bg-indigo-100 text-indigo-800 border-indigo-200",
  EN_ROUTE: "bg-purple-100 text-purple-800 border-purple-200",
  ARRIVED: "bg-rose-100 text-rose-800 border-rose-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function ProviderCalendarPage({ userName }: { userName: string }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [requests, setRequests] = useState<CalendarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CalendarRequestPreview | null>(null);
  const [overflowDay, setOverflowDay] = useState<{
    date: Date;
    requests: CalendarRequestPreview[];
  } | null>(null);

  const monthKey = format(viewDate, "yyyy-MM");

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ requests: CalendarRequest[] }>(
        `/api/provider/calendar?month=${monthKey}`
      );
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const padding = monthStart.getDay();

  const requestsByDay = useMemo(() => {
    const map = new Map<string, CalendarRequest[]>();
    for (const req of requests) {
      const key = format(new Date(req.scheduledAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(req);
    }
    return map;
  }, [requests]);

  const upcoming = useMemo(
    () =>
      [...requests]
        .filter((r) => new Date(r.scheduledAt) >= new Date())
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        ),
    [requests]
  );

  return (
    <PortalShell portal="provider" userName={userName}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-600">
            Your scheduled rep requests and case coverage
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarViewToggle view={viewMode} onChange={setViewMode} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setViewDate(viewMode === "day" ? subDays(viewDate, 1) : subMonths(viewDate, 1))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-center font-medium text-slate-900">
            {viewMode === "day"
              ? format(viewDate, "EEEE, MMM d, yyyy")
              : format(viewDate, "MMMM yyyy")}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setViewDate(new Date())}>
            Today
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setViewDate(viewMode === "day" ? addDays(viewDate, 1) : addMonths(viewDate, 1))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-amber-200 bg-amber-100" />
          Pending
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-indigo-200 bg-indigo-100" />
          Accepted / en route
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-100" />
          Completed
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {viewMode === "day" ? (
          <CalendarDayView
            date={viewDate}
            loading={loading}
            events={(requestsByDay.get(format(viewDate, "yyyy-MM-dd")) ?? []).map((req) => ({
              id: req.id,
              title: req.facilityName,
              subtitle: req.assignedRep?.name ?? req.companyName,
              startAt: req.scheduledAt,
              className: STATUS_COLORS[req.status] ?? "bg-slate-100 text-slate-700 border-slate-200",
              onClick: () => setSelectedRequest(req),
            }))}
          />
        ) : (
          <>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {loading ? (
              <p className="py-12 text-center text-slate-500">Loading calendar...</p>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: padding }).map((_, i) => (
                  <div key={`pad-${i}`} className="min-h-[100px] rounded-lg bg-slate-50/50" />
                ))}
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayRequests = requestsByDay.get(key) ?? [];
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={key}
                      className={cn(
                        "min-h-[100px] rounded-lg border p-1.5",
                        isSameMonth(day, viewDate)
                          ? "border-slate-100 bg-white"
                          : "border-transparent bg-slate-50 text-slate-400",
                        isToday && "ring-2 ring-rose-300"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setViewDate(day);
                          setViewMode("day");
                        }}
                        className="mb-1 text-xs font-medium text-slate-700 hover:text-rose-700 hover:underline"
                      >
                        {format(day, "d")}
                      </button>
                      <div className="space-y-1">
                        {dayRequests.slice(0, 3).map((req) => (
                          <button
                            key={req.id}
                            type="button"
                            onClick={() => setSelectedRequest(req)}
                            className={cn(
                              calendarEventChipClass,
                              "block w-full text-left",
                              STATUS_COLORS[req.status] ??
                                "bg-slate-100 text-slate-700 border-slate-200"
                            )}
                            title={`${req.facilityName}${req.assignedRep ? ` — ${req.assignedRep.name}` : ""}`}
                          >
                            {format(new Date(req.scheduledAt), "h:mm a")} {req.facilityName}
                          </button>
                        ))}
                        {dayRequests.length > 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              setOverflowDay({ date: day, requests: dayRequests })
                            }
                            className="text-[10px] text-slate-500 hover:text-slate-800 hover:underline"
                          >
                            +{dayRequests.length - 3} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
          Upcoming requests
        </h2>
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming requests this month.</p>
          ) : (
            upcoming.slice(0, 15).map((req) => (
              <button
                key={req.id}
                type="button"
                onClick={() => setSelectedRequest(req)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm transition hover:border-rose-200 hover:bg-rose-50/30"
              >
                <div>
                  <p className="font-medium text-slate-900">{req.facilityName}</p>
                  <p className="text-xs text-slate-500">
                    {req.procedureType ?? "Request"} · {req.companyName}
                    {req.assignedRep ? ` · ${req.assignedRep.name}` : " · Awaiting rep"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={req.status} />
                  <p className="text-xs text-slate-600">
                    {format(new Date(req.scheduledAt), "MMM d, h:mm a")}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {selectedRequest && (
        <CalendarEventModal
          kind="request"
          preview={selectedRequest}
          role="provider"
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {overflowDay && (
        <CalendarDayOverflowModal
          date={overflowDay.date}
          requests={overflowDay.requests}
          blocks={[]}
          onSelectRequest={setSelectedRequest}
          onSelectBlock={() => {}}
          onClose={() => setOverflowDay(null)}
        />
      )}
    </PortalShell>
  );
}
