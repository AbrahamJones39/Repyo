"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { format } from "date-fns";

export function AdminSecurityPage({ userName }: { userName: string }) {
  const [data, setData] = useState<{
    killSwitches: unknown[];
    phiAccessLogs: Array<{
      id: string;
      accessType: string;
      createdAt: string;
      user: { name: string; email: string };
      requestId: string | null;
    }>;
    permissionChanges: unknown[];
  } | null>(null);
  const [killReason, setKillReason] = useState("");
  const [killScope, setKillScope] = useState("GLOBAL");
  const [killScopeId, setKillScopeId] = useState("");
  const [revokeUserId, setRevokeUserId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await fetchJson<typeof data>("/api/admin/security");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security data");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(body: Record<string, unknown>) {
    setError("");
    setMessage("");
    try {
      await fetchJson("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage("Action completed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <PortalShell portal="admin" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Security & Audit</h1>
        <p className="text-sm text-slate-600">
          Kill switches, session revocation, PHI access logs, and permission history
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5">
          <h2 className="font-semibold text-slate-900">Emergency kill switch</h2>
          <p className="mt-1 text-xs text-slate-600">
            Disable access globally, per user, organization, company, or request.
          </p>
          <div className="mt-4 space-y-3">
            <select
              value={killScope}
              onChange={(e) => setKillScope(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {["GLOBAL", "USER", "ORGANIZATION", "COMPANY", "REQUEST", "INTEGRATION"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                )
              )}
            </select>
            {killScope !== "GLOBAL" && (
              <Input
                label="Scope ID"
                value={killScopeId}
                onChange={(e) => setKillScopeId(e.target.value)}
                placeholder="UUID of user, org, company, or request"
              />
            )}
            <Input
              label="Reason"
              value={killReason}
              onChange={(e) => setKillReason(e.target.value)}
              placeholder="Security incident description"
            />
            <Button
              variant="secondary"
              onClick={() =>
                runAction({
                  action: "kill_switch",
                  scope: killScope,
                  scopeId: killScopeId || undefined,
                  reason: killReason,
                })
              }
            >
              Activate kill switch
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5">
          <h2 className="font-semibold text-slate-900">Revoke user sessions</h2>
          <p className="mt-1 text-xs text-slate-600">
            Immediately invalidates all active sessions for a user.
          </p>
          <div className="mt-4 space-y-3">
            <Input
              label="User ID"
              value={revokeUserId}
              onChange={(e) => setRevokeUserId(e.target.value)}
            />
            <Button
              onClick={() =>
                runAction({
                  action: "revoke_sessions",
                  userId: revokeUserId,
                  reason: "Manual session revocation",
                })
              }
            >
              Revoke sessions
            </Button>
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-slate-200/80 bg-white shadow-card p-5">
        <h2 className="font-semibold text-slate-900">PHI access log</h2>
        <p className="mt-1 text-xs text-slate-600">
          Who opened requests, when PHI was displayed, and notification delivery — no PHI in log
          metadata.
        </p>
        <div className="mt-4 space-y-2">
          {(data?.phiAccessLogs ?? []).slice(0, 20).map((log) => (
            <div
              key={log.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span>
                {log.user.name} · <span className="text-slate-500">{log.accessType}</span>
              </span>
              <span className="text-xs text-slate-500">
                {format(new Date(log.createdAt), "MMM d, h:mm a")}
                {log.requestId ? ` · ${log.requestId.slice(0, 8)}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </PortalShell>
  );
}
