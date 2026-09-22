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
  parentId: string | null;
  depth: number;
};

type OrgNode = {
  id: string;
  name: string;
  typeLabel: string;
  children: OrgNode[];
};

type Person = {
  id: string;
  name: string;
  email: string;
  role: "REP" | "COMPANY_ADMIN";
  managerId: string | null;
  manager: { id: string; name: string; role: string } | null;
  homeOrgUnit: { id: string; name: string; typeLabel: string } | null;
  orgAssignments: { orgUnitId: string; permissions: string[] }[];
};

type OrgPayload = {
  companyName?: string;
  tree: OrgNode[];
  flat: FlatUnit[];
  people: Person[];
  canAssignPeople: boolean;
  canManageStructure: boolean;
  scope: { isCompanyWide: boolean; unitIds: string[] };
};

const PERMISSION_OPTIONS = [
  { id: "VIEW_METRICS", label: "View metrics" },
  { id: "MANAGE_REQUESTS", label: "Manage requests" },
  { id: "VIEW_CALENDAR", label: "View calendars" },
  { id: "VIEW_TEAM_CALENDAR", label: "View team calendars" },
  { id: "MANAGE_REPS", label: "Manage reps" },
  { id: "MANAGE_TEAMS", label: "Manage teams" },
  { id: "MANAGE_ORG_UNITS", label: "Manage organization" },
  { id: "MANAGE_TERRITORY", label: "Manage territory" },
];

