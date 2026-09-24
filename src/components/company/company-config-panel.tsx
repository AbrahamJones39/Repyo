"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";

type CompanyConfig = {
  id: string;
  name: string;
  forwardEnabled: boolean;
  forwardTeamMembersOnly: boolean;
  forwardAllowManagers: boolean;
  alertFirstReminderMin: number;
  alertSecondReminderMin: number;
  alertEscalateMin: number;
  alertProviderNoticeMin: number;
  onCallDndOverrideEnabled: boolean;
};

export function CompanyConfigPanel() {
  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<CompanyConfig>("/api/company/config");
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next: Partial<CompanyConfig>) {
    if (!config) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await fetchJson<CompanyConfig>("/api/company/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setConfig(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Loading company configuration...</p>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Forward</h2>
      <p className="mt-1 text-sm text-slate-600">
        Forward is a permanent request action. A rep who knows the right person can send
        the request to a verified colleague in this company. RepYo never accepts an email
        or phone number. These settings decide which authorized destinations are offered.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Configuration saved.
        </div>
      )}

      <div className="mt-5 space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={config.forwardEnabled}
            onChange={(e) =>
              setConfig({ ...config, forwardEnabled: e.target.checked })
            }
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-900">Enable Forward</span>
            <span className="mt-0.5 block text-slate-600">
              Reps can forward acknowledged requests to other verified reps, team members,
              or managers.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={config.forwardTeamMembersOnly}
            disabled={!config.forwardEnabled}
            onChange={(e) =>
              setConfig({ ...config, forwardTeamMembersOnly: e.target.checked })
            }
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-900">Team members only</span>
            <span className="mt-0.5 block text-slate-600">
              Limit forward targets to reps on shared teams.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={config.forwardAllowManagers}
            disabled={!config.forwardEnabled}
            onChange={(e) =>
              setConfig({ ...config, forwardAllowManagers: e.target.checked })
            }
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-900">Allow manager/dispatcher forwarding</span>
            <span className="mt-0.5 block text-slate-600">
              Reps can send requests back to a company manager for reassignment.
            </span>
          </span>
        </label>
      </div>

      <Button
        className="mt-5"
        disabled={saving}
        onClick={() =>
          save({
            forwardEnabled: config.forwardEnabled,
            forwardTeamMembersOnly: config.forwardTeamMembersOnly,
            forwardAllowManagers: config.forwardAllowManagers,
          })
        }
      >
        {saving ? "Saving..." : "Save Forward Settings"}
      </Button>

      <h2 className="mt-8 font-semibold text-slate-900">Coverage alert timing</h2>
      <p className="mt-1 text-sm text-slate-600">
        Unacknowledged requests repeat a high-priority alert, then escalate to the
        rep&apos;s manager. Times are minutes after the alert is sent.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["alertFirstReminderMin", "First reminder"],
            ["alertSecondReminderMin", "Second reminder"],
            ["alertEscalateMin", "Escalate to manager"],
            ["alertProviderNoticeMin", "Tell the provider"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm">
            <span className="font-medium text-slate-900">{label}</span>
            <input
              type="number"
              min={1}
              max={180}
              value={config[key]}
              onChange={(e) =>
                setConfig({ ...config, [key]: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        ))}
      </div>
      <Button
        className="mt-5"
        variant="outline"
        disabled={saving}
        onClick={() =>
          save({
            alertFirstReminderMin: config.alertFirstReminderMin,
            alertSecondReminderMin: config.alertSecondReminderMin,
            alertEscalateMin: config.alertEscalateMin,
            alertProviderNoticeMin: config.alertProviderNoticeMin,
          })
        }
      >
        {saving ? "Saving..." : "Save Alert Timing"}
      </Button>

      <h2 className="mt-8 font-semibold text-slate-900">On call / Do Not Disturb</h2>
      <p className="mt-1 text-sm text-slate-600">
        Off unless you turn it on. A rep must also opt in. This does not bypass iOS Silent
        or Focus. True critical alerts need Apple entitlement approval and are not enabled.
        Ordinary notifications still follow the phone&apos;s silent settings. An opted-in
        on-call rep only gets louder repeats while RepYo is open.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={config.onCallDndOverrideEnabled}
          onChange={(e) =>
            setConfig({ ...config, onCallDndOverrideEnabled: e.target.checked })
          }
          className="mt-1"
        />
        <span>
          <span className="font-medium text-slate-900">
            Allow on-call Do Not Disturb override
          </span>
          <span className="mt-0.5 block text-slate-600">
            Company opt-in. Reps choose separately. RepYo will not turn this on by itself.
          </span>
        </span>
      </label>
      <Button
        className="mt-5"
        variant="outline"
        disabled={saving}
        onClick={() => save({ onCallDndOverrideEnabled: config.onCallDndOverrideEnabled })}
      >
        {saving ? "Saving..." : "Save On-Call Setting"}
      </Button>
    </div>
  );
}
