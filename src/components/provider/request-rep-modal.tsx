"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import {
  type FacilityDefaults,
  type FavoriteRepOption,
  type RequesterDefaults,
  formatRepTerritory,
} from "@/lib/request-form-types";
import { cn, PROCEDURE_TYPES, REP_STATUS_LABELS } from "@/lib/utils";
import {
  FacilitySearchPicker,
  type HealthcareSiteOption,
} from "@/components/shared/facility-search-picker";
import { Heart, MapPin, Sparkles, User, X } from "lucide-react";

interface Company {
  id: string;
  name: string;
  products: string[];
}

interface AvailableRep {
  id: string;
  name: string;
  phone: string | null;
  companyName: string;
  products: string[];
  status: string;
  distanceMiles: number | null;
  etaMinutes: number | null;
  territories?: FavoriteRepOption["territories"];
}

interface RequestRepModalProps {
  mode?: "provider" | "rep";
  companies: Company[];
  defaultFacility?: FacilityDefaults;
  defaultRequester?: RequesterDefaults;
  preferredRepId?: string;
  currentRepId?: string;
  defaultCompanyId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function mapFavoriteRep(raw: {
  id: string;
  name: string;
  phone: string | null;
  company?: { name: string } | null;
  repProfile?: {
    status: string;
    products: string[];
    territories?: FavoriteRepOption["territories"];
  } | null;
}): FavoriteRepOption {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    companyName: raw.company?.name ?? "",
    products: raw.repProfile?.products ?? [],
    status: raw.repProfile?.status ?? "OFF_DUTY",
    territories: raw.repProfile?.territories ?? [],
    isFavorite: true,
  };
}

function mapCompanyRep(raw: {
  id: string;
  name: string;
  phone: string | null;
  repProfile?: {
    status: string;
    products: string[];
    territories?: FavoriteRepOption["territories"];
  } | null;
}, companyName: string): FavoriteRepOption {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    companyName,
    products: raw.repProfile?.products ?? [],
    status: raw.repProfile?.status ?? "OFF_DUTY",
    territories: raw.repProfile?.territories ?? [],
  };
}

