"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { DomainTagInput } from "@/components/shared/domain-tag-input";
import { fetchJson } from "@/lib/api-client";
import { VERIFICATION_METHOD_LABELS, VERIFICATION_METHODS } from "@/lib/verification/constants";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  status: string;
  complianceMode: string;
  contactEmail: string | null;
  baaExecutedAt: string | null;
  orgAgreementAt: string | null;
  phiEnabledAt: string | null;
  verifiedAt: string | null;
  userVerificationMethod: string;
  approvedEmailDomains: string[];
  ssoEnabled: boolean;
  scimEnabled: boolean;
  _count: { providers: number; accessRequests: number };
  facilities: { id: string; name: string }[];
}

interface OrgMember {
  userId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  facilityName: string | null;
  accountStatus: string;
  verificationDecision: string | null;
}

interface AccessLead {
  organizationName: string;
  requestCount: number;
}

export function AdminOrganizationsPage({ userName }: { userName: string }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [accessLeads, setAccessLeads] = useState<AccessLead[]>([]);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, OrgMember[]>>({});
  const [domainDrafts, setDomainDrafts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{
        organizations: Organization[];
        accessLeads: AccessLead[];
      }>("/api/admin/organizations");
      setOrganizations(data.organizations ?? []);
      setAccessLeads(data.accessLeads ?? []);
      const drafts: Record<string, string[]> = {};
      for (const org of data.organizations ?? []) {
        drafts[org.id] = org.approvedEmailDomains ?? [];
      }
      setDomainDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateOrg(id: string, patch: Record<string, unknown>) {
    try {
      await fetchJson(`/api/admin/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function loadMembers(orgId: string) {
    try {
      const data = await fetchJson<{ members: OrgMember[] }>(
        `/api/admin/organizations/${orgId}/members`
      );
      setMembers((prev) => ({ ...prev, [orgId]: data.members ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    }
  }

  async function memberAction(
    orgId: string,
    userId: string,
    action: "approve"
  ) {
    try {
      await fetchJson(`/api/admin/organizations/${orgId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      await loadMembers(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function toggleExpanded(orgId: string) {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
      return;
    }
    setExpandedOrg(orgId);
    if (!members[orgId]) await loadMembers(orgId);
  }

  function saveDomains(org: Organization) {
    updateOrg(org.id, { approvedEmailDomains: domainDrafts[org.id] ?? [] });
  }

  return (
    <PortalShell portal="admin" userName={userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Provider Organizations</h1>
        <p className="text-sm text-slate-600">
          Configure verification methods, approved email domains, and user access
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {accessLeads.length > 0 && (
        <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Access request leads</h2>
          <p className="mt-1 text-sm text-amber-900">
            Healthcare workers requesting RepYo before their organization is activated
          </p>
          <ul className="mt-4 space-y-2">
            {accessLeads.map((lead) => (
              <li
                key={lead.organizationName}
                className="flex items-center justify-between rounded-lg bg-white/80 px-4 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">{lead.organizationName}</span>
                <span className="text-amber-800">
                  {lead.requestCount} user{lead.requestCount !== 1 ? "s" : ""} requested access
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <p className="text-slate-500">Loading organizations...</p>
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => {
            const orgMembers = members[org.id] ?? [];
            const pending = orgMembers.filter(
              (m) => m.accountStatus === "PENDING_APPROVAL"
            );

            return (
              <div
                key={org.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{org.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {org._count.providers} providers · {org._count.accessRequests} access
                      requests · {org.facilities.length} facilities
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        org.status === "ACTIVATED"
                          ? "bg-emerald-50 text-emerald-700"
                          : org.status === "VERIFIED"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {org.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {VERIFICATION_METHOD_LABELS[
                        org.userVerificationMethod as keyof typeof VERIFICATION_METHOD_LABELS
                      ] ?? org.userVerificationMethod}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      User verification method
                    </label>
                    <select
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                      value={org.userVerificationMethod}
                      onChange={(e) =>
                        updateOrg(org.id, { userVerificationMethod: e.target.value })
                      }
                    >
                      {VERIFICATION_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {VERIFICATION_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <DomainTagInput
                      label="Approved email domains"
                      domains={domainDrafts[org.id] ?? []}
                      onChange={(domains) =>
                        setDomainDrafts((prev) => ({ ...prev, [org.id]: domains }))
                      }
                      helperText="Invited providers must sign up with one of these domains."
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => saveDomains(org)}
                    >
                      Save domains
                    </Button>
                  </div>
                </div>

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">BAA executed</dt>
                    <dd>{org.baaExecutedAt ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">SSO / SCIM</dt>
                    <dd>
                      {org.ssoEnabled ? "SSO" : "—"}
                      {org.scimEnabled ? " · SCIM" : ""}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {org.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateOrg(org.id, { status: "VERIFIED" })}
                    >
                      Mark Verified
                    </Button>
                  )}
                  {!org.baaExecutedAt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateOrg(org.id, { baaExecuted: true })}
                    >
                      Record BAA
                    </Button>
                  )}
                  {org.complianceMode !== "PHI_ENABLED" && (
                    <Button size="sm" onClick={() => updateOrg(org.id, { phiEnabled: true })}>
                      Enable PHI
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleExpanded(org.id)}
                  >
                    {expandedOrg === org.id
                      ? "Hide members"
                      : `Manage users${pending.length ? ` (${pending.length} pending)` : ""}`}
                  </Button>
                </div>

                {expandedOrg === org.id && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {orgMembers.length === 0 ? (
                      <p className="text-sm text-slate-500">No members yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {orgMembers.map((member) => (
                          <li
                            key={member.userId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm"
                          >
                            <div>
                              <p className="font-medium text-slate-900">
                                {member.name}
                              </p>
                              <p className="text-slate-600">
                                {member.email}
                                {member.jobTitle ? ` · ${member.jobTitle}` : ""}
                              </p>
                              <p className="text-xs text-slate-500">
                                {member.accountStatus}
                                {member.verificationDecision
                                  ? ` · ${member.verificationDecision}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`/admin/users/${member.userId}/authorization`}
                                className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                Dossier
                              </Link>
                              {member.accountStatus === "PENDING_APPROVAL" && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    memberAction(org.id, member.userId, "approve")
                                  }
                                >
                                  Approve
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
