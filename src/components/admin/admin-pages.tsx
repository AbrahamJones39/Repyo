"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/auth-utils";
import type { Role } from "@prisma/client";
import { LoadingState } from "@/components/ui/loading";

interface Company {
  id: string;
  name: string;
  slug: string;
  products: string[];
  active: boolean;
  _count: { users: number; serviceRequests: number };
}

export function AdminTenantsPage({ userName }: { userName: string }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<Company[]>("/api/admin/tenants");
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCompany() {
    if (!newName.trim()) return;
    try {
      await fetchJson("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      await fetchJson(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update company");
    }
  }

  return (
    <PortalShell portal="admin" userName={userName}>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tenants</h1>
      <p className="mt-1 text-sm text-slate-600">Device company management</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 flex gap-3">
        <Input placeholder="New company name" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-xs" />
        <Button onClick={createCompany}>Add Company</Button>
      </div>

      {loading ? (
        <LoadingState className="mt-6" />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200/80 bg-white shadow-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{c.name}</h3>
                  <p className="text-xs text-slate-500">{c.slug}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.active ? "Active" : "Inactive"}
                </span>
              </div>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Users</dt>
                  <dd>{c._count.users}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Requests</dt>
                  <dd>{c._count.serviceRequests}</dd>
                </div>
              </dl>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => toggleActive(c.id, c.active)}>
                {c.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  company: { name: string } | null;
}

export function AdminUsersPage({ userName }: { userName: string }) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<PlatformUser[]>("/api/admin/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateRole(userId: string, role: Role) {
    try {
      await fetchJson(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
  }

  const filtered = filter === "all" ? users : users.filter((u) => u.role === filter);

  return (
    <PortalShell portal="admin" userName={userName}>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users</h1>
      <p className="mt-1 text-sm text-slate-600">{users.length} platform users</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {["all", "PROVIDER", "REP", "COMPANY_ADMIN", "SUPER_ADMIN"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === f ? "bg-rose-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {f === "all" ? "All" : ROLE_LABELS[f as Role]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState className="mt-6" />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/70 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Authorization</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value as Role)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      {(["PROVIDER", "REP", "COMPANY_ADMIN", "SUPER_ADMIN"] as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.company?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}/authorization`}
                      className="text-sm font-medium text-rose-600 hover:underline"
                    >
                      View dossier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
