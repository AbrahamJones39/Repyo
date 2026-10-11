"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<Notification[]>("/api/notifications");
      setNotifications(Array.isArray(data) ? data : []);
      setError(false);
    } catch {
      setError(true);
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    load();
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/notifications/stream");
      es.onmessage = () => load();
      es.onerror = () => es?.close();
    } catch {
      // SSE optional — bell still works without realtime
    }
    return () => es?.close();
  }, [load]);

  async function markRead(ids: string[]) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      load();
    } catch {
      // ignore
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unread > 0) {
            markRead(notifications.filter((n) => !n.read).map((n) => n.id));
          }
        }}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {error ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Could not load notifications</p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "border-b border-slate-50 px-4 py-3 last:border-0",
                      !n.read && "bg-rose-50/50"
                    )}
                  >
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
