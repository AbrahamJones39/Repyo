"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DomainTagInput } from "@/components/shared/domain-tag-input";
import { fetchJson } from "@/lib/api-client";
import { VERIFICATION_METHOD_LABELS, VERIFICATION_METHODS } from "@/lib/verification/constants";

type CompanyVerificationConfig = {
  id: string;
  name: string;
  userVerificationMethod: string;
  approvedEmailDomains: string[];
  ssoIssuer: string | null;
  ssoClientId: string | null;
  ssoSecretSet: boolean;
  scimTokenSet: boolean;
  directoryTokenSet: boolean;
};

type PendingMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  accountState: string;
};

type RosterEntry = { id: string; email: string; name: string | null; jobTitle: string | null };

export function CompanyVerificationPanel() {
  const [config, setConfig] = useState<CompanyVerificationConfig | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [ssoIssuer, setSsoIssuer] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoClientSecret, setSsoClientSecret] = useState("");
  const [rosterText, setRosterText] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [issuedToken, setIssuedToken] = useState("");
  const [pending, setPending] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cfg, members, rosterData] = await Promise.all([
        fetchJson<CompanyVerificationConfig>("/api/company/config"),
        fetchJson<{ pending: PendingMember[] }>("/api/company/members"),
        fetchJson<{ entries: RosterEntry[] }>("/api/company/roster"),
      ]);
      setConfig(cfg);
      setDomains(cfg.approvedEmailDomains ?? []);
      setSsoIssuer(cfg.ssoIssuer ?? "");
      setSsoClientId(cfg.ssoClientId ?? "");
      setPending(members.pending ?? []);
      setRoster(rosterData.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveVerification() {
    if (!config) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fetchJson("/api/company/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userVerificationMethod: config.userVerificationMethod,
          approvedEmailDomains: domains,
          ssoIssuer,
          ssoClientId,
          ...(ssoClientSecret ? { ssoClientSecret } : {}),
        }),
      });
      setSsoClientSecret("");
      setMessage("Verification settings saved. Matching users are approved automatically. The list below is exceptions only.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function importRoster() {
    setError("");
    setMessage("");
    try {
      const data = await fetchJson<{ entries: RosterEntry[] }>("/api/company/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rosterText }),
      });
      setRoster(data.entries ?? []);
      setMessage("Roster imported. People on this list are approved when they sign up.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import roster");
    }
  }

  async function issueToken(kind: "scim" | "directory") {
    setError("");
    setIssuedToken("");
    try {
      const data = await fetchJson<{ token: string; endpoint: string }>(
        "/api/company/directory-token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        }
      );
      setIssuedToken(`${data.endpoint}\n${data.token}`);
      setMessage("Copy this token now. It is stored as a hash and will not be shown again.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    }
  }

  async function approveUser(userId: string) {
    try {
      await fetchJson("/api/company/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "approve" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve user");
    }
  }

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Loading verification settings...</p>
      </div>
    );
  }

  if (!config) return null;

  const method = config.userVerificationMethod;

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">User verification</h2>
        <p className="mt-1 text-sm text-slate-600">
          Directory, roster, and approved-domain matches are verified automatically.
          You only review people who do not match.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        <div className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Verification method
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={method}
              onChange={(e) =>
                setConfig({ ...config, userVerificationMethod: e.target.value })
              }
            >
              {VERIFICATION_METHODS.map((item) => (
                <option key={item} value={item}>
                  {VERIFICATION_METHOD_LABELS[item]}
                </option>
              ))}
            </select>
          </label>

          <DomainTagInput
            label="Approved email domains"
            domains={domains}
            onChange={setDomains}
            helperText="Used by domain, SSO, and invitation checks. Example: medtronic.com"
          />

          {(method === "SSO" || config.ssoIssuer) && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-800">Organization SSO</p>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Issuer URL</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={ssoIssuer}
                  onChange={(e) => setSsoIssuer(e.target.value)}
                  placeholder="https://login.example.com"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Client ID</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={ssoClientId}
                  onChange={(e) => setSsoClientId(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">
                  Client secret {config.ssoSecretSet ? "(saved — enter a new one to replace)" : ""}
                </span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={ssoClientSecret}
                  onChange={(e) => setSsoClientSecret(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </div>
          )}
        </div>

        <Button className="mt-5" disabled={saving} onClick={saveVerification}>
          {saving ? "Saving..." : "Save verification settings"}
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Preapproved roster</h2>
        <p className="mt-1 text-sm text-slate-600">
          Paste one person per line: email, name, job title. Replaces the current roster.
        </p>
        <textarea
          className="mt-4 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={rosterText}
          onChange={(e) => setRosterText(e.target.value)}
          placeholder={"jane.smith@medtronic.com, Jane Smith, CRM"}
        />
        <Button className="mt-3" variant="secondary" onClick={importRoster}>
          Import roster
        </Button>
        {roster.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-slate-700">
            {roster.map((entry) => (
              <li key={entry.id}>
                {entry.email}
                {entry.name ? ` · ${entry.name}` : ""}
                {entry.jobTitle ? ` · ${entry.jobTitle}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Directory connections</h2>
        <p className="mt-1 text-sm text-slate-600">
          SCIM creates accounts. Directory sync records identities so signup auto-verifies
          anyone already in your directory. The token is shown once.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => issueToken("scim")}>
            {config.scimTokenSet ? "Rotate SCIM token" : "Create SCIM token"}
          </Button>
          <Button variant="secondary" onClick={() => issueToken("directory")}>
            {config.directoryTokenSet ? "Rotate directory token" : "Create directory token"}
          </Button>
        </div>
        {issuedToken && (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs text-slate-100">
            {issuedToken}
          </pre>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-6">
          <h2 className="font-semibold text-slate-900">Exceptions</h2>
          <p className="mt-1 text-sm text-slate-600">
            These people did not match the directory, roster, or approved domain.
          </p>
          <ul className="mt-4 space-y-2">
            {pending.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{member.name}</p>
                  <p className="text-slate-600">
                    {member.email} · {member.role}
                  </p>
                </div>
                <Button size="sm" onClick={() => approveUser(member.id)}>
                  Approve
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