export function RequestRepModal({
  mode = "provider",
  companies,
  defaultFacility,
  defaultRequester,
  preferredRepId,
  currentRepId,
  defaultCompanyId,
  onClose,
  onSuccess,
}: RequestRepModalProps) {
  const isRepMode = mode === "rep";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestKind, setRequestKind] = useState<"procedure" | "appointment">("procedure");
  const [selectedCompany, setSelectedCompany] = useState(
    defaultCompanyId ?? companies[0]?.id ?? ""
  );
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedRepId, setSelectedRepId] = useState<string | null>(
    isRepMode ? currentRepId ?? null : preferredRepId ?? null
  );
  const [availableReps, setAvailableReps] = useState<AvailableRep[]>([]);
  const [favoriteReps, setFavoriteReps] = useState<FavoriteRepOption[]>([]);
  const [companyReps, setCompanyReps] = useState<FavoriteRepOption[]>([]);
  const [loadingReps, setLoadingReps] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [patientName, setPatientName] = useState("");
  const [patientDOB, setPatientDOB] = useState("");
  const [deviceManufacturer, setDeviceManufacturer] = useState("");
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmMessage, setCrmMessage] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [salesforceRecordId, setSalesforceRecordId] = useState("");
  const [phiEnabled, setPhiEnabled] = useState(true);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<HealthcareSiteOption[]>(
    defaultFacility?.siteId && defaultFacility.name && defaultFacility.zip
      ? [
          {
            id: defaultFacility.siteId,
            name: defaultFacility.name,
            address: defaultFacility.address ?? "",
            city: defaultFacility.city ?? "",
            state: defaultFacility.state ?? "",
            zipCode: defaultFacility.zip,
            lat: defaultFacility.lat,
            lng: defaultFacility.lng,
          },
        ]
      : []
  );
  const activeFacility = selectedFacility[0];

  useEffect(() => {
    if (isRepMode) return;
    fetchJson<{ canSubmitPhi: boolean; message: string | null }>("/api/provider/access")
      .then((access) => {
        setPhiEnabled(access.canSubmitPhi);
        setAccessMessage(access.message);
      })
      .catch(() => {
        setPhiEnabled(false);
      });
  }, [isRepMode]);

  const company = companies.find((c) => c.id === selectedCompany);
  const isProcedure = requestKind === "procedure";

  const scheduledAtIso = useMemo(() => {
    if (!scheduledDate || !scheduledTime) return null;
    const d = new Date(`${scheduledDate}T${scheduledTime}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [scheduledDate, scheduledTime]);

  const loadReps = useCallback(async () => {
    if (!selectedCompany) {
      setAvailableReps([]);
      setFavoriteReps([]);
      setCompanyReps([]);
      return;
    }

    setLoadingReps(true);
    try {
      if (isRepMode) {
        const reps = await fetchJson<
          {
            id: string;
            name: string;
            phone: string | null;
            repProfile?: {
              status: string;
              products: string[];
              territories?: FavoriteRepOption["territories"];
            } | null;
          }[]
        >("/api/company/reps");
        const mapped = (Array.isArray(reps) ? reps : []).map((r) =>
          mapCompanyRep(r, company?.name ?? "")
        );
        setCompanyReps(mapped);
        setAvailableReps([]);
        setFavoriteReps([]);

        setSelectedRepId((current) => {
          if (current && mapped.some((r) => r.id === current)) return current;
          if (currentRepId && mapped.some((r) => r.id === currentRepId)) {
            return currentRepId;
          }
          return mapped[0]?.id ?? null;
        });
        return;
      }

      const params = new URLSearchParams({ companyId: selectedCompany });
      if (selectedProduct) params.set("product", selectedProduct);
      if (activeFacility?.id) params.set("healthcareSiteId", activeFacility.id);
      if (activeFacility?.zipCode || defaultFacility?.zip) {
        params.set("facilityZip", activeFacility?.zipCode ?? defaultFacility?.zip ?? "");
      }
      if (activeFacility?.lat != null) params.set("facilityLat", String(activeFacility.lat));
      if (activeFacility?.lng != null) params.set("facilityLng", String(activeFacility.lng));
      if (scheduledAtIso) params.set("scheduledAt", scheduledAtIso);

      const [reps, favorites] = await Promise.all([
        fetchJson<AvailableRep[]>(`/api/reps/available?${params.toString()}`),
        fetchJson<
          {
            id: string;
            name: string;
            phone: string | null;
            company?: { name: string } | null;
            repProfile?: {
              status: string;
              products: string[];
              territories?: FavoriteRepOption["territories"];
            } | null;
          }[]
        >("/api/favorites"),
      ]);

      setAvailableReps(Array.isArray(reps) ? reps : []);
      const favMapped = (Array.isArray(favorites) ? favorites : [])
        .map(mapFavoriteRep)
        .filter((f) => !f.companyName || f.companyName === company?.name);
      setFavoriteReps(favMapped);
      setCompanyReps([]);

      setSelectedRepId((current) => {
        if (preferredRepId && [...favMapped, ...(reps ?? [])].some((r) => r.id === preferredRepId)) {
          return preferredRepId;
        }
        if (current && [...favMapped, ...(reps ?? [])].some((r) => r.id === current)) {
          return current;
        }
        return isRepMode ? currentRepId ?? null : null;
      });
    } catch {
      setAvailableReps([]);
      setFavoriteReps([]);
      setCompanyReps([]);
    } finally {
      setLoadingReps(false);
    }
  }, [
    selectedCompany,
    selectedProduct,
    activeFacility?.id,
    activeFacility?.zipCode,
    activeFacility?.lat,
    activeFacility?.lng,
    defaultFacility?.zip,
    preferredRepId,
    currentRepId,
    isRepMode,
    company?.name,
    scheduledAtIso,
  ]);

  useEffect(() => {
    loadReps();
  }, [loadReps]);

  const availableIds = useMemo(
    () => new Set(availableReps.map((r) => r.id)),
    [availableReps]
  );

  const availableFavoriteReps = useMemo(
    () => favoriteReps.filter((r) => availableIds.has(r.id)),
    [favoriteReps, availableIds]
  );

  const favoriteIds = useMemo(
    () => new Set(availableFavoriteReps.map((r) => r.id)),
    [availableFavoriteReps]
  );

  const otherAvailableReps = useMemo(
    () => availableReps.filter((r) => !favoriteIds.has(r.id)),
    [availableReps, favoriteIds]
  );

  async function lookupDeviceInCrm() {
    if (!patientName.trim() || !patientDOB || !deviceManufacturer.trim()) {
      setCrmMessage("Enter patient name, date of birth, and manufacturer first.");
      return;
    }

    setCrmLoading(true);
    setCrmMessage("");
    setDeviceName("");
    setDeviceSerial("");
    setSalesforceRecordId("");

    try {
      const result = await fetchJson<{
        status: string;
        companyId?: string;
        companyName?: string;
        message?: string;
        device?: { deviceName: string; serialNumber: string; product?: string };
        salesforceRecordId?: string;
      }>("/api/crm/device-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientDOB,
          manufacturer: deviceManufacturer.trim(),
        }),
      });

      if (result.companyId) {
        setSelectedCompany(result.companyId);
        if (!isRepMode) setSelectedRepId(null);
      }

      if (result.device) {
        setDeviceName(result.device.deviceName);
        setDeviceSerial(result.device.serialNumber);
        setSalesforceRecordId(result.salesforceRecordId ?? "");
        if (result.device.product) setSelectedProduct(result.device.product);
      }

      setCrmMessage(
        result.status === "FOUND"
          ? `Matched ${result.companyName}: ${result.device?.deviceName ?? "device found"}`
          : result.message ?? "No device found in CRM"
      );
    } catch (err) {
      setCrmMessage(err instanceof Error ? err.message : "CRM lookup failed");
    } finally {
      setCrmLoading(false);
    }
  }

  function deriveUrgency(date: string, time: string) {
    const scheduledAt = new Date(`${date}T${time}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(scheduledAt);
    day.setHours(0, 0, 0, 0);
    return day.getTime() === today.getTime() ? "ASAP" : "SCHEDULED";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);

    if (!activeFacility?.id || !activeFacility.zipCode) {
      setError("Select a facility from the directory");
      setLoading(false);
      return;
    }

    if (selectedRepId && !isRepMode && !availableIds.has(selectedRepId)) {
      setError("Selected rep is not available at the scheduled date and time");
      setLoading(false);
      return;
    }

    const payload = {
      companyId: selectedCompany,
      healthcareSiteId: activeFacility?.id,
      facilityName: activeFacility?.name ?? form.get("facilityName"),
      facilityAddr: activeFacility
        ? `${activeFacility.address}, ${activeFacility.city}, ${activeFacility.state} ${activeFacility.zipCode}`
        : form.get("facilityAddr"),
      facilityZipCode: activeFacility?.zipCode ?? form.get("facilityZipCode"),
      facilityLat: activeFacility?.lat ?? undefined,
      facilityLng: activeFacility?.lng ?? undefined,
      facilityContactName: form.get("facilityContactName"),
      facilityContactPhone: form.get("facilityContactPhone"),
      department: form.get("department") || undefined,
      facilityPhone: form.get("facilityPhone") || undefined,
      requesterName: form.get("requesterName"),
      requesterPhone: form.get("requesterPhone"),
      requesterEmail: form.get("requesterEmail"),
      requesterFax: form.get("requesterFax") || undefined,
      requestType: isProcedure ? "CASE" : "CHECK",
      procedureType: isProcedure
        ? form.get("procedureType")
        : form.get("appointmentDetails") || undefined,
      patientName: phiEnabled ? patientName.trim() : undefined,
      patientDOB: phiEnabled ? patientDOB : undefined,
      patientRoom: phiEnabled && isProcedure ? form.get("patientRoom") : undefined,
      deviceManufacturer: phiEnabled ? deviceManufacturer.trim() : undefined,
      deviceName: phiEnabled ? deviceName || undefined : undefined,
      deviceSerial: phiEnabled ? deviceSerial || undefined : undefined,
      salesforceRecordId: phiEnabled ? salesforceRecordId || undefined : undefined,
      product: selectedProduct || undefined,
      urgency: deriveUrgency(scheduledDate, scheduledTime),
      scheduledAt: new Date(`${scheduledDate}T${scheduledTime}`).toISOString(),
      notes: isProcedure
        ? form.get("notes") || undefined
        : form.get("appointmentDetails") || form.get("notes") || undefined,
      preferredRepId: !isRepMode && selectedRepId ? selectedRepId : undefined,
      repInitiated: isRepMode,
      assignRepId: isRepMode ? selectedRepId : undefined,
    };

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit request");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function RepOption({
    rep,
    subtitle,
    badge,
  }: {
    rep: FavoriteRepOption | AvailableRep;
    subtitle?: string;
    badge?: React.ReactNode;
  }) {
    const selected = selectedRepId === rep.id;
    const territories =
      "territories" in rep && rep.territories
        ? formatRepTerritory(rep.territories)
        : undefined;

    return (
      <button
        type="button"
        onClick={() => setSelectedRepId(rep.id)}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
          selected
            ? "border-rose-300 bg-rose-50 ring-1 ring-rose-200"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-rose-600 bg-rose-600" : "border-slate-300"
          )}
        >
          {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <User className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-900">{rep.name}</span>
            {"status" in rep && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                {REP_STATUS_LABELS[rep.status] ?? rep.status}
              </span>
            )}
            {badge}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {subtitle ?? ("companyName" in rep ? rep.companyName : "")}
          </p>
          {"products" in rep && rep.products.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">{rep.products.join(" · ")}</p>
          )}
          {territories && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              {territories}
            </p>
          )}
          {"etaMinutes" in rep && rep.etaMinutes != null && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3" />
              ~{rep.etaMinutes} min away
              {rep.distanceMiles != null && ` (${rep.distanceMiles.toFixed(1)} mi)`}
            </p>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isRepMode ? "Create Provider Request" : "Request a Rep"}
            </h2>
            {!isRepMode && (
              <p className="mt-0.5 text-sm text-slate-600">
                We will send this to the account manager covering this location
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Facility Information
            </h3>
            <FacilitySearchPicker
              selected={selectedFacility}
              onChange={setSelectedFacility}
              label="Hospital or clinic"
              helperText="Choose the facility. Requests route to people who cover it, or the nearest covered facility."
            />
            <Input
              label="Department"
              name="department"
              defaultValue={defaultFacility?.department}
            />
            <Input label="Facility Phone (optional)" name="facilityPhone" type="tel" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Facility Contact Name"
                name="facilityContactName"
                defaultValue={defaultFacility?.contactName}
                required
              />
              <Input
                label="Facility Contact Phone"
                name="facilityContactPhone"
                type="tel"
                defaultValue={defaultFacility?.contactPhone}
                required
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Requester Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Requester Name"
                name="requesterName"
                defaultValue={defaultRequester?.name}
                required
              />
              <Input
                label="Requester Phone"
                name="requesterPhone"
                type="tel"
                defaultValue={defaultRequester?.phone}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Requester Email"
                name="requesterEmail"
                type="email"
                defaultValue={defaultRequester?.email}
                required
              />
              <Input
                label="Requester Fax"
                name="requesterFax"
                type="tel"
                defaultValue={defaultRequester?.fax}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Request Details
            </h3>
            <div className="flex gap-2">
              {(["procedure", "appointment"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setRequestKind(kind)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium transition",
                    requestKind === kind
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {kind === "procedure" ? "Procedure" : "Appointment"}
                </button>
              ))}
            </div>

            {!phiEnabled && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Standard (non-PHI) request</p>
                <p className="mt-1 text-xs">
                  {accessMessage ??
                    "Patient-identifiable information cannot be submitted until your organization is PHI-enabled. Submit rep support requests with facility and scheduling details only."}
                </p>
              </div>
            )}

            {phiEnabled && (
            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Patient & Device Lookup
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  We route this to the matching manufacturer&apos;s Salesforce CRM to
                  find the implanted device, then send the request to their rep team.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Patient Name"
                  name="patientNameField"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                />
                <Input
                  label="Date of Birth"
                  name="patientDOBField"
                  type="date"
                  value={patientDOB}
                  onChange={(e) => setPatientDOB(e.target.value)}
                  required
                />
              </div>
              <Input
                label="Device Manufacturer"
                name="deviceManufacturerField"
                value={deviceManufacturer}
                onChange={(e) => setDeviceManufacturer(e.target.value)}
                placeholder="e.g. Medtronic, Abbott, Biotronik"
                required
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={lookupDeviceInCrm}
                  disabled={crmLoading}
                >
                  {crmLoading ? "Looking up..." : "Look Up Device in CRM"}
                </Button>
                {crmMessage && (
                  <p className="text-xs text-slate-600">{crmMessage}</p>
                )}
              </div>
              {(deviceName || deviceSerial) && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {deviceName && <p className="font-medium">{deviceName}</p>}
                  {deviceSerial && (
                    <p className="text-xs text-emerald-800">Serial: {deviceSerial}</p>
                  )}
                </div>
              )}
            </div>
            )}

            {isProcedure ? (
              <>
                {phiEnabled && <Input label="Room Number" name="patientRoom" required />}
                <Select
                  label="Procedure Type"
                  name="procedureType"
                  required
                  options={PROCEDURE_TYPES.map((p) => ({ value: p, label: p }))}
                />
              </>
            ) : (
              <Textarea
                label="Appointment Details"
                name="appointmentDetails"
                rows={3}
                required
                placeholder="Reason for visit, device check details, etc."
              />
            )}

            <Select
              label="Device Company"
              name="companyId"
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setSelectedRepId(isRepMode ? currentRepId ?? null : null);
              }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Product (optional)"
              name="product"
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
                if (!isRepMode) setSelectedRepId(null);
              }}
              options={[
                { value: "", label: "Any product" },
                ...(company?.products ?? []).map((p) => ({ value: p, label: p })),
              ]}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={isProcedure ? "Procedure Date" : "Appointment Date"}
                name="scheduledDate"
                type="date"
                value={scheduledDate}
                onChange={(e) => {
                  setScheduledDate(e.target.value);
                  if (!isRepMode) setSelectedRepId(null);
                }}
                required
              />
              <Input
                label={isProcedure ? "Procedure Time" : "Appointment Time"}
                name="scheduledTime"
                type="time"
                value={scheduledTime}
                onChange={(e) => {
                  setScheduledTime(e.target.value);
                  if (!isRepMode) setSelectedRepId(null);
                }}
                required
              />
            </div>
            {isProcedure && <Textarea label="Additional Notes" name="notes" rows={3} />}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {isRepMode ? "Assign Rep" : "Select Rep"}
              </h3>
              {!loadingReps && !isRepMode && (
                <span className="text-xs text-slate-500">
                  {availableReps.length} available
                </span>
              )}
            </div>

            {loadingReps ? (
              <p className="text-sm text-slate-500">Loading reps...</p>
            ) : isRepMode ? (
              companyReps.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  No reps found for your company. Select a device company above.
                </div>
              ) : (
                <div className="space-y-2">
                  {companyReps.map((rep) => (
                    <RepOption
                      key={rep.id}
                      rep={rep}
                      subtitle={rep.id === currentRepId ? "You" : rep.companyName}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedRepId(null)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                    selectedRepId === null
                      ? "border-rose-300 bg-rose-50 ring-1 ring-rose-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      selectedRepId === null
                        ? "border-rose-600 bg-rose-600"
                        : "border-slate-300"
                    )}
                  >
                    {selectedRepId === null && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-rose-500" />
                      <span className="font-medium text-slate-900">
                        Auto-route to covering manager
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sends this to the account manager whose team covers this location
                    </p>
                  </div>
                </button>

                {availableFavoriteReps.length > 0 && (
                  <>
                    <p className="pt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Favorite Reps
                    </p>
                    {availableFavoriteReps.map((rep) => (
                      <RepOption
                        key={rep.id}
                        rep={rep}
                        badge={
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                            <Heart className="h-3 w-3 fill-current" />
                            Favorite
                          </span>
                        }
                      />
                    ))}
                  </>
                )}

                {otherAvailableReps.map((rep) => (
                  <RepOption key={rep.id} rep={rep} />
                ))}

                {availableFavoriteReps.length === 0 && otherAvailableReps.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm text-slate-600">
                    No reps are currently available. Submit anyway and the account manager
                    covering this location will receive it.
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || (isRepMode && !selectedRepId)}>
              {loading
                ? "Submitting..."
                : isRepMode
                  ? "Create & Assign Request"
                  : selectedRepId
                    ? "Request Selected Rep"
                    : "Submit Request"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
