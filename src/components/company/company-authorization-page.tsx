"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/layout/portal-shell";
import { AuthorizationDossierView } from "@/components/authorization/authorization-dossier";
import { fetchJson } from "@/lib/api-client";
import type { AuthorizationDossier } from "@/lib/authorization/dossier";
import { ROLE_LABELS } from "@/lib/auth-utils";
import type { Role } from "@prisma/client";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  accountState: string;
};

export function CompanyAuthorizationPage({ userName }: { userName: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dossier, setDossier] = useState<AuthorizationDossier | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const data = await fetchJson<{ members: Member[] }>("/api/company/members");
      const list = data.members ?? [];
      setMembers(list);
      if (!selectedUserId && list[0]) {
        setSelectedUserId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setLoadingMembers(false);
    }
  }, [selectedUserId]);

  const loadDossier = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingDossier(true);
    setError("");
    try {
      const data = await fetchJson<AuthorizationDossier>(
        `/api/company/authorization/${userId}`
      );
      setDossier(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dossier");
      setDossier(null);
    } finally {
      setLoadingDossier(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (selectedUserId) {
      loadDossier(selectedUserId);
    }
  }, [selectedUserId, loadDossier]);

  return (
    <PortalShell portal="company" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Authorization Dossier</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review how each rep or admin was verified and what access was granted
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">Team member:</label>
        <select
          className="min-w-[240px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          disabled={loadingMembers || members.length === 0}
        >
          {members.length === 0 ? (
            <option value="">No team members</option>
          ) : (
            members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {ROLE_LABELS[m.role as Role] ?? m.role}
              </option>
            ))
          )}
        </select>
        <Link
          href="/company/reps"
          className="text-sm font-medium text-rose-600 hover:underline"
        >
          Manage reps
        </Link>
      </div>

      {loadingDossier ? (
        <p className="text-sm text-slate-500">Loading authorization dossier...</p>
      ) : dossier ? (
        <AuthorizationDossierView dossier={dossier} />
      ) : (
        <p className="text-sm text-slate-500">Select a team member to view their dossier.</p>
      )}
    </PortalShell>
  );
}
