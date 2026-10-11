"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Link2, Unlink } from "lucide-react";

export function SalesforceConnectPanel() {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(true);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{
        connected: boolean;
        instanceUrl: string | null;
        mockMode: boolean;
        oauthConfigured: boolean;
      }>("/api/company/salesforce");
      setConnected(data.connected);
      setInstanceUrl(data.instanceUrl);
      setMockMode(data.mockMode);
      setOauthConfigured(data.oauthConfigured);
    } catch {
      setMessage("Could not load Salesforce connection status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sf = searchParams.get("salesforce");
    const msg = searchParams.get("message");
    if (sf === "connected") setMessage("Salesforce connected successfully.");
    if (sf === "error") setMessage(msg ?? "Salesforce connection failed.");
  }, [searchParams]);

  async function connect() {
    setMessage("");
    try {
      const data = await fetchJson<{ authorizeUrl: string }>("/api/company/salesforce", {
        method: "POST",
      });
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start Salesforce OAuth");
    }
  }

  async function disconnect() {
    setMessage("");
    try {
      await fetchJson("/api/company/salesforce", { method: "DELETE" });
      await load();
      setMessage("Salesforce disconnected.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not disconnect Salesforce");
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-slate-200/80 bg-white shadow-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">Salesforce CRM</h2>
          <p className="mt-1 text-sm text-slate-600">
            Connect Salesforce so hospital requests can look up implanted device name
            and serial number, then sync cases to your CRM.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            connected
              ? "bg-emerald-50 text-emerald-700"
              : mockMode
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600"
          )}
        >
          {connected ? "Connected" : mockMode ? "Demo lookup mode" : "Not connected"}
        </span>
      </div>

      {message && (
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Instance</dt>
          <dd className="font-medium text-slate-900">{instanceUrl ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">OAuth configured</dt>
          <dd className="font-medium text-slate-900">
            {oauthConfigured ? "Yes" : "No — add env vars on server"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        {!connected ? (
          <Button onClick={connect} disabled={loading || !oauthConfigured}>
            <Link2 className="h-4 w-4" />
            Connect Salesforce
          </Button>
        ) : (
          <Button variant="secondary" onClick={disconnect} disabled={loading}>
            <Unlink className="h-4 w-4" />
            Disconnect
          </Button>
        )}
      </div>

      {!oauthConfigured && (
        <p className="mt-4 text-xs text-slate-500">
          Set `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, and callback URL
          `{`{APP_URL}/api/company/salesforce/callback`}` in your Salesforce Connected App.
          Until then, providers can still test with demo CRM lookups.
        </p>
      )}
    </div>
  );
}
