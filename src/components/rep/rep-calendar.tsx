"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { dayName } from "@/lib/rep-availability";
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
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
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

interface ScheduleRule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  dayLabel?: string;
}

interface AvailabilityBlock {
  id: string;
  type: "VACATION" | "OFF";
  startAt: string;
  endAt: string;
  note?: string | null;
}

interface CalendarRequest {
  id: string;
  facilityName: string;
  procedureType: string | null;
  scheduledAt: string;
  status: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_RULES: ScheduleRule[] = [1, 2, 3, 4, 5].map((day) => ({
  dayOfWeek: day,
  startTime: "08:00",
  endTime: "17:00",
}));

export function RepCalendarPage({ userName }: { userName: string }) {
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [rules, setRules] = useState<ScheduleRule[]>(DEFAULT_RULES);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [requests, setRequests] = useState<CalendarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [vacationStart, setVacationStart] = useState("");
  const [vacationEnd, setVacationEnd] = useState("");
  const [vacationNote, setVacationNote] = useState("");
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
      const data = await fetchJson<{
        rules: ScheduleRule[];
        blocks: AvailabilityBlock[];
        requests: CalendarRequest[];
      }>(`/api/rep/calendar?month=${monthKey}`);
      setRules(data.rules.length > 0 ? data.rules : DEFAULT_RULES);
      setBlocks(data.blocks ?? []);
      setRequests(data.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const blocksByDay = useMemo(() => {
    const map = new Map<string, AvailabilityBlock[]>();
    for (const block of blocks) {
      const start = new Date(block.startAt);
      const end = new Date(block.endAt);
      for (const day of eachDayOfInterval({ start, end })) {
        const key = format(day, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(block);
      }
    }
    return map;
  }, [blocks]);

  const requestsByDay = useMemo(() => {
    const map = new Map<string, CalendarRequest[]>();
    for (const req of requests) {
      const key = format(new Date(req.scheduledAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(req);
    }
    return map;
  }, [requests]);

  function addRule() {
    setRules([...rules, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }]);
  }

  function updateRule(index: number, field: keyof ScheduleRule, value: string | number) {
    const next = [...rules];
    next[index] = { ...next[index], [field]: value };
    setRules(next);
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  async function saveRules() {
    setSavingRules(true);
    setMessage("");
    setError("");
    try {
      const data = await fetchJson<{ rules: ScheduleRule[] }>("/api/rep/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      setRules(data.rules.length > 0 ? data.rules : DEFAULT_RULES);
      setMessage("Weekly hours saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save hours");
    } finally {
      setSavingRules(false);
    }
  }

  async function addVacation() {
    if (!vacationStart || !vacationEnd) {
      setError("Select vacation start and end dates");
      return;
    }
    setSavingBlock(true);
    setError("");
    setMessage("");
    try {
      await fetchJson("/api/rep/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "VACATION",
          startAt: new Date(`${vacationStart}T00:00:00`).toISOString(),
          endAt: new Date(`${vacationEnd}T23:59:59`).toISOString(),
          note: vacationNote || undefined,
        }),
      });
      setVacationStart("");
      setVacationEnd("");
      setVacationNote("");
      setMessage("Vacation added");
      loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add vacation");
    } finally {
      setSavingBlock(false);
    }
  }

  async function removeBlock(id: string) {
    try {
      await fetch(`/api/rep/calendar?id=${id}`, { method: "DELETE" });
      loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove block");
    }
  }

  function dayHasAvailableHours(date: Date): boolean {
    const dayRules = rules.filter((r) => r.dayOfWeek === date.getDay());
    return dayRules.length > 0;
  }

  const selectedDayKey = format(viewDate, "yyyy-MM-dd");
  const selectedDayBlocks = blocksByDay.get(selectedDayKey) ?? [];
  const selectedDayRequests = requestsByDay.get(selectedDayKey) ?? [];
  const selectedDayRules = rules.filter((r) => r.dayOfWeek === viewDate.getDay());
  const selectedDayOnVacation = selectedDayBlocks.some((b) => b.type === "VACATION");

  return (
    <PortalShell portal="rep" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Calendar & Availability</h1>
        <p className="text-sm text-slate-600">
          Set your weekly hours and vacation. Providers cannot request you outside these times,
          and location/ETA sharing turns off when you are off.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">
                {viewMode === "day"
                  ? format(viewDate, "EEEE, MMM d, yyyy")
                  : format(viewDate, "MMMM yyyy")}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <CalendarViewToggle view={viewMode} onChange={setViewMode} />
                <button
                  type="button"
                  onClick={() =>
                    setViewDate(
                      viewMode === "day" ? subDays(viewDate, 1) : subMonths(viewDate, 1)
                    )
                  }
                  className="rounded-lg p-2 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewDate(new Date())}
                  className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setViewDate(
                      viewMode === "day" ? addDays(viewDate, 1) : addMonths(viewDate, 1)
                    )
                  }
                  className="rounded-lg p-2 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {viewMode === "day" ? (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  {selectedDayOnVacation
                    ? "Time off — not available for requests"
                    : selectedDayRules.length > 0
                      ? `Available ${selectedDayRules.map((r) => `${r.startTime}–${r.endTime}`).join(", ")}`
                      : "No weekly hours set for this day"}
                </p>
                <CalendarDayView
                  date={viewDate}
                  loading={loading}
                  events={[
                    ...selectedDayBlocks
                      .filter((b) => b.type === "VACATION")
                      .map((block) => ({
                        id: block.id,
                        title: "Vacation",
                        subtitle: block.note ?? undefined,
                        startAt: block.startAt,
                        endAt: block.endAt,
                        allDay: true,
                        className: "border-red-200 bg-red-50 text-red-700",
                        onClick: () =>
                          setSelectedBlock({
                            id: block.id,
                            type: block.type,
                            startAt: block.startAt,
                            endAt: block.endAt,
                            note: block.note,
                          }),
                      })),
                    ...selectedDayRequests.map((r) => ({
                      id: r.id,
                      title: r.facilityName,
                      subtitle: r.procedureType ?? undefined,
                      startAt: r.scheduledAt,
                      className: "border-blue-200 bg-blue-100 text-blue-800",
                      onClick: () => setSelectedRequest(r),
                    })),
                  ]}
                />
              </>
            ) : (
              <>
            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1 text-center text-xs font-medium text-slate-500">
                  {d}
                </div>
              ))}
            </div>

            {loading ? (
              <p className="py-12 text-center text-sm text-slate-500">Loading calendar...</p>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayBlocks = blocksByDay.get(key) ?? [];
                  const dayRequests = requestsByDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, viewDate);
                  const isToday = isSameDay(day, new Date());
                  const hasHours = dayHasAvailableHours(day);
                  const onVacation = dayBlocks.some((b) => b.type === "VACATION");

                  return (
                    <div
                      key={key}
                      className={cn(
                        "min-h-[72px] rounded-lg border p-1.5 text-xs",
                        inMonth ? "border-slate-200 bg-white" : "border-transparent bg-slate-50/50",
                        isToday && "ring-2 ring-rose-300",
                        onVacation && "bg-red-50 border-red-200",
                        !onVacation && hasHours && inMonth && "bg-emerald-50/60"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setViewDate(day);
                          setViewMode("day");
                        }}
                        className={cn(
                          "font-medium hover:underline",
                          inMonth ? "text-slate-900" : "text-slate-400"
                        )}
                      >
                        {format(day, "d")}
                      </button>
                      {dayRequests.slice(0, 2).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedRequest(r)}
                          className={cn(
                            calendarEventChipClass,
                            "mt-0.5 block w-full border-blue-200 bg-blue-100 text-left text-blue-800"
                          )}
                          title={r.facilityName}
                        >
                          {format(new Date(r.scheduledAt), "h:mm a")} {r.facilityName}
                        </button>
                      ))}
                      {dayRequests.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOverflowDay({
                              date: day,
                              requests: dayRequests,
                              blocks: dayBlocks.map((b) => ({
                                id: b.id,
                                type: b.type,
                                startAt: b.startAt,
                                endAt: b.endAt,
                                note: b.note,
                              })),
                            })
                          }
                          className="text-[10px] text-slate-500 hover:text-slate-800 hover:underline"
                        >
                          +{dayRequests.length - 2} more
                        </button>
                      )}
                      {onVacation &&
                        dayBlocks
                          .filter((b) => b.type === "VACATION")
                          .slice(0, 1)
                          .map((block) => (
                            <button
                              key={block.id}
                              type="button"
                              onClick={() =>
                                setSelectedBlock({
                                  id: block.id,
                                  type: block.type,
                                  startAt: block.startAt,
                                  endAt: block.endAt,
                                  note: block.note,
                                })
                              }
                              className="mt-0.5 block w-full truncate text-left text-[10px] font-medium text-red-700 hover:underline"
                            >
                              Vacation
                            </button>
                          ))}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-200" />
                Available day (weekly hours set)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-red-100 ring-1 ring-red-200" />
                Vacation / time off
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-blue-100 ring-1 ring-blue-200" />
                Assigned case
              </span>
            </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Weekly Hours</h2>
              <Button size="sm" variant="outline" onClick={addRule}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Providers can only request you during these hours.
            </p>
            <div className="mt-3 space-y-2">
              {rules.map((rule, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <Select
                    label={idx === 0 ? "Day" : undefined}
                    value={String(rule.dayOfWeek)}
                    onChange={(e) =>
                      updateRule(idx, "dayOfWeek", Number(e.target.value))
                    }
                    options={WEEKDAYS.map((_, i) => ({
                      value: String(i),
                      label: dayName(i),
                    }))}
                  />
                  <Input
                    label={idx === 0 ? "Start" : undefined}
                    type="time"
                    value={rule.startTime}
                    onChange={(e) => updateRule(idx, "startTime", e.target.value)}
                  />
                  <Input
                    label={idx === 0 ? "End" : undefined}
                    type="time"
                    value={rule.endTime}
                    onChange={(e) => updateRule(idx, "endTime", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeRule(idx)}
                    className="mb-0.5 p-2 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button className="mt-4 w-full" onClick={saveRules} disabled={savingRules}>
              {savingRules ? "Saving..." : "Save Weekly Hours"}
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Schedule Vacation</h2>
            <div className="mt-3 space-y-3">
              <Input
                label="Start date"
                type="date"
                value={vacationStart}
                onChange={(e) => setVacationStart(e.target.value)}
              />
              <Input
                label="End date"
                type="date"
                value={vacationEnd}
                onChange={(e) => setVacationEnd(e.target.value)}
              />
              <Input
                label="Note (optional)"
                value={vacationNote}
                onChange={(e) => setVacationNote(e.target.value)}
              />
              <Button className="w-full" onClick={addVacation} disabled={savingBlock}>
                {savingBlock ? "Adding..." : "Add Vacation"}
              </Button>
            </div>
          </div>

          {blocks.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-900">Time Off</h2>
              <ul className="mt-3 space-y-2">
                {blocks.map((block) => (
                  <li
                    key={block.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBlock({
                          id: block.id,
                          type: block.type,
                          startAt: block.startAt,
                          endAt: block.endAt,
                          note: block.note,
                        })
                      }
                      className="min-w-0 flex-1 text-left hover:opacity-80"
                    >
                      <p className="font-medium text-slate-900">
                        {block.type === "VACATION" ? "Vacation" : "Off"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(block.startAt), "MMM d")} –{" "}
                        {format(new Date(block.endAt), "MMM d, yyyy")}
                      </p>
                      {block.note && (
                        <p className="text-xs text-slate-500">{block.note}</p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selectedRequest && (
        <CalendarEventModal
          kind="request"
          preview={selectedRequest}
          role="rep"
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
