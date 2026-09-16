"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
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
  type CalendarBlockPreview,
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
}

interface RepCalendarData {
  id: string;
  name: string;
  status: string;
  blocks: { id: string; type: string; startAt: string; endAt: string; note?: string | null }[];
  requests: CalendarRequest[];
}

const REP_COLORS = [
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-violet-100 text-violet-800 border-violet-200",
];

export function CompanyCalendarPage({ userName }: { userName: string }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [reps, setReps] = useState<RepCalendarData[]>([]);
  const [selectedRepId, setSelectedRepId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CalendarRequestPreview | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlockPreview | null>(null);
  const [overflowDay, setOverflowDay] = useState<{
    date: Date;
    requests: CalendarRequestPreview[];
    blocks: CalendarBlockPreview[];
  } | null>(null);

  const monthKey = format(viewDate, "yyyy-MM");

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ month: monthKey });
      if (selectedRepId !== "all") params.set("repId", selectedRepId);
      const data = await fetchJson<{ reps: RepCalendarData[] }>(
        `/api/company/calendar?${params.toString()}`
      );
      setReps(data.reps ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
      setReps([]);
    } finally {
      setLoading(false);
    }
  }, [monthKey, selectedRepId]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const padding = monthStart.getDay();

  const allRequests = useMemo(
    () => reps.flatMap((rep) => rep.requests.map((r) => ({ ...r, repName: rep.name, repId: rep.id }))),
    [reps]
  );

  const colorByRep = useMemo(() => {
    const map = new Map<string, string>();
    reps.forEach((rep, i) => {
      map.set(rep.id, REP_COLORS[i % REP_COLORS.length]);
    });
    return map;
  }, [reps]);

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rep Calendar</h1>
          <p className="text-sm text-slate-600">
            View schedules, time off, and assigned cases across your team
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">Filter rep:</label>
        <select
          value={selectedRepId}
          onChange={(e) => setSelectedRepId(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">All reps</option>
          {reps.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {rep.name} ({rep.status.replace("_", " ")})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        {reps.map((rep) => (
          <span
            key={rep.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              colorByRep.get(rep.id)
            )}
          >
            {rep.name}
          </span>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {viewMode === "day" ? (
          <CalendarDayView
            date={viewDate}
            loading={loading}
            events={[
              ...reps.flatMap((rep) =>
                rep.blocks
                  .filter(
                    (b) =>
                      new Date(b.startAt) <= viewDate && new Date(b.endAt) >= viewDate
                  )
                  .map((block) => ({
                    id: block.id,
                    title: `${rep.name.split(" ")[0]} · ${block.type === "VACATION" ? "Vacation" : "Off"}`,
                    startAt: block.startAt,
                    endAt: block.endAt,
                    allDay: true,
                    className: "border-transparent bg-slate-100 text-slate-600",
                    onClick: () =>
                      setSelectedBlock({
                        id: block.id,
                        type: block.type as "VACATION" | "OFF",
                        startAt: block.startAt,
                        endAt: block.endAt,
                        note: block.note,
                        repName: rep.name,
                      }),
                  }))
              ),
              ...allRequests
                .filter((r) => isSameDay(new Date(r.scheduledAt), viewDate))
                .map((req) => ({
                  id: req.id,
                  title: req.facilityName,
                  subtitle: req.repName,
                  startAt: req.scheduledAt,
                  className:
                    colorByRep.get(req.repId) ??
                    "border-slate-200 bg-slate-100 text-slate-700",
                  onClick: () =>
                    setSelectedRequest({
                      id: req.id,
                      facilityName: req.facilityName,
                      procedureType: req.procedureType,
                      scheduledAt: req.scheduledAt,
                      status: req.status,
                      urgency: req.urgency,
                      repName: req.repName,
                    }),
                })),
            ]}
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
                  const dayRequests = allRequests.filter((r) =>
                    isSameDay(new Date(r.scheduledAt), day)
                  );
                  const dayBlocks = reps.flatMap((rep) =>
                    rep.blocks
                      .filter(
                        (b) =>
                          new Date(b.startAt) <= day &&
                          new Date(b.endAt) >= day
                      )
                      .map((b) => ({ ...b, repName: rep.name, repId: rep.id }))
                  );

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[100px] rounded-lg border p-1.5",
                        isSameMonth(day, viewDate)
                          ? "border-slate-100 bg-white"
                          : "border-transparent bg-slate-50 text-slate-400"
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
                        {dayBlocks.slice(0, 2).map((block) => (
                          <button
                            key={block.id}
                            type="button"
                            onClick={() =>
                              setSelectedBlock({
                                id: block.id,
                                type: block.type as "VACATION" | "OFF",
                                startAt: block.startAt,
                                endAt: block.endAt,
                                note: block.note,
                                repName: block.repName,
                              })
                            }
                            className={cn(
                              calendarEventChipClass,
                              "block w-full border-transparent bg-slate-100 text-left text-slate-600"
                            )}
                            title={`${block.repName}: ${block.type}`}
                          >
                            {block.repName.split(" ")[0]} · {block.type === "VACATION" ? "Vacation" : "Off"}
                          </button>
                        ))}
                        {dayRequests.slice(0, 3).map((req) => (
                          <button
                            key={req.id}
                            type="button"
                            onClick={() =>
                              setSelectedRequest({
                                id: req.id,
                                facilityName: req.facilityName,
                                procedureType: req.procedureType,
                                scheduledAt: req.scheduledAt,
                                status: req.status,
                                urgency: req.urgency,
                                repName: req.repName,
                              })
                            }
                            className={cn(
                              calendarEventChipClass,
                              "block w-full text-left",
                              colorByRep.get(req.repId)
                            )}
                            title={`${req.repName} — ${req.facilityName}`}
                          >
                            {format(new Date(req.scheduledAt), "h:mm a")} {req.facilityName}
                          </button>
                        ))}
                        {(dayRequests.length > 3 || dayBlocks.length > 2) && (
                          <button
                            type="button"
                            onClick={() =>
                              setOverflowDay({
                                date: day,
                                requests: dayRequests.map((req) => ({
                                  id: req.id,
                                  facilityName: req.facilityName,
                                  procedureType: req.procedureType,
                                  scheduledAt: req.scheduledAt,
                                  status: req.status,
                                  urgency: req.urgency,
                                  repName: req.repName,
                                })),
                                blocks: dayBlocks.map((block) => ({
                                  id: block.id,
                                  type: block.type as "VACATION" | "OFF",
                                  startAt: block.startAt,
                                  endAt: block.endAt,
                                  note: block.note,
                                  repName: block.repName,
                                })),
                              })
                            }
                            className="text-[10px] text-slate-500 hover:text-slate-800 hover:underline"
                          >
                            +{Math.max(0, dayRequests.length - 3) + Math.max(0, dayBlocks.length - 2)} more
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
          Upcoming assignments
        </h2>
        <div className="space-y-2">
          {allRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No assignments this month.</p>
          ) : (
            allRequests.slice(0, 12).map((req) => (
              <button
                key={req.id}
                type="button"
                onClick={() =>
                  setSelectedRequest({
                    id: req.id,
                    facilityName: req.facilityName,
                    procedureType: req.procedureType,
                    scheduledAt: req.scheduledAt,
                    status: req.status,
                    urgency: req.urgency,
                    repName: req.repName,
                  })
                }
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm transition hover:border-rose-200 hover:bg-rose-50/30"
              >
                <div>
                  <p className="font-medium text-slate-900">{req.facilityName}</p>
                  <p className="text-xs text-slate-500">
                    {req.repName} · {req.procedureType ?? "Request"} · {req.status}
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  {format(new Date(req.scheduledAt), "MMM d, h:mm a")}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      {selectedRequest && (
        <CalendarEventModal
          kind="request"
          preview={selectedRequest}
          role="company"
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {selectedBlock && (
        <CalendarEventModal
          kind="block"
          block={selectedBlock}
          onClose={() => setSelectedBlock(null)}
        />
      )}

      {overflowDay && (
        <CalendarDayOverflowModal
          date={overflowDay.date}
          requests={overflowDay.requests}
          blocks={overflowDay.blocks}
          onSelectRequest={setSelectedRequest}
          onSelectBlock={setSelectedBlock}
          onClose={() => setOverflowDay(null)}
        />
      )}
    </PortalShell>
  );
}
