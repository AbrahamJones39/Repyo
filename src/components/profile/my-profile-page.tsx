"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/layout/portal-shell";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/auth-utils";
import { PROCEDURE_TYPES, QUALIFIED_STATUS_LABELS, REP_STATUS_LABELS } from "@/lib/utils";
import type { Role } from "@prisma/client";
import { Eye, EyeOff } from "lucide-react";

type Portal = "provider" | "rep" | "company" | "admin";

type OwnProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  accountState: string;
  zipCodeStart: string | null;
  zipCodeEnd: string | null;
  adminPermissions: string[];
  company: { id: string; name: string } | null;
  manager: { id: string; name: string; role: string } | null;
  homeOrgUnit: { id: string; name: string; typeLabel: string } | null;
  orgAssignments: {
    permissions: string[];
    orgUnit: { id: string; name: string; typeLabel: string };
  }[];
  repProfile: {
    status: string;
    products: string[];
    credentialStatus: string;
    onCallEnabled: boolean;
    travelRadiusMiles: number;
    territories: { state: string | null; county: string | null; zipCode: string | null }[];
  } | null;
  providerInfo: {
    jobTitle: string | null;
    department: string | null;
    facilityName: string | null;
    facilityAddress: string | null;
    facilityPhone: string | null;
    facilityContactName: string | null;
    facilityContactPhone: string | null;
    zipCode: string | null;
    requesterPhone: string | null;
    requesterFax: string | null;
    defaultPhysician: string | null;
    accountStatus: string;
    workEmail: string | null;
    isOrgAdministrator: boolean;
    organization: { id: string; name: string } | null;
    orgFacility: {
      id: string;
      name: string;
      department: string | null;
      address: string;
    } | null;
  } | null;
  providerSiteMemberships: {
    jobTitle: string | null;
    department: string | null;
    isPrimary: boolean;
    site: {
      name: string;
      address: string;
      city: string;
      state: string;
      zipCode: string;
    };
  }[];
};

