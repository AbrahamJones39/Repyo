"use client";

import Link from "next/link";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  FacilitySearchPicker,
  type HealthcareSiteOption,
} from "@/components/shared/facility-search-picker";
import {
  LegalDocumentModal,
  AccountAgreementSection,
} from "@/components/legal/legal-document-modal";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/auth-utils";
import { signupAction } from "@/app/actions/auth";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  status: string;
  complianceMode: string;
}

const SIGNUP_ROLES: Role[] = ["PROVIDER", "REP", "COMPANY_ADMIN"];

const PROVIDER_STEPS = [
  { id: 1, label: "Healthcare Organization" },
  { id: 2, label: "Facility" },
  { id: 3, label: "Your Role" },
  { id: 4, label: "Account Agreement" },
] as const;

function StepIndicator({
  steps,
  current,
}: {
  steps: readonly { id: number; label: string }[];
  current: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {steps.map((step) => (
        <div
          key={step.id}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            step.id === current
              ? "bg-rose-600 text-white"
              : step.id < current
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-100 text-slate-500"
          )}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}

export function SignupForm() {
  const searchParams = useSearchParams();
  const inviteTokenParam = searchParams.get("invite");
  const [role, setRole] = useState<Role>("PROVIDER");
  const [providerStep, setProviderStep] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [requestOrgAccess, setRequestOrgAccess] = useState(false);
  const [acceptAuthorizedUse, setAcceptAuthorizedUse] = useState(false);
  const [acceptPrivacyCommunications, setAcceptPrivacyCommunications] =
    useState(false);
  const [legalDocSlug, setLegalDocSlug] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [selectedSites, setSelectedSites] = useState<HealthcareSiteOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [inviteLockedRole, setInviteLockedRole] = useState(false);
  const [emailVerificationSent, setEmailVerificationSent] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetch("/api/companies/public")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Company[]) => setCompanies(data))
      .catch(() => setCompanies([]));

    fetch("/api/provider/organizations")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Organization[]) => setOrganizations(data))
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    if (!inviteTokenParam) return;

    fetch(`/api/invitations/validate?token=${encodeURIComponent(inviteTokenParam)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.valid) {
          setError(data.reason ?? "Invitation is not valid");
          return;
        }
        setInviteToken(inviteTokenParam);
        const inv = data.invitation;
        const invitedRole = inv.targetRole as Role;
        if (SIGNUP_ROLES.includes(invitedRole)) {
          setRole(invitedRole);
          setInviteLockedRole(true);
        }
        setInviteBanner(
          `${inv.invitedByName ?? "A colleague"} invited you to join RepYo${
            inv.organization?.name ? ` at ${inv.organization.name}` : ""
          }${inv.company?.name ? ` (${inv.company.name})` : ""}.`
        );
        setFormValues((prev) => ({
          ...prev,
          ...(inv.inviteeEmail ? { email: inv.inviteeEmail } : {}),
          ...(inv.organization?.id ? { organizationId: inv.organization.id } : {}),
          ...(inv.company?.id ? { companyId: inv.company.id } : {}),
        }));
        if (inv.organization?.id) setRequestOrgAccess(false);
        if (inv.healthcareSite) {
          setSelectedSites([
            {
              id: inv.healthcareSite.id,
              name: inv.healthcareSite.name,
              address: "",
              city: inv.healthcareSite.city ?? "",
              state: inv.healthcareSite.state ?? "",
              zipCode: "",
            },
          ]);
        }
      })
      .catch(() => setError("Could not load invitation"));
  }, [inviteTokenParam]);

  useEffect(() => {
    setProviderStep(1);
    setAcceptProviderAuthorization(false);
    setAcceptProviderPrivacy(false);
    setAcceptTermsAndPrivacy(false);
    setSelectedSites([]);
    setError("");
  }, [role]);

  function captureFormValues(form: HTMLFormElement) {
    const next: Record<string, string> = { ...formValues };
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") next[key] = value;
    });
    setFormValues(next);
    return next;
  }

  function validateProviderStep(step: number, values: Record<string, string>) {
    if (step === 1) {
      if (requestOrgAccess) {
        if (!values.requestedOrgName?.trim()) {
          return "Enter your hospital or organization name";
        }
      } else if (!values.organizationId?.trim()) {
        return "Select your healthcare organization";
      }
    }
    if (step === 2) {
      if (selectedSites.length === 0) {
        return "Select at least one hospital or clinic from the directory";
      }
      const required = ["facilityContactName", "facilityContactPhone"];
      for (const key of required) {
        if (!values[key]?.trim()) {
          return "Complete facility contact fields";
        }
      }
    }
    if (step === 3) {
      if (!values.name?.trim()) return "Full name is required";
      if (!values.email?.trim()) return "Email is required";
      if (!values.password || values.password.length < 8) {
        return "Password must be at least 8 characters";
      }
      if (!values.requesterPhone?.trim()) return "Your phone number is required";
    }
    if (step === 4) {
      if (!acceptAuthorizedUse || !acceptPrivacyCommunications) {
        return "You must accept all required agreements before creating your account";
      }
    }
    return null;
  }

  function handleProviderNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = captureFormValues(e.currentTarget);
    const primary = selectedSites[0];
    if (primary) {
      values.facilityName = primary.name;
      values.facilityAddress = `${primary.address}, ${primary.city}, ${primary.state} ${primary.zipCode}`;
      values.zipCode = primary.zipCode;
      setFormValues((prev) => ({ ...prev, ...values }));
    }
    const stepError = validateProviderStep(providerStep, values);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError("");
    setProviderStep((s) => Math.min(s + 1, 4));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    form.set("role", role);
    form.set("requestOrgAccess", requestOrgAccess ? "true" : "false");
    form.set(
      "acceptProviderAuthorization",
      acceptAuthorizedUse ? "true" : "false"
    );
    form.set(
      "acceptProviderPrivacy",
      acceptPrivacyCommunications ? "true" : "false"
    );
    form.set(
      "acceptTermsAndPrivacy",
      acceptAuthorizedUse && acceptPrivacyCommunications ? "true" : "false"
    );
    if (selectedSites.length > 0) {
      form.set("siteIds", JSON.stringify(selectedSites.map((s) => s.id)));
      form.set("primarySiteId", selectedSites[0].id);
    }

    if (inviteToken) {
      form.set("inviteToken", inviteToken);
    }

    const result = await signupAction(form);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result?.needsEmailVerification) {
      setError("");
      setLoading(false);
      setEmailVerificationSent(result.email ?? formValues.email);
      return;
    }
  }

  const needsCompany = role === "REP" || role === "COMPANY_ADMIN";
  const selectedOrg = organizations.find(
    (o) => o.id === formValues.organizationId
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <BrandMark size="lg" />
          <p className="mt-2 text-sm text-slate-600">
            {role === "PROVIDER" ? "Create Your RepYo Account" : "Create your account"}
          </p>
        </div>

        {inviteBanner && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {inviteBanner}
            <p className="mt-1 text-xs text-rose-700">
              Accepting this invitation does not grant access to patient information.
            </p>
          </div>
        )}

        {inviteLockedRole ? (
          <div className="space-y-1">
            <span className="block text-sm font-medium text-slate-700">I am a...</span>
            <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
              {ROLE_LABELS[role]}
            </div>
            <p className="text-xs text-slate-500">Set by your invitation.</p>
          </div>
        ) : (
          <Select
            label="I am a..."
            name="roleDisplay"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={SIGNUP_ROLES.map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            }))}
          />
        )}

        {role === "PROVIDER" && (
          <StepIndicator steps={PROVIDER_STEPS} current={providerStep} />
        )}

        <form
          onSubmit={
            role === "PROVIDER" && providerStep < 4
              ? handleProviderNext
              : handleSubmit
          }
          className="mt-4 space-y-4"
        >
          {inviteToken && (
            <input type="hidden" name="inviteToken" value={inviteToken} />
          )}

          {emailVerificationSent && (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Check <strong>{emailVerificationSent}</strong> for a confirmation link
              to finish creating your account. In local development, the link is
              printed in the server console.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {role === "PROVIDER" && providerStep === 1 && (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Healthcare Organization
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Select your verified hospital or request access if not yet on
                  RepYo.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={requestOrgAccess}
                  onChange={(e) => setRequestOrgAccess(e.target.checked)}
                />
                My organization is not yet activated for RepYo
              </label>

              {requestOrgAccess ? (
                <>
                  <Input
                    label="Hospital / Organization Name"
                    name="requestedOrgName"
                    required
                    defaultValue={formValues.requestedOrgName}
                    placeholder="e.g. Desert Regional Medical Center"
                  />
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    You may create your profile, but patient information cannot
                    be submitted until your organization completes verification
                    and required agreements.
                  </div>
                </>
              ) : (
                <Select
                  label="Healthcare Organization"
                  name="organizationId"
                  required
                  defaultValue={formValues.organizationId}
                  options={[
                    {
                      value: "",
                      label: organizations.length
                        ? "Select organization..."
                        : "Loading organizations...",
                    },
                    ...organizations.map((o) => ({
                      value: o.id,
                      label: `${o.name}${o.complianceMode === "PHI_ENABLED" && o.status === "ACTIVATED" ? " (PHI Enabled)" : ""}`,
                    })),
                  ]}
                />
              )}
            </>
          )}

          {role === "PROVIDER" && providerStep === 2 && (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Facility
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Search the shared directory — each hospital exists once on RepYo.
                  You can add additional locations if needed.
                </p>
              </div>

              <FacilitySearchPicker
                selected={selectedSites}
                onChange={setSelectedSites}
                multiple
                organizationId={
                  formValues.organizationId || undefined
                }
                label="Your hospital or clinic"
                helperText="Most providers select one primary location. You may add more if you work at multiple sites."
              />

              <Input
                label="Department / unit"
                name="department"
                defaultValue={formValues.department}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Facility Contact Name"
                  name="facilityContactName"
                  required
                  defaultValue={formValues.facilityContactName}
                />
                <Input
                  label="Facility Contact Phone"
                  name="facilityContactPhone"
                  type="tel"
                  required
                  defaultValue={formValues.facilityContactPhone}
                />
              </div>
            </>
          )}

          {role === "PROVIDER" && providerStep === 3 && (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your Role
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Account credentials for{" "}
                  {selectedOrg?.name ??
                    formValues.requestedOrgName ??
                    "your organization"}
                  .
                </p>
              </div>
              <Input
                label="Full Name (legal name)"
                name="name"
                required
                defaultValue={formValues.name}
                autoComplete="name"
              />
              <Input
                label="Email"
                name="email"
                type="email"
                required
                defaultValue={formValues.email}
                key={formValues.email ?? "email"}
                autoComplete="email"
              />
              <Input
                label="Password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              <Input
                label="Your Phone"
                name="requesterPhone"
                type="tel"
                required
                defaultValue={formValues.requesterPhone}
                autoComplete="tel"
              />
              <Input
                label="Your Fax (optional)"
                name="requesterFax"
                type="tel"
                defaultValue={formValues.requesterFax}
              />
            </>
          )}

          {role === "PROVIDER" && providerStep === 4 && (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p>
                  <span className="font-semibold text-slate-700">
                    {formValues.name}
                  </span>{" "}
                  · {formValues.email}
                </p>
                <p className="mt-1">
                  {selectedOrg?.name ??
                    formValues.requestedOrgName}{" "}
                  · {formValues.facilityName}
                </p>
              </div>

              <AccountAgreementSection
                role="PROVIDER"
                acceptAuthorization={acceptAuthorizedUse}
                acceptPrivacy={acceptPrivacyCommunications}
                onAcceptAuthorization={setAcceptAuthorizedUse}
                onAcceptPrivacy={setAcceptPrivacyCommunications}
                onOpenDocument={setLegalDocSlug}
              />

              <input
                type="hidden"
                name="siteIds"
                value={JSON.stringify(selectedSites.map((s) => s.id))}
              />
              <input
                type="hidden"
                name="primarySiteId"
                value={selectedSites[0]?.id ?? ""}
              />
              <input type="hidden" name="name" value={formValues.name ?? ""} />
              <input type="hidden" name="email" value={formValues.email ?? ""} />
              <input
                type="hidden"
                name="password"
                value={formValues.password ?? ""}
              />
              <input
                type="hidden"
                name="organizationId"
                value={formValues.organizationId ?? ""}
              />
              <input
                type="hidden"
                name="requestedOrgName"
                value={formValues.requestedOrgName ?? ""}
              />
              <input
                type="hidden"
                name="facilityName"
                value={formValues.facilityName ?? ""}
              />
              <input
                type="hidden"
                name="facilityAddress"
                value={formValues.facilityAddress ?? ""}
              />
              <input
                type="hidden"
                name="department"
                value={formValues.department ?? ""}
              />
              <input type="hidden" name="zipCode" value={formValues.zipCode ?? ""} />
              <input
                type="hidden"
                name="facilityContactName"
                value={formValues.facilityContactName ?? ""}
              />
              <input
                type="hidden"
                name="facilityContactPhone"
                value={formValues.facilityContactPhone ?? ""}
              />
              <input
                type="hidden"
                name="requesterPhone"
                value={formValues.requesterPhone ?? ""}
              />
              <input
                type="hidden"
                name="requesterFax"
                value={formValues.requesterFax ?? ""}
              />
            </>
          )}

          {role !== "PROVIDER" && (
            <>
              <Input label="Full Name" name="name" required autoComplete="name" />
              <Input
                label="Email"
                name="email"
                type="email"
                required
                defaultValue={formValues.email}
                key={formValues.email ?? "rep-email"}
                autoComplete="email"
              />
              <Input
                label="Password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />

              {role === "COMPANY_ADMIN" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Zip Range Start"
                    name="zipCodeStart"
                    required
                    placeholder="85040"
                    pattern="\d{5}"
                    maxLength={5}
                  />
                  <Input
                    label="Zip Range End"
                    name="zipCodeEnd"
                    required
                    placeholder="85050"
                    pattern="\d{5}"
                    maxLength={5}
                  />
                </div>
              )}

              {needsCompany && (
                <Select
                  label="Device Company"
                  name="companyId"
                  required
                  defaultValue={formValues.companyId}
                  key={formValues.companyId ?? "company"}
                  options={[
                    {
                      value: "",
                      label: companies.length
                        ? "Select a company"
                        : "Loading companies...",
                    },
                    ...companies.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              )}

              <AccountAgreementSection
                role={role === "COMPANY_ADMIN" ? "COMPANY_ADMIN" : "REP"}
                acceptAuthorization={acceptAuthorizedUse}
                acceptPrivacy={acceptPrivacyCommunications}
                onAcceptAuthorization={setAcceptAuthorizedUse}
                onAcceptPrivacy={setAcceptPrivacyCommunications}
                onOpenDocument={setLegalDocSlug}
              />
            </>
          )}

          <div className="flex gap-3">
            {role === "PROVIDER" && providerStep > 1 && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setProviderStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              className="flex-1"
              disabled={
                loading ||
                (role === "PROVIDER" &&
                  providerStep === 4 &&
                  (!acceptAuthorizedUse || !acceptPrivacyCommunications)) ||
                (role !== "PROVIDER" &&
                  (!acceptAuthorizedUse || !acceptPrivacyCommunications))
              }
            >
              {loading
                ? "Creating account..."
                : role === "PROVIDER" && providerStep < 4
                  ? "Continue"
                  : "Create Account"}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-rose-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <LegalDocumentModal
        slug={legalDocSlug}
        open={Boolean(legalDocSlug)}
        onClose={() => setLegalDocSlug(null)}
      />
    </div>
  );
}
