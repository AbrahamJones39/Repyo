"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import { format } from "date-fns";
import { LoadingState } from "@/components/ui/loading";

interface TeamInfo {
  id: string;
  name: string;
  defaultCalendarVisibility: string;
  manager: { name: string };
  members: { id: string; name: string }[];
}

interface SharedAssignment {
  id: string;
  facilityName: string;
  scheduledAt: string;
  status: string;
  repName: string;
  teamCalendarVisibility: string;
}

export function RepTeamsPage({ userName, userId }: { userName: string; userId: string }) {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [shared, setShared] = useState<SharedAssignment[]>([]);
  const [myAssignments, setMyAssignments] = useState<
    { id: string; facilityName: string; scheduledAt: string; teamCalendarVisibility: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const teamData = await fetchJson<{ teams: TeamInfo[] }>("/api/rep/teams");
      setTeams(teamData.teams ?? []);
      const tid = teamData.teams?.[0]?.id ?? "";
      setSelectedTeamId(tid);

      if (tid) {
        const month = format(new Date(), "yyyy-MM");
        const coverage = await fetchJson<{
          teams: {
            sharedAssignments: SharedAssignment[];
            members: {
              id: string;
              assignments?: {
                id: string;
                facilityName: string;
                scheduledAt: string;
                teamCalendarVisibility: string;
              }[];
            }[];
          }[];
        }>(`/api/company/teams/coverage?teamId=${tid}&month=${month}`);

        const team = coverage.teams?.[0];
        setShared(team?.sharedAssignments ?? []);

        const me = team?.members.find((m) => m.id === userId);
        setMyAssignments(
          (me?.assignments ?? []).map((a) => ({
            ...a,
            scheduledAt:
              typeof a.scheduledAt === "string"
                ? a.scheduledAt
                : new Date(a.scheduledAt).toISOString(),
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setPeerVisibility(
    requestId: string,
    teamCalendarVisibility: string
  ) {
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamCalendarVisibility }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <PortalShell portal="rep" userName={userName}>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Teams</h1>
      <p className="mt-1 text-sm text-slate-600">
        Team calendar shows shared assignments only. Your manager always sees your
        schedule — you cannot hide assignments from them.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState className="mt-6" />
      ) : teams.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          You are not on a team yet. Ask your manager to add you.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {teams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5"
            >
              <h2 className="text-lg font-semibold text-slate-900">{team.name}</h2>
              <p className="text-sm text-slate-600">
                Manager: {team.manager.name} · {team.members.length} members
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {team.members.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  >
                    {m.name}
                  </span>
                ))}
              </ul>
            </div>
          ))}

          {myAssignments.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
                My assignments — peer visibility
              </h2>
              <div className="space-y-2">
                {myAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{a.facilityName}</p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(a.scheduledAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={a.teamCalendarVisibility}
                      onChange={(e) =>
                        setPeerVisibility(a.id, e.target.value)
                      }
                    >
                      <option value="SHARED_WITH_TEAM">Share with team</option>
                      <option value="HIDDEN_FROM_TEAM_PEERS">
                        Hide from team peers
                      </option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Team calendar (shared assignments)
            </h2>
            {shared.length === 0 ? (
              <p className="text-sm text-slate-500">No shared assignments this month.</p>
            ) : (
              <ul className="space-y-2">
                {shared.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-slate-900">{a.facilityName}</p>
                    <p className="text-xs text-slate-600">
                      {a.repName} · {format(new Date(a.scheduledAt), "MMM d, h:mm a")} ·{" "}
                      {a.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PortalShell>
  );
}