const ADMIN_PERMISSION_LABELS: Record<string, string> = {
  MANAGE_REPS: "Manage reps",
  MANAGE_REQUESTS: "Manage requests",
  VIEW_CALENDAR: "View calendars",
  MANAGE_TEAMS: "Manage teams",
  VIEW_TEAM_CALENDAR: "View team calendars",
  VIEW_METRICS: "View metrics",
  MANAGE_ORG_UNITS: "Edit org structure",
  MANAGE_INTEGRATIONS: "Manage integrations",
  MANAGE_TERRITORY: "Manage territory",
  SECURITY_KILL_SWITCH: "Security kill switch",
  REVOKE_SESSIONS: "Revoke sessions",
  VIEW_AUDIT_LOGS: "View audit logs",
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  LIMITED: "Limited",
  PENDING_APPROVAL: "Pending approval",
  PENDING_AGREEMENTS: "Pending agreements",
  ACTIVE: "Active",
  VERIFIED: "Verified",
  REGISTERED: "Registered",
  SUSPENDED: "Suspended",
  DISABLED: "Disabled",
  REVOKED: "Revoked",
};

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-900">
        {value?.trim() ? value : "—"}
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function MyProfilePage({
  portal,
  userName,
}: {
  portal: Portal;
  userName: string;
}) {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zipCodeStart, setZipCodeStart] = useState("");
  const [zipCodeEnd, setZipCodeEnd] = useState("");
  const [status, setStatus] = useState("OFF_DUTY");
  const [onCallEnabled, setOnCallEnabled] = useState(false);
  const [products, setProducts] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [facilityAddress, setFacilityAddress] = useState("");
  const [facilityPhone, setFacilityPhone] = useState("");
  const [facilityContactName, setFacilityContactName] = useState("");
  const [facilityContactPhone, setFacilityContactPhone] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [requesterFax, setRequesterFax] = useState("");
  const [defaultPhysician, setDefaultPhysician] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  function applyProfile(data: OwnProfile) {
    setProfile(data);
    setName(data.name ?? "");
    setPhone(data.phone ?? "");
    setZipCodeStart(data.zipCodeStart ?? "");
    setZipCodeEnd(data.zipCodeEnd ?? "");
    setStatus(data.repProfile?.status ?? "OFF_DUTY");
    setOnCallEnabled(data.repProfile?.onCallEnabled ?? false);
    setProducts(data.repProfile?.products ?? []);
    const info = data.providerInfo;
    setJobTitle(info?.jobTitle ?? data.providerSiteMemberships[0]?.jobTitle ?? "");
    setDepartment(info?.department ?? "");
    setFacilityName(info?.facilityName ?? info?.orgFacility?.name ?? "");
    setFacilityAddress(info?.facilityAddress ?? info?.orgFacility?.address ?? "");
    setFacilityPhone(info?.facilityPhone ?? "");
    setFacilityContactName(info?.facilityContactName ?? "");
    setFacilityContactPhone(info?.facilityContactPhone ?? "");
    setZipCode(info?.zipCode ?? "");
    setRequesterPhone(info?.requesterPhone ?? data.phone ?? "");
    setRequesterFax(info?.requesterFax ?? "");
    setDefaultPhysician(info?.defaultPhysician ?? "");
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<OwnProfile>("/api/profile");
      applyProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleProduct(product: string) {
    setProducts((prev) =>
      prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product]
    );
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = { name, phone };
      if (profile?.role === "COMPANY_ADMIN") {
        payload.zipCodeStart = zipCodeStart;
        payload.zipCodeEnd = zipCodeEnd;
      }
      if (profile?.role === "REP") {
        payload.status = status;
        payload.onCallEnabled = onCallEnabled;
        payload.products = products;
      }
      if (profile?.role === "PROVIDER") {
        payload.jobTitle = jobTitle;
        payload.department = department;
        payload.facilityName = facilityName;
        payload.facilityAddress = facilityAddress;
        payload.facilityPhone = facilityPhone;
        payload.facilityContactName = facilityContactName;
        payload.facilityContactPhone = facilityContactPhone;
        payload.zipCode = zipCode;
        payload.requesterPhone = requesterPhone;
        payload.requesterFax = requesterFax;
        payload.defaultPhysician = defaultPhysician;
      }
      const updated = await fetchJson<OwnProfile>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      applyProfile(updated);
      setMessage("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await fetchJson("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  }

  const orgLabel =
    profile?.role === "PROVIDER" ? "Healthcare organization" : "Company";
  const orgValue =
    profile?.role === "PROVIDER"
      ? profile.providerInfo?.organization?.name
      : profile?.company?.name;
  const supervisorLabel =
    profile?.manager?.role === "COMPANY_ADMIN"
      ? `${profile.manager.name} (Admin)`
      : profile?.manager?.name;
  const hierarchyRole = profile?.homeOrgUnit
    ? `${profile.homeOrgUnit.typeLabel} · ${profile.homeOrgUnit.name}`
    : null;
  const territorySummary =
    profile?.repProfile?.territories
      ?.map((t) =>
        [t.zipCode, t.county, t.state].filter(Boolean).join(", ")
      )
      .filter(Boolean)
      .join(" · ") ?? "";

  return (
    <PortalShell portal={portal} userName={profile?.name ?? userName}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your account details and the fields you can update yourself
        </p>
      </div>

      {loading && <p className="text-slate-500">Loading...</p>}

      {!loading && error && !profile && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {profile && (
        <div className="max-w-4xl space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {message && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>
          )}

          <form onSubmit={saveProfile} className="space-y-6">
            <Section title="Account">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <ReadOnlyField label="Email" value={profile.email} />
              <ReadOnlyField
                label="Role"
                value={ROLE_LABELS[profile.role] ?? profile.role}
              />
              <Input
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-0100"
              />
              <ReadOnlyField
                label="Account status"
                value={ACCOUNT_STATUS_LABELS[profile.accountState] ?? profile.accountState}
              />
            </Section>

            <Section
              title="Organization"
              description="Company, manager, and unit assignments are set by your administrator."
            >
              <ReadOnlyField label={orgLabel} value={orgValue} />
              <ReadOnlyField
                label="Supervisor / designated manager"
                value={supervisorLabel}
              />
              {(profile.role === "REP" || profile.role === "COMPANY_ADMIN") && (
                <ReadOnlyField label="Org unit / hierarchy role" value={hierarchyRole} />
              )}
              {profile.role === "PROVIDER" && (
                <>
                  <ReadOnlyField
                    label="Facility (organization)"
                    value={profile.providerInfo?.orgFacility?.name}
                  />
                  <ReadOnlyField
                    label="Org administrator"
                    value={profile.providerInfo?.isOrgAdministrator ? "Yes" : "No"}
                  />
                  <ReadOnlyField
                    label="Provider account"
                    value={
                      ACCOUNT_STATUS_LABELS[profile.providerInfo?.accountStatus ?? ""] ??
                      profile.providerInfo?.accountStatus
                    }
                  />
                </>
              )}
            </Section>

            {profile.role === "COMPANY_ADMIN" && (
              <Section
                title="Coverage zip range"
                description="Used to match incoming requests in your administrative area."
              >
                <Input
                  label="Starting zip"
                  value={zipCodeStart}
                  onChange={(e) => setZipCodeStart(e.target.value)}
                  placeholder="85040"
                  maxLength={5}
                />
                <Input
                  label="Ending zip"
                  value={zipCodeEnd}
                  onChange={(e) => setZipCodeEnd(e.target.value)}
                  placeholder="85050"
                  maxLength={5}
                />
                {profile.adminPermissions.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-sm font-medium text-slate-700">Admin permissions</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.adminPermissions.map((permission) => (
                        <span
                          key={permission}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                        >
                          {ADMIN_PERMISSION_LABELS[permission] ?? permission}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {profile.role === "REP" && (
              <Section
                title="Rep coverage"
                description="Status and products can be updated here. Territory zip lists are managed on the Territory page."
              >
                <Select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={Object.entries(REP_STATUS_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-700">On call</p>
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={onCallEnabled}
                      onChange={(e) => setOnCallEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    Available for on-call coverage
                  </label>
                </div>
                <ReadOnlyField
                  label="Qualification"
                  value={
                    QUALIFIED_STATUS_LABELS[profile.repProfile?.credentialStatus ?? ""] ??
                    profile.repProfile?.credentialStatus
                  }
                />
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-slate-700">Products</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PROCEDURE_TYPES.map((product) => (
                      <button
                        key={product}
                        type="button"
                        onClick={() => toggleProduct(product)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          products.includes(product)
                            ? "bg-rose-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {product}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <ReadOnlyField
                    label="Territory"
                    value={territorySummary || "No zip coverage listed"}
                  />
                  <Link
                    href="/rep/territory"
                    className="mt-2 inline-block text-sm font-medium text-rose-600 hover:underline"
                  >
                    Edit territory and covered facilities
                  </Link>
                </div>
              </Section>
            )}

            {profile.role === "PROVIDER" && (
              <Section title="Facility & requester details">
                <Input
                  label="Job title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
                <Input
                  label="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
                <Input
                  label="Facility name"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                />
                <Input
                  label="Facility zip"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  maxLength={5}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Facility address"
                    value={facilityAddress}
                    onChange={(e) => setFacilityAddress(e.target.value)}
                  />
                </div>
                <Input
                  label="Facility phone"
                  value={facilityPhone}
                  onChange={(e) => setFacilityPhone(e.target.value)}
                />
                <Input
                  label="Default physician"
                  value={defaultPhysician}
                  onChange={(e) => setDefaultPhysician(e.target.value)}
                />
                <Input
                  label="Facility contact name"
                  value={facilityContactName}
                  onChange={(e) => setFacilityContactName(e.target.value)}
                />
                <Input
                  label="Facility contact phone"
                  value={facilityContactPhone}
                  onChange={(e) => setFacilityContactPhone(e.target.value)}
                />
                <Input
                  label="Request phone"
                  value={requesterPhone}
                  onChange={(e) => setRequesterPhone(e.target.value)}
                />
                <Input
                  label="Request fax"
                  value={requesterFax}
                  onChange={(e) => setRequesterFax(e.target.value)}
                />
                {profile.providerSiteMemberships.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-sm font-medium text-slate-700">Assigned sites</p>
                    <ul className="mt-2 space-y-2">
                      {profile.providerSiteMemberships.map((membership) => (
                        <li
                          key={`${membership.site.name}-${membership.site.zipCode}`}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        >
                          <span className="font-medium text-slate-900">
                            {membership.site.name}
                          </span>
                          {membership.isPrimary ? " · Primary" : ""}
                          <span className="block text-xs text-slate-500">
                            {[
                              membership.site.address,
                              membership.site.city,
                              membership.site.state,
                              membership.site.zipCode,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                            {membership.jobTitle ? ` · ${membership.jobTitle}` : ""}
                            {membership.department ? ` · ${membership.department}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            )}

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>

          <form
            onSubmit={savePassword}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-semibold text-slate-900">Change password</h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter your current password, then a new password of at least 8 characters.
            </p>
            {passwordError && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {passwordError}
              </div>
            )}
            {passwordMessage && (
              <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {passwordMessage}
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="relative sm:col-span-2 sm:max-w-sm">
                <Input
                  label="Current password"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? "Hide current password" : "Show current password"}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <Input
                  label="New password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide new password" : "Show new password"}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Input
                label="Confirm new password"
                type={showNew ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="mt-4">
              <Button type="submit" variant="secondary" disabled={savingPassword}>
                {savingPassword ? "Updating..." : "Update password"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </PortalShell>
  );
}