function UnitBranch({ node, depth }: { node: OrgNode; depth: number }) {
  return (
    <li>
      <div className="flex items-baseline gap-2 py-1" style={{ paddingLeft: depth * 16 }}>
        <span className="font-medium text-slate-900">{node.name}</span>
        <span className="text-xs text-slate-500">{node.typeLabel}</span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <UnitBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

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
  const [assignUnitId, setAssignUnitId] = useState("");
  const [assignManagerId, setAssignManagerId] = useState("");
  const [permissions, setPermissions] = useState<string[]>([
    "VIEW_METRICS",
    "MANAGE_REQUESTS",
    "VIEW_CALENDAR",
    "VIEW_TEAM_CALENDAR",
  ]);
  const [unitName, setUnitName] = useState("");
  const [unitType, setUnitType] = useState("Region");
  const [customUnitType, setCustomUnitType] = useState("");
  const [unitParentId, setUnitParentId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const payload = await fetchJson<OrgPayload>("/api/company/org-units");
      setData(payload);
      setUnitParentId((current) => current || payload.flat.find((unit) => unit.depth === 0)?.id || payload.flat[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const displayedCompany = companyName || data?.companyName || "";
  const selectedPerson = data?.people.find((person) => person.id === assignUserId);
  const resolvedUnitType =
    unitType === CUSTOM_ORG_UNIT_TYPE_VALUE ? customUnitType.trim() : unitType;

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!unitName.trim() || !resolvedUnitType) return;
    setError("");
    setMessage("");
    try {
      await fetchJson("/api/company/org-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: unitName.trim(),
          typeLabel: resolvedUnitType,
          parentId: unitParentId || null,
        }),
      });
      setUnitName("");
      setMessage("Unit added. Admins assigned here also cover every unit below it.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add unit");
    }
  }

  async function assignMember(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUserId || !assignUnitId) return;
    if (selectedPerson?.role === "REP" && !assignManagerId) {
      setError("Every rep account must have a designated manager");
      return;
    }
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/company/org-units/${assignUnitId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: assignUserId,
          permissions: selectedPerson?.role === "COMPANY_ADMIN" ? permissions : [],
          managerId: assignManagerId || null,
        }),
      });
      setMessage(
        selectedPerson?.role === "COMPANY_ADMIN"
          ? "Admin scope saved. They can see this unit and every unit below it."
          : "Rep assignment saved. Missed requests escalate to their manager."
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Organization</h1>
        {displayedCompany && (
          <p className="mt-1 text-sm font-semibold text-slate-800">{displayedCompany}</p>
        )}
        <p className="mt-1 text-sm text-slate-600">
          Account types stay Provider, Rep, and Admin. Place each Admin on a unit —
          company, division, region, area, territory, team, or a name you choose.
          They manage that unit and every unit under it. This is operational access
          only and does not include patient information.
        </p>
        {data?.scope && !data.scope.isCompanyWide && (
          <p className="mt-2 text-xs text-slate-500">
            Your own access is limited to your assigned unit and the units below it.
          </p>
        )}
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
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-900">Structure</h2>
              <p className="mt-1 text-xs text-slate-500">
                Build the ladder your company actually uses. Nothing here is tied to a manufacturer.
              </p>
              {data.tree.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No units yet.</p>
              ) : (
                <ul className="mt-4 text-sm">
                  {data.tree.map((node) => (
                    <UnitBranch key={node.id} node={node} depth={0} />
                  ))}
                </ul>
              )}
            </section>

            {data.canManageStructure && (
              <form onSubmit={addUnit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="font-semibold text-slate-900">Add unit</h2>
                <Input
                  label="Name"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="e.g. Southwest"
                  required
                />
                <Select
                  label="Type"
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  options={[
                    ...ORG_UNIT_TYPE_SUGGESTIONS.map((type) => ({
                      value: type,
                      label: type,
                    })),
                    { value: CUSTOM_ORG_UNIT_TYPE_VALUE, label: "Custom type" },
                  ]}
                />
                {unitType === CUSTOM_ORG_UNIT_TYPE_VALUE && (
                  <Input
                    label="Custom type"
                    value={customUnitType}
                    onChange={(e) => setCustomUnitType(e.target.value)}
                    placeholder="e.g. District"
                    required
                  />
                )}
                <Select
                  label="Reports into"
                  value={unitParentId}
                  onChange={(e) => setUnitParentId(e.target.value)}
                  options={data.flat.map((unit) => ({
                    value: unit.id,
                    label: `${"· ".repeat(unit.depth)}${unit.name} (${unit.typeLabel})`,
                  }))}
                />
                <Button type="submit" className="w-full" disabled={!unitName.trim() || !resolvedUnitType}>
                  Add unit
                </Button>
              </form>
            )}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">People</h2>
            <p className="mt-1 text-xs text-slate-500">
              Every rep has a designated manager. If that rep misses a request, it is rerouted to the manager.
              Managers see operational metrics for the people below them.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                    <th className="px-2 py-2">Person</th>
                    <th className="px-2 py-2">Account</th>
                    <th className="px-2 py-2">Unit</th>
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
                        {person.role === "REP" ? "Rep" : "Admin"}
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {person.homeOrgUnit
                          ? `${person.homeOrgUnit.name} · ${person.homeOrgUnit.typeLabel}`
                          : "Unassigned"}
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
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <h2 className="font-semibold text-slate-900">Assign person</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label="Person"
                  value={assignUserId}
                  onChange={(e) => {
                    const person = data.people.find((item) => item.id === e.target.value);
                    setAssignUserId(e.target.value);
                    setAssignManagerId(person?.managerId ?? "");
                    setAssignUnitId(person?.homeOrgUnit?.id ?? data.flat[0]?.id ?? "");
                    const saved = person?.orgAssignments.find(
                      (assignment) => assignment.orgUnitId === person.homeOrgUnit?.id
                    );
                    if (saved && saved.permissions.length > 0) {
                      setPermissions(saved.permissions);
                    }
                  }}
                  options={[
                    { value: "", label: "Select..." },
                    ...data.people.map((person) => ({
                      value: person.id,
                      label: `${person.name} · ${person.role === "REP" ? "Rep" : "Admin"}`,
                    })),
                  ]}
                />
                <Select
                  label="Organizational unit"
                  value={assignUnitId}
                  onChange={(e) => setAssignUnitId(e.target.value)}
                  options={[
                    { value: "", label: "Select a unit" },
                    ...data.flat.map((unit) => ({
                      value: unit.id,
                      label: `${"· ".repeat(unit.depth)}${unit.name} (${unit.typeLabel})`,
                    })),
                  ]}
                />
                <Select
                  label="Designated manager"
                  value={assignManagerId}
                  onChange={(e) => setAssignManagerId(e.target.value)}
                  options={[
                    {
                      value: "",
                      label: selectedPerson?.role === "REP" ? "Required for reps" : "None",
                    },
                    ...data.people
                      .filter((person) => person.id !== assignUserId)
                      .map((person) => ({
                        value: person.id,
                        label: `${person.name} · ${person.role === "REP" ? "Rep" : "Admin"}`,
                      })),
                  ]}
                />
              </div>
              {selectedPerson?.role === "COMPANY_ADMIN" && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Permissions</p>
                  <p className="mb-2 text-xs text-slate-500">
                    Apply to this unit and every child unit. Patient information is never included.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PERMISSION_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setPermissions((prev) =>
                            prev.includes(opt.id)
                              ? prev.filter((permission) => permission !== opt.id)
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
                disabled={
                  !assignUserId ||
                  !assignUnitId ||
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
