"use client";

import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

export type CalendarViewMode = "month" | "day";

export type CalendarDayEvent = {
  id: string;
  title: string;
  subtitle?: string;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  className?: string;
  onClick?: () => void;
};

const HOUR_PX = 64;
const DEFAULT_DURATION_MIN = 60;

export function CalendarViewToggle({
  view,
  onChange,
}: {
  view: CalendarViewMode;
  onChange: (view: CalendarViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {(["month", "day"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium capitalize",
            view === mode
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

function eventMinutes(start: Date, end: Date | null) {
  if (!end) return DEFAULT_DURATION_MIN;
  const diff = Math.round((end.getTime() - start.getTime()) / 60000);
  return Math.max(30, Math.min(diff, 12 * 60));
}

export function CalendarDayView({
  date,
  events,
  loading,
}: {
  date: Date;
  events: CalendarDayEvent[];
  loading?: boolean;
}) {
  const { allDay, timed, startHour, endHour } = useMemo(() => {
    const allDayEvents = events.filter((e) => e.allDay);
    const timedEvents = events
      .filter((e) => !e.allDay)
      .map((e) => {
        const start = new Date(e.startAt);
        const end = e.endAt ? new Date(e.endAt) : null;
        return { event: e, start, end, minutes: eventMinutes(start, end) };
      })
      .filter(({ start }) => isSameDay(start, date))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let start = 6;
    let end = 20;
    for (const item of timedEvents) {
      start = Math.min(start, item.start.getHours());
      const lastHour = item.end
        ? item.end.getHours() + (item.end.getMinutes() > 0 ? 1 : 0)
        : item.start.getHours() + 1;
      end = Math.max(end, lastHour);
    }
    start = Math.max(0, start);
    end = Math.min(24, Math.max(end, start + 1));

    return { allDay: allDayEvents, timed: timedEvents, startHour: start, endHour: end };
  }, [date, events]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalHeight = hours.length * HOUR_PX;

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-500">Loading calendar...</p>;
  }

  return (
    <div>
      {allDay.length > 0 && (
        <div className="mb-3 flex flex-wrap items-start gap-2 border-b border-slate-100 pb-3">
          <span className="w-16 shrink-0 pt-1 text-xs font-medium text-slate-400">All day</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {allDay.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={event.onClick}
                className={cn(
                  "rounded-md border px-2 py-1 text-left text-xs font-medium",
                  event.className ?? "border-slate-200 bg-slate-100 text-slate-700"
                )}
              >
                {event.title}
                {event.subtitle ? ` · ${event.subtitle}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-lg border border-slate-100">
        <div className="flex">
          <div className="w-16 shrink-0 border-r border-slate-100 bg-slate-50/80">
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-slate-100 pr-2 text-right text-[11px] font-medium text-slate-400"
                style={{ height: HOUR_PX }}
              >
                <span className="-mt-2 inline-block">
                  {format(new Date(2000, 0, 1, hour), "h a")}
                </span>
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1" style={{ height: totalHeight }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-slate-100"
                style={{ height: HOUR_PX }}
              />
            ))}

            {timed.length === 0 && allDay.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                No events on this day
              </p>
            )}

            {timed.map(({ event, start, minutes }, index) => {
              const top =
                (start.getHours() - startHour) * HOUR_PX +
                (start.getMinutes() / 60) * HOUR_PX;
              const height = Math.max((minutes / 60) * HOUR_PX, 36);
              const overlapOffset = (index % 3) * 8;

              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={event.onClick}
                  className={cn(
                    "absolute left-2 right-2 overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition hover:ring-1 hover:ring-slate-300",
                    event.className ?? "border-blue-200 bg-blue-100 text-blue-800"
                  )}
                  style={{ top, height, marginLeft: overlapOffset }}
                >
                  <p className="truncate text-xs font-semibold">{event.title}</p>
                  <p className="truncate text-[10px] opacity-80">
                    {format(start, "h:mm a")}
                    {event.subtitle ? ` · ${event.subtitle}` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
