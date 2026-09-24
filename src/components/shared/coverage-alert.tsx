"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type ActiveAlert = {
  id: string;
  requestId: string | null;
  title: string;
  body: string;
  alertKind: string | null;
  stoppedAt?: string | null;
  read?: boolean;
  deliveryStatus: string;
  data?: { sound?: boolean; haptic?: boolean; requestId?: string } | null;
};

function playAlert(haptic: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
      window.setTimeout(() => void ctx.close(), 600);
    }
  } catch {
    // Autoplay can be blocked until the user interacts with the page.
  }
  if (haptic && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([200, 100, 200, 100, 400]);
  }
}

export function CoverageAlert() {
  const [alert, setAlert] = useState<ActiveAlert | null>(null);
  const [busy, setBusy] = useState(false);
  const played = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const rows = await fetchJson<ActiveAlert[]>("/api/notifications");
      const active = (Array.isArray(rows) ? rows : []).find(
        (row) => row.alertKind && !row.stoppedAt && row.data?.sound
      );
      setAlert(active ?? null);
      if (active && !played.current.has(active.id)) {
        played.current.add(active.id);
        playAlert(Boolean(active.data?.haptic));
        const requestId = active.requestId ?? active.data?.requestId;
        if (requestId && active.deliveryStatus !== "DELIVERED") {
          void fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [active.id], delivered: true, requestId }),
          });
        }
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(active.title, { body: active.body, requireInteraction: true, tag: requestId ?? active.id });
        }
      }
    } catch {
      setAlert(null);
    }
  }, []);

  useEffect(() => {
    void load();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { alert?: boolean; alertStopped?: boolean };
        if (data.alertStopped) {
          setAlert(null);
        }
        if (data.alert || data.alertStopped) void load();
      } catch {
        void load();
      }
    };
    return () => es.close();
  }, [load]);

  async function acknowledge() {
    const requestId = alert?.requestId ?? alert?.data?.requestId;
    if (!requestId) return;
    setBusy(true);
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACKNOWLEDGE" }),
      });
      setAlert(null);
    } finally {
      setBusy(false);
    }
  }

  if (!alert) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[70] border-b border-rose-300 bg-rose-600 px-4 py-3 text-white shadow-lg">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{alert.title}</p>
          <p className="text-sm text-rose-50">{alert.body}</p>
        </div>
        <Button size="lg" variant="secondary" disabled={busy} onClick={acknowledge}>
          {busy ? "Acknowledging..." : "Acknowledge"}
        </Button>
      </div>
    </div>
  );
}
