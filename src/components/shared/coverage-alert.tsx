"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fetchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ForwardRequestModal } from "@/components/shared/forward-request-modal";

type ActiveAlert = {
  id: string;
  requestId: string | null;
  alertKind: string | null;
  stoppedAt?: string | null;
  deliveryStatus: string;
  data?: { sound?: boolean; haptic?: boolean; requestId?: string } | null;
};

type Preview = {
  facilityName: string;
  scheduledAt: string;
  summary: string;
};

function playAlert(haptic: boolean) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [error, setError] = useState("");
  const played = useRef<Set<string>>(new Set());

  const requestId = alert?.requestId ?? alert?.data?.requestId ?? null;

  const load = useCallback(async () => {
    try {
      const rows = await fetchJson<ActiveAlert[]>("/api/notifications");
      const active = (Array.isArray(rows) ? rows : []).find(
        (row) => row.alertKind && !row.stoppedAt && row.data?.sound
      );
      setAlert(active ?? null);
      if (!active) {
        setPreview(null);
        return;
      }
      if (!played.current.has(active.id)) {
        played.current.add(active.id);
        playAlert(Boolean(active.data?.haptic));
        const id = active.requestId ?? active.data?.requestId;
        if (id && active.deliveryStatus !== "DELIVERED") {
          void fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [active.id], delivered: true, requestId: id }),
          });
        }
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("New RepYo request", {
            body: "A request needs a response. Open RepYo. This alert follows your phone's silent settings.",
            tag: id ?? active.id,
          });
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
        if (data.alertStopped) setAlert(null);
        if (data.alert || data.alertStopped) void load();
      } catch {
        void load();
      }
    };
    return () => es.close();
  }, [load]);

  useEffect(() => {
    if (!requestId) return;
    fetchJson<Preview>(`/api/requests/${requestId}/alert-preview`)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [requestId]);

  async function acknowledge() {
    if (!requestId) return;
    await fetchJson(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACKNOWLEDGE" }),
    });
    setAlert(null);
  }

  async function run(action: "ACCEPT" | "DECLINE" | "FORWARD") {
    if (!requestId) return;
    setBusy(true);
    setError("");
    try {
      await acknowledge();
      if (action === "FORWARD") {
        setForwarding(true);
        setBusy(false);
        return;
      }
      if (action === "DECLINE") {
        await fetchJson(`/api/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DECLINE" }),
        });
      } else {
        await fetchJson(`/api/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACCEPTED" }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the request");
      setAlert(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {alert && !forwarding && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
              New RepYo request
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              {preview?.facilityName ?? "Coverage request"}
            </h2>
            <p className="mt-1 text-slate-600">{preview?.summary ?? "Device support requested"}</p>
            {preview?.scheduledAt && (
              <p className="mt-1 text-sm text-slate-500">
                {format(new Date(preview.scheduledAt), "EEE • h:mm a")}
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Ordinary notification. It does not bypass silent or Focus mode.
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 grid gap-2">
              <Button size="lg" disabled={busy} onClick={() => void acknowledge()}>
                Acknowledge
              </Button>
              <Button size="lg" disabled={busy} onClick={() => void run("ACCEPT")}>
                Accept
              </Button>
              <Button size="lg" variant="outline" disabled={busy} onClick={() => void run("FORWARD")}>
                Forward
              </Button>
              <Button size="lg" variant="outline" disabled={busy} onClick={() => void run("DECLINE")}>
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}
      {forwarding && requestId && (
        <ForwardRequestModal
          requestId={requestId}
          onClose={() => setForwarding(false)}
          onSuccess={() => {
            setForwarding(false);
            setAlert(null);
          }}
        />
      )}
    </>
  );
}
