"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import {
  CUSTOM_ORG_UNIT_TYPE_VALUE,
  ORG_UNIT_TYPE_SUGGESTIONS,
} from "@/lib/security/authorization";
import { cn } from "@/lib/utils";

type FlatUnit = {
  id: string;
  name: string;
  typeLabel: string;
  depth: number;
};

type Person = {
  id: string;
  name: string;
  email: string;
  role: "REP" | "COMPANY_ADMIN";
  managerId: string | null;
  manager: { id: string; name: string; role: string } | null;
  homeOrgUnit: { id: string; name: string; typeLabel: string } | null;
};

type OrgPayload = {
  companyName?: string;
  flat: FlatUnit[];
  people: Person[];
  canAssignPeople: boolean;
};

function roleFromPerson(
  person: Person | undefined,
  extraRoleLabels: string[] = []
): { role: string; custom: string } {
  const label = person?.homeOrgUnit?.typeLabel?.trim() ?? "";
  if (!label) return { role: "", custom: "" };
  if (
    (ORG_UNIT_TYPE_SUGGESTIONS as readonly string[]).includes(label) ||
    extraRoleLabels.includes(label)
  ) {
    return { role: label, custom: "" };
  }
  return { role: CUSTOM_ORG_UNIT_TYPE_VALUE, custom: label };
}

const PERMISSION_OPTIONS = [
  { id: "VIEW_METRICS", label: "View metrics" },
  { id: "MANAGE_REQUESTS", label: "Manage requests" },
  { id: "VIEW_CALENDAR", label: "View calendars" },
  { id: "VIEW_TEAM_CALENDAR", label: "View team calendars" },
  { id: "MANAGE_REPS", label: "Manage reps" },
  { id: "MANAGE_TEAMS", label: "Manage teams" },
  { id: "MANAGE_TERRITORY", label: "Manage territory" },
];

export function CompanyOrgPage({
  userName,
  companyName,
}: {
  userName: string;
  companyName: string;
}) {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [customAssignRole, setCustomAssignRole] = useState("");
  const [assignManagerId, setAssignManagerId] = useState("");
  const [permissions, setPermissions] = useState<string[]>([
    "VIEW_METRICS",
    "MANAGE_REQUESTS",
    "VIEW_CALENDAR",
    "VIEW_TEAM_CALENDAR",
  ]);

  const load = useCallback(async () => {
    setError("");
    try {
      const payload = await fetchJson<OrgPayload>("/api/company/org-units");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isCustomAssignRole = assignRole === CUSTOM_ORG_UNIT_TYPE_VALUE;
  const resolvedAssignRole = isCustomAssignRole ? customAssignRole.trim() : assignRole;
  const displayedCompany = companyName || data?.companyName || "";

  async function assignMember(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUserId || !resolvedAssignRole) return;
    const person = data?.people.find((p) => p.id === assignUserId);
    if (person?.role === "REP" && !assignManagerId) {
      setError("Every rep account must have a designated manager");
      return;
    }
    const rootId = data?.flat.find((u) => u.depth === 0)?.id ?? data?.flat[0]?.id;
    if (!rootId) {
      setError("Organization is not ready yet. Try again in a moment.");
      return;
    }
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/company/org-units/${rootId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: assignUserId,
          permissions,
          typeLabel: resolvedAssignRole,
          managerId: assignManagerId || null,
        }),
      });
      setMessage("Assignment saved");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  const selectedPerson = data?.people.find((p) => p.id === assignUserId);
  const extraRoleLabels = data
    ? [
        ...new Set(
          data.people
            .map((p) => p.homeOrgUnit?.typeLabel)
            .filter(
              (label): label is string =>
                Boolean(label) &&
                !(ORG_UNIT_TYPE_SUGGESTIONS as readonly string[]).includes(label)
            )
        ),
      ]
    : [];

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Organization</h1>
        {displayedCompany && (
          <p className="mt-1 text-sm font-semibold text-slate-800">{displayedCompany}</p>
        )}
        <p className="mt-1 text-sm text-slate-600">
          Assign each person a role and a designated manager. This is operational access
          only — it does not grant patient information.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {!data ? (
        error ? null : <p className="text-slate-500">Loading organization...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
            <h2 className="font-semibold text-slate-900">People</h2>
            <p className="mt-1 text-xs text-slate-500">
              Every rep has a designated manager. Missed requests escalate to that manager.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                    <th className="px-2 py-2">Person</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((person) => (
                    <tr key={person.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-2 py-2">
                        <p className="font-medium text-slate-900">{person.name}</p>
                        <p className="text-xs text-slate-500">{person.email}</p>
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {person.homeOrgUnit?.typeLabel ??
                          (person.role === "REP" ? "Rep" : "Admin")}
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {person.manager?.name ?? (person.role === "REP" ? "Missing" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.canAssignPeople && (
            <form
              onSubmit={assignMember}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2"
            >
              <h2 className="font-semibold text-slate-900">Assign person</h2>
              <Select
                label="Person"
                value={assignUserId}
                onChange={(e) => {
                  setAssignUserId(e.target.value);
                  const person = data.people.find((p) => p.id === e.target.value);
                  setAssignManagerId(person?.managerId ?? "");
                  const nextRole = roleFromPerson(person, extraRoleLabels);
                  setAssignRole(nextRole.role);
                  setCustomAssignRole(nextRole.custom);
                }}
                options={[
                  { value: "", label: "Select..." },
                  ...data.people.map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${p.role === "REP" ? "Rep" : "Admin"}`,
                  })),
                ]}
              />
              <Select
                label="Organization role"
                value={assignRole}
                onChange={(e) => {
                  setAssignRole(e.target.value);
                  if (e.target.value !== CUSTOM_ORG_UNIT_TYPE_VALUE) {
                    setCustomAssignRole("");
                  }
                }}
                options={[
                  { value: "", label: "Select..." },
                  ...ORG_UNIT_TYPE_SUGGESTIONS.map((t) => ({
                    value: t,
                    label: t,
                  })),
                  ...extraRoleLabels.map((t) => ({
                    value: t,
                    label: t,
                  })),
                  { value: CUSTOM_ORG_UNIT_TYPE_VALUE, label: "Create a new role" },
                ]}
              />
              {isCustomAssignRole && (
                <Input
                  label="New organization role"
                  value={customAssignRole}
                  onChange={(e) => setCustomAssignRole(e.target.value)}
                  placeholder="e.g. Regional Director"
                  required
                />
              )}
              {selectedPerson && (
                <Select
                  label="Designated manager"
                  value={assignManagerId}
                  onChange={(e) => setAssignManagerId(e.target.value)}
                  options={[
                    { value: "", label: "Select manager..." },
                    ...data.people
                      .filter((p) => p.id !== assignUserId)
                      .map((p) => ({
                        value: p.id,
                        label: `${p.name} · ${p.role === "REP" ? "Rep" : "Admin"}`,
                      })),
                  ]}
                />
              )}
              {selectedPerson?.role === "COMPANY_ADMIN" && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Permissions</p>
                  <p className="mb-2 text-xs text-slate-500">
                    Never includes patient information.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PERMISSION_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setPermissions((prev) =>
                            prev.includes(opt.id)
                              ? prev.filter((p) => p !== opt.id)
                              : [...prev, opt.id]
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium",
                          permissions.includes(opt.id)
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  !assignUserId ||
                  !resolvedAssignRole ||
                  (selectedPerson?.role === "REP" && !assignManagerId)
                }
              >
                Save assignment
              </Button>
            </form>
          )}
        </div>
      )}
    </PortalShell>
  );
}
