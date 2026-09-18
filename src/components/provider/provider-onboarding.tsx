"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Building2, CheckCircle2, FileText, Shield } from "lucide-react";
import {
  AccountAgreementSection,
  LegalDocumentModal,
} from "@/components/legal/legal-document-modal";

interface Organization {
  id: string;
  name: string;
  status: string;
  complianceMode: string;
  facilities: {
    id: string;
    name: string;
    address: string;
    zipCode: string | null;
    department: string | null;
  }[];
}

export function ProviderOnboardingPage({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [requestNewOrg, setRequestNewOrg] = useState(false);
  const [requestedOrgName, setRequestedOrgName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [facilityAddress, setFacilityAddress] = useState("");
  const [facilityContactName, setFacilityContactName] = useState("");
  const [facilityContactPhone, setFacilityContactPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [requesterFax, setRequesterFax] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptUserAgreement, setAcceptUserAgreement] = useState(false);
  const [legalDocSlug, setLegalDocSlug] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [phiEnabled, setPhiEnabled] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchJson<{
        step: number;
        complete: boolean;
        organization?: Organization | null;
      }>("/api/provider/onboarding"),
      fetchJson<Organization[]>("/api/provider/organizations"),
    ])
      .then(([onboarding, orgs]) => {
        if (onboarding.complete) {
          router.replace("/provider");
          return;
        }
        setStep(Math.max(1, onboarding.step || 1));
        setOrganizations(Array.isArray(orgs) ? orgs : []);
        if (onboarding.organization) {
          setSelectedOrg(onboarding.organization as Organization);
          setOrganizationId(onboarding.organization.id);
        }
      })
      .catch(() => setError("Failed to load onboarding"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const org = organizations.find((o) => o.id === organizationId) ?? null;
    setSelectedOrg(org);
    setPhiEnabled(
      org?.complianceMode === "PHI_ENABLED" && org?.status === "ACTIVATED"
    );
    if (org?.facilities.length === 1) {
      setFacilityId(org.facilities[0].id);
    }
  }, [organizationId, organizations]);

  async function submitStep(payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const result = await fetchJson<{ step?: number; complete?: boolean; phiEnabled?: boolean }>(
        "/api/provider/onboarding",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (result.complete) {
        router.replace("/provider");
        return;
      }
      if (result.step) setStep(result.step);
      if (result.phiEnabled != null) setPhiEnabled(result.phiEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading onboarding...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <BrandMark size="lg" className="justify-center" />
          <p className="mt-3 text-sm text-slate-600">
            Welcome, {userName}. Complete setup to start using GoRepYo.
          </p>
        </div>

        <div className="mb-6 flex justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-2 w-16 rounded-full",
                step >= s ? "bg-rose-600" : "bg-slate-200"
              )}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Healthcare organization
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Select your verified hospital or provider organization. If your
                  organization is not yet on GoRepYo, request access — we will
                  contact administration to complete BAA and enterprise agreements.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <input
                  type="radio"
                  checked={!requestNewOrg}
                  onChange={() => setRequestNewOrg(false)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="font-medium text-slate-900">Select existing organization</p>
                  <Select
                    label=""
                    name="organizationId"
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    options={[
                      { value: "", label: "Choose organization..." },
                      ...organizations.map((o) => ({
                        value: o.id,
                        label: `${o.name} (${o.status === "ACTIVATED" ? o.complianceMode === "PHI_ENABLED" ? "PHI Enabled" : "Standard" : "Pending activation"})`,
                      })),
                    ]}
                  />
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <input
                  type="radio"
                  checked={requestNewOrg}
                  onChange={() => setRequestNewOrg(true)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      My organization is not yet activated
                    </p>
                    <p className="mt-1 text-xs text-amber-900">
                      Your organization is not yet activated for GoRepYo. You may
                      create your profile, but patient information and representative
                      requests containing PHI cannot be submitted until your
                      organization completes verification and required agreements.
                    </p>
                  </div>
                  <Input
                    label="Hospital / Organization name"
                    name="requestedOrgName"
                    value={requestedOrgName}
                    onChange={(e) => setRequestedOrgName(e.target.value)}
                    placeholder="e.g. Valley Heart Center"
                  />
                </div>
              </label>

              <Input
                label="Work email"
                name="workEmail"
                type="email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                required
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Facility name" value={facilityName} onChange={(e) => setFacilityName(e.target.value)} required />
                <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <Input label="Facility address" value={facilityAddress} onChange={(e) => setFacilityAddress(e.target.value)} required />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Zip code" value={zipCode} onChange={(e) => setZipCode(e.target.value)} maxLength={5} required />
                <Input label="Your phone" value={requesterPhone} onChange={(e) => setRequesterPhone(e.target.value)} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Facility contact" value={facilityContactName} onChange={(e) => setFacilityContactName(e.target.value)} required />
                <Input label="Contact phone" value={facilityContactPhone} onChange={(e) => setFacilityContactPhone(e.target.value)} required />
              </div>
              <Input label="Fax (optional)" value={requesterFax} onChange={(e) => setRequesterFax(e.target.value)} />

              <Button
                className="w-full"
                disabled={saving}
                onClick={() =>
                  submitStep({
                    step: 1,
                    organizationId: requestNewOrg ? undefined : organizationId,
                    requestNewOrg,
                    requestedOrgName: requestNewOrg ? requestedOrgName : undefined,
                    workEmail,
                    facilityName,
                    facilityAddress,
                    facilityContactName,
                    facilityContactPhone,
                    department,
                    zipCode,
                    requesterPhone,
                    requesterFax,
                  })
                }
              >
                Continue
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Facility & access level</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Confirm your facility under {selectedOrg?.name ?? "your organization"}.
                </p>
              </div>

              {selectedOrg && (
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3 text-sm",
                    phiEnabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {phiEnabled ? (
                      <Shield className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    {phiEnabled
                      ? "PHI-enabled organization — full patient workflows available after agreements"
                      : "Standard (non-PHI) mode — rep requests without patient-identifiable information"}
                  </div>
                </div>
              )}

              {selectedOrg?.facilities && selectedOrg.facilities.length > 0 ? (
                <Select
                  label="Facility"
                  name="facilityId"
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value)}
                  options={[
                    { value: "", label: "Select facility..." },
                    ...selectedOrg.facilities.map((f) => ({
                      value: f.id,
                      label: `${f.name}${f.department ? ` — ${f.department}` : ""}`,
                    })),
                  ]}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  Facility details saved from previous step. GoRepYo will add your
                  facility when your organization is activated.
                </p>
              )}

              <Button
                className="w-full"
                disabled={saving}
                onClick={() => submitStep({ step: 2, facilityId: facilityId || undefined })}
              >
                Continue
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Individual agreements</h2>
                <p className="mt-1 text-sm text-slate-600">
                  As an individual healthcare worker, accept GoRepYo&apos;s user
                  agreements. Your organization&apos;s BAA with GoRepYo LLC covers
                  HIPAA compliance obligations at the enterprise level.
                </p>
              </div>

              <AccountAgreementSection
                role="PROVIDER"
                acceptAuthorization={acceptUserAgreement}
                acceptPrivacy={acceptTerms}
                onAcceptAuthorization={setAcceptUserAgreement}
                onAcceptPrivacy={setAcceptTerms}
                onOpenDocument={setLegalDocSlug}
              />

              <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <FileText className="mb-1 inline h-4 w-4" /> Hospital BAA and enterprise
                agreements are executed between your organization and GoRepYo LLC —
                not individually by each nurse or provider.
              </div>

              <Button
                className="w-full"
                disabled={saving || !acceptTerms || !acceptUserAgreement}
                onClick={() =>
                  submitStep({ step: 3, acceptTerms, acceptUserAgreement })
                }
              >
                <CheckCircle2 className="h-4 w-4" />
                Activate account
              </Button>
            </div>
          )}
        </div>
      </div>
      <LegalDocumentModal
        slug={legalDocSlug}
        open={Boolean(legalDocSlug)}
        onClose={() => setLegalDocSlug(null)}
      />
    </div>
  );
}
