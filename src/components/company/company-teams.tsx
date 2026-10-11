"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  status: string;
  assignments?: CalendarAssignment[];
  blocks?: { id: string; type: string; startAt: string; endAt: string }[];
}

interface CalendarAssignment {
  id: string;
  facilityName: string;
  procedureType: string | null;
  scheduledAt: string;
  status: string;
  urgency: string;
  teamCalendarVisibility: string;
  visibleToPeers?: boolean;
  managerAlwaysVisible?: boolean;
  repName?: string;
}

interface TeamData {
  id: string;
  name: string;
  defaultCalendarVisibility: string;
  requireManualVerification?: boolean;
  manager: { id: string; name: string };
  isManager: boolean;
  memberCount?: number;
  members: TeamMember[];
  sharedAssignments?: CalendarAssignment[];
  coverageGaps?: { date: string; reason: string }[];
}

interface CompanyRep {
  id: string;
  name: string;
  email?: string;
}

const VIS_LABELS: Record<string, string> = {
  SHARED_WITH_TEAM: "Shared with team",
  HIDDEN_FROM_TEAM_PEERS: "Hidden from peers",
};

export function CompanyTeamsPage({ userName }: { userName: string }) {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [coverageTeams, setCoverageTeams] = useState<TeamData[]>([]);
  const [companyReps, setCompanyReps] = useState<CompanyRep[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [viewDate, setViewDate] = useState(new Date());
  const [canManageTeams, setCanManageTeams] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [addRepId, setAddRepId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"coverage" | "manage">("coverage");

  const monthKey = format(viewDate, "yyyy-MM");

  const loadTeams = useCallback(async () => {
    try {
      const data = await fetchJson<{
        teams: TeamData[];
        canManageTeams: boolean;
      }>("/api/company/teams");
      setTeams(data.teams ?? []);
      setCanManageTeams(data.canManageTeams ?? false);
      if (!selectedTeamId && data.teams?.[0]) {
        setSelectedTeamId(data.teams[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    }
  }, [selectedTeamId]);

  const loadCoverage = useCallback(async () => {
    if (!selectedTeamId) return;
    try {
      const data = await fetchJson<{ teams: TeamData[] }>(
        `/api/company/teams/coverage?teamId=${selectedTeamId}&month=${monthKey}`
      );
      setCoverageTeams(data.teams ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage");
    }
  }, [selectedTeamId, monthKey]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadTeams(),
      fetchJson<{ id: string; name: string }[]>("/api/company/reps").then((d) =>
        setCompanyReps(Array.isArray(d) ? d : [])
      ),
    ]).finally(() => setLoading(false));
  }, [loadTeams]);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  const selectedTeam =
    coverageTeams[0] ?? teams.find((t) => t.id === selectedTeamId);

  const allAssignments = useMemo(
    () =>
      selectedTeam?.members.flatMap((m) =>
        (m.assignments ?? []).map((a) => ({ ...a, repName: m.name, repId: m.id }))
      ) ?? [],
    [selectedTeam]
  );

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const padding = monthStart.getDay();

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setError("");
    try {
      await fetchJson("/api/company/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      setNewTeamName("");
      setMessage("Team created");
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function addMember(teamId: string) {
    if (!addRepId) return;
    try {
      await fetchJson(`/api/company/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addRepId }),
      });
      setAddRepId("");
      setMessage("Rep added to team");
      await loadTeams();
      await loadCoverage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add member failed");
    }
  }

  async function updateDefaultPolicy(
    teamId: string,
    defaultCalendarVisibility: string
  ) {
    try {
      await fetchJson(`/api/company/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCalendarVisibility }),
      });
      setMessage("Default sharing policy updated");
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function updateManualVerification(teamId: string, enabled: boolean) {
    try {
      await fetchJson(`/api/company/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireManualVerification: enabled }),
      });
      setMessage(
        enabled
          ? "New invitees on this team will need your approval before joining."
          : "Manual approval disabled for this team."
      );
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function updateAssignmentVisibility(
    requestId: string,
    teamCalendarVisibility: string
  ) {
    try {
      await fetchJson(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamCalendarVisibility }),
      });
      await loadCoverage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Visibility update failed");
    }
  }

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Teams</h1>
          <p className="text-sm text-slate-600">
            Live team coverage — who&apos;s assigned, who&apos;s available, what&apos;s
            shared, and where gaps exist
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "coverage" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTab("coverage")}
          >
            Coverage calendar
          </Button>
          {canManageTeams && (
            <Button
              variant={tab === "manage" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setTab("manage")}
            >
              Manage teams
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading teams...</p>
      ) : teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">No teams yet.</p>
          {canManageTeams && (
            <p className="mt-1 text-xs text-slate-500">
              Create a team to group reps and manage calendar visibility.
            </p>
          )}
        </div>
      ) : tab === "manage" && canManageTeams ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5">
            <h2 className="font-semibold text-slate-900">Create team</h2>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="e.g. Phoenix Cardiac Team"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
              <Button onClick={createTeam}>Create</Button>
            </div>
          </div>
          {teams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{team.name}</h3>
                  <p className="text-sm text-slate-600">
                    Manager: {team.manager.name} · {team.memberCount ?? team.members.length}{" "}
                    reps
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={team.defaultCalendarVisibility}
                    onChange={(e) =>
                      updateDefaultPolicy(team.id, e.target.value)
                    }
                  >
                    <option value="SHARED_WITH_TEAM">Default: Share with team</option>
                    <option value="HIDDEN_FROM_TEAM_PEERS">
                      Default: Hidden from peers
                    </option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={team.requireManualVerification ?? false}
                      onChange={(e) =>
                        updateManualVerification(team.id, e.target.checked)
                      }
                    />
                    Require manual approval for new invitees
                  </label>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {team.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>
                      {m.name}{" "}
                      <span className="text-slate-500">({m.status.replace("_", " ")})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={addRepId}
                  onChange={(e) => setAddRepId(e.target.value)}
                >
                  <option value="">Add rep to team...</option>
                  {companyReps
                    .filter((r) => !team.members.some((m) => m.id === r.id))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => addMember(team.id)}
                  disabled={!addRepId}
                >
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-600">Team:</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewDate(subMonths(viewDate, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[140px] text-center font-medium">
                {format(viewDate, "MMMM yyyy")}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewDate(addMonths(viewDate, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {selectedTeam?.coverageGaps && selectedTeam.coverageGaps.length > 0 && (
            <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">Coverage gaps</h2>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {selectedTeam.coverageGaps.slice(0, 5).map((gap, i) => (
                  <li key={i}>· {gap.reason}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selectedTeam?.members.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <p className="font-medium text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-500">
                  {m.status.replace("_", " ")} · {(m.assignments ?? []).length} assignments
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white shadow-card p-4">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: padding }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[90px] rounded-lg bg-slate-50/50" />
              ))}
              {days.map((day) => {
                const dayAssignments = allAssignments.filter((a) =>
                  isSameDay(new Date(a.scheduledAt), day)
                );
                return (
                  <div
                    key={day.toISOString()}
                    className="min-h-[90px] rounded-lg border border-slate-100 p-1"
                  >
                    <div className="text-xs font-medium text-slate-700">
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayAssignments.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px]",
                            a.teamCalendarVisibility === "SHARED_WITH_TEAM"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          )}
                          title={`${a.repName} — ${VIS_LABELS[a.teamCalendarVisibility] ?? a.teamCalendarVisibility}`}
                        >
                          {format(new Date(a.scheduledAt), "h:mm a")} {a.facilityName}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Assignments (manager view — all visible)
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Calendar visibility controls peer sharing only. PHI access is governed
              separately and is never inferred from calendar settings.
            </p>
            <div className="space-y-2">
              {allAssignments.length === 0 ? (
                <p className="text-sm text-slate-500">No assignments this month.</p>
              ) : (
                allAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{a.facilityName}</p>
                      <p className="text-xs text-slate-500">
                        {a.repName} · {format(new Date(a.scheduledAt), "MMM d, h:mm a")} ·{" "}
                        {a.status}
                      </p>
                    </div>
                    {selectedTeam?.isManager && (
                      <select
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        value={a.teamCalendarVisibility}
                        onChange={(e) =>
                          updateAssignmentVisibility(a.id, e.target.value)
                        }
                      >
                        <option value="SHARED_WITH_TEAM">Share to team calendar</option>
                        <option value="HIDDEN_FROM_TEAM_PEERS">Hidden from peers</option>
                      </select>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </PortalShell>
  );
}
