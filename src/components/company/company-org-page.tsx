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

type OrgNode = {
  id: string;
  parentId: string | null;
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
  orgUnitId: string | null;
  manager: { id: string; name: string; role: string } | null;
  homeOrgUnit: { id: string; name: string; typeLabel: string } | null;
};

type OrgPayload = {
  tree: OrgNode[];
  flat: { id: string; name: string; typeLabel: string; depth: number }[];
  people: Person[];
  canManageStructure: boolean;
  canAssignPeople: boolean;
  scope: { isCompanyWide: boolean; permissions: string[] };
};

const PERMISSION_OPTIONS = [
  { id: "VIEW_METRICS", label: "View metrics" },
  { id: "MANAGE_REQUESTS", label: "Manage requests" },
  { id: "VIEW_CALENDAR", label: "View calendars" },
  { id: "VIEW_TEAM_CALENDAR", label: "View team calendars" },
  { id: "MANAGE_REPS", label: "Manage reps" },
  { id: "MANAGE_TEAMS", label: "Manage teams" },
  { id: "MANAGE_ORG_UNITS", label: "Edit org structure" },
  { id: "MANAGE_TERRITORY", label: "Manage territory" },
];

export function CompanyOrgPage({ userName }: { userName: string }) {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [parentId, setParentId] = useState("");
  const [unitName, setUnitName] = useState("");
  const [typeLabel, setTypeLabel] = useState<string>(ORG_UNIT_TYPE_SUGGESTIONS[0]);
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignUnitId, setAssignUnitId] = useState("");
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
      if (!parentId && payload.flat[0]) setParentId(payload.flat[0].id);
      if (!assignUnitId && payload.flat[0]) setAssignUnitId(payload.flat[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization");
    }
  }, [parentId, assignUnitId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustomType = typeLabel === CUSTOM_ORG_UNIT_TYPE_VALUE;
  const resolvedTypeLabel = isCustomType ? customTypeLabel.trim() : typeLabel;

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!resolvedTypeLabel) {
      setError("Enter a name for the new unit type");
      return;
    }
    try {
      await fetchJson("/api/company/org-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: unitName,
          typeLabel: resolvedTypeLabel,
          parentId: parentId || null,
        }),
      });
      setUnitName("");
      setCustomTypeLabel("");
      setTypeLabel(ORG_UNIT_TYPE_SUGGESTIONS[0]);
      setMessage("Organizational unit added");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add unit");
    }
  }

  async function assignMember(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUserId || !assignUnitId) return;
    setError("");
    setMessage("");
    try {
      await fetchJson(`/api/company/org-units/${assignUnitId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId, permissions }),
      });
      const person = data?.people.find((p) => p.id === assignUserId);
      if (person?.role === "REP") {
        await fetchJson(`/api/company/reps/${assignUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgUnitId: assignUnitId,
            managerId: assignManagerId || person.managerId,
          }),
        });
      }
      setMessage("Assignment saved");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  const selectedPerson = data?.people.find((p) => p.id === assignUserId);

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Organization</h1>
        <p className="mt-1 text-sm text-slate-600">
          Admins are assigned to a unit and can see that unit plus every unit below it.
          Choose a hierarchy unit (rep, team lead, sales manager, and so on) or create a new
          unit type. This is operational access only — it does not grant patient information.
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
        <p className="text-slate-500">Loading organization...</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
            <h2 className="font-semibold text-slate-900">Hierarchy</h2>
            <div className="mt-4 space-y-1">
              {data.tree.length === 0 ? (
                <p className="text-sm text-slate-500">No units yet.</p>
              ) : (
                data.tree.map((node) => <OrgTreeNode key={node.id} node={node} />)
              )}
            </div>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {data.canManageStructure && (
              <form
                onSubmit={addUnit}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <h2 className="font-semibold text-slate-900">Add unit</h2>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Hierarchy unit</p>
                  <div className="flex flex-wrap gap-2">
                    {ORG_UNIT_TYPE_SUGGESTIONS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTypeLabel(t)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium",
                          typeLabel === t
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTypeLabel(CUSTOM_ORG_UNIT_TYPE_VALUE)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium",
                        isCustomType
                          ? "border-rose-300 bg-rose-50 text-rose-700"
                          : "border-dashed border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                      )}
                    >
                      Create a new unit
                    </button>
                  </div>
                </div>
                {isCustomType && (
                  <Input
                    label="New unit type"
                    value={customTypeLabel}
                    onChange={(e) => setCustomTypeLabel(e.target.value)}
                    placeholder="e.g. Regional Director"
                    required
                  />
                )}
                <Input
                  label="Name"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder={
                    isCustomType
                      ? "e.g. West Coast Regional Director"
                      : `e.g. Phoenix ${typeLabel}`
                  }
                  required
                />
                <Select
                  label="Parent unit"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  options={data.flat.map((u) => ({
                    value: u.id,
                    label: `${"— ".repeat(u.depth)}${u.name} (${u.typeLabel})`,
                  }))}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!unitName.trim() || !resolvedTypeLabel}
                >
                  Add unit
                </Button>
              </form>
            )}

            {data.canAssignPeople && (
              <form
                onSubmit={assignMember}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <h2 className="font-semibold text-slate-900">Assign person</h2>
                <Select
                  label="Person"
                  value={assignUserId}
                  onChange={(e) => {
                    setAssignUserId(e.target.value);
                    const person = data.people.find((p) => p.id === e.target.value);
                    setAssignManagerId(person?.managerId ?? "");
                    setAssignUnitId(person?.orgUnitId ?? assignUnitId);
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
                  label="Organizational unit"
                  value={assignUnitId}
                  onChange={(e) => setAssignUnitId(e.target.value)}
                  options={data.flat.map((u) => ({
                    value: u.id,
                    label: `${"— ".repeat(u.depth)}${u.name} (${u.typeLabel})`,
                  }))}
                />
                {selectedPerson?.role === "REP" && (
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
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      Permissions for this unit and below
                    </p>
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
                <Button type="submit" className="w-full" disabled={!assignUserId || !assignUnitId}>
                  Save assignment
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {data && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">Reporting ladder</h2>
          <p className="mt-1 text-xs text-slate-500">
            Every rep has a designated manager. Missed requests escalate up this ladder.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-2">Person</th>
                  <th className="px-2 py-2">Role</th>
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
                        ? `${person.homeOrgUnit.name} (${person.homeOrgUnit.typeLabel})`
                        : "—"}
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
      )}
    </PortalShell>
  );
}

function OrgTreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
          {node.typeLabel}
        </span>
        <span className="font-medium text-slate-900">{node.name}</span>
      </div>
      {node.children.map((child) => (
        <OrgTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
