"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { FORWARD_REASONS } from "@/lib/forward-reasons";
import { cn } from "@/lib/utils";

type ForwardTarget = {
  id: string;
  name: string;
  type: "rep" | "manager";
  territoryLabel: string;
  statusLabel: string;
  onCall: boolean;
  teamNames: string[];
  teamId?: string;
};

type TeamDestination = {
  id: string;
  name: string;
  forwardToId: string;
};

export function ForwardRequestModal({
  requestId,
  onClose,
  onSuccess,
}: {
  requestId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const [reps, setReps] = useState<ForwardTarget[]>([]);
  const [teams, setTeams] = useState<TeamDestination[]>([]);
  const [managers, setManagers] = useState<ForwardTarget[]>([]);

  useEffect(() => {
    fetchJson<{
      reps: ForwardTarget[];
      teamDestinations?: TeamDestination[];
      managers: ForwardTarget[];
    }>(`/api/requests/${requestId}/forward-targets`)
      .then((data) => {
        setReps(data.reps ?? []);
        setTeams(data.teamDestinations ?? []);
        setManagers(data.managers ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load forward targets");
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  async function submit() {
    if (!selectedId) return;
    setSubmitting(true);
    setError("");
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "FORWARD",
          forwardedToId: selectedId,
          reason: reason || undefined,
          reasonNote: reason === "Other" ? reasonNote.trim() || undefined : undefined,
          targetTeamId: selectedTeamId,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forward failed");
    } finally {
      setSubmitting(false);
    }
  }

  function TargetOption({
    target,
    teamId,
  }: {
    target: ForwardTarget;
    teamId?: string;
  }) {
    const selected = selectedId === target.id;
    return (
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
          selected
            ? "border-rose-400 bg-rose-50"
            : "border-slate-200 hover:border-slate-300"
        )}
      >
        <input
          type="radio"
          name="forwardTarget"
          checked={selected}
          onChange={() => {
            setSelectedId(target.id);
            setSelectedTeamId(teamId);
          }}
          className="mt-1"
        />
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {target.type === "manager"
              ? `${target.name} — Manager/Dispatcher`
              : `${target.name} — ${target.territoryLabel} — ${target.statusLabel}`}
          </p>
        </div>
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-[80] flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Forward Request</h2>
            <p className="text-xs text-slate-500">
              Only verified, authorized colleagues in your company are shown.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading eligible reps...</p>
          ) : (
            <>
              <div className="space-y-2">
                {reps.map((rep) => (
                  <TargetOption key={rep.id} target={rep} />
                ))}
                {teams.map((team) => {
                  const selected = selectedId === team.forwardToId && selectedTeamId === team.id;
                  return (
                    <label
                      key={team.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3",
                        selected ? "border-rose-400 bg-rose-50" : "border-slate-200"
                      )}
                    >
                      <input
                        type="radio"
                        name="forwardTarget"
                        checked={selected}
                        onChange={() => {
                          setSelectedId(team.forwardToId);
                          setSelectedTeamId(team.id);
                        }}
                        className="mt-1"
                      />
                      <p className="font-medium text-slate-900">{team.name}</p>
                    </label>
                  );
                })}
                {managers.map((manager) => (
                  <TargetOption key={manager.id} target={manager} />
                ))}
              </div>

              {reps.length === 0 && teams.length === 0 && managers.length === 0 && (
                <p className="text-sm text-slate-500">
                  No eligible forward targets are available for this request.
                </p>
              )}

              <label className="block text-sm">
                <span className="font-medium text-slate-700">Reason (optional)</span>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">No reason</option>
                  {FORWARD_REASONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              {reason === "Other" && (
                <Textarea
                  label="Details"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                />
              )}
            </>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <Button
            className="w-full"
            disabled={!selectedId || submitting || loading}
            onClick={submit}
          >
            {submitting ? "Forwarding..." : "Forward Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
