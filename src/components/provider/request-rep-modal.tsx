"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Heart,
  MapPin,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  UsersRound,
  X,
} from "lucide-react";

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
  const formRef = useRef<HTMLFormElement>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [reviewFields, setReviewFields] = useState<Record<string, string>>({});
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

  const stepLabels = [
    "Facility & requester",
    "Request type",
    "Clinical details",
    "Patient details",
    "Review & submit",
  ];

  function validateStep(step: number) {
    if (step === 1 && (!activeFacility?.id || !activeFacility.zipCode)) {
      setError("Select a facility from the directory before continuing.");
      return false;
    }
    const section = formRef.current?.querySelector<HTMLElement>(`[data-wizard-step="${step}"]`);
    const requiredFields = section?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[required]");
    const invalidField = Array.from(requiredFields ?? []).find((field) => !field.checkValidity());
    if (invalidField) {
      setError("");
      invalidField.reportValidity();
      return false;
    }
    setError("");
    return true;
  }

  function goNext() {
    if (!validateStep(currentStep)) return;
    setCurrentStep((step) => Math.min(step + 1, stepLabels.length));
  }

  function validateBeforeSubmit() {
    for (let step = 1; step < stepLabels.length; step += 1) {
      if (validateStep(step)) continue;
      setCurrentStep(step);
      window.setTimeout(() => {
        const section = formRef.current?.querySelector<HTMLElement>(`[data-wizard-step="${step}"]`);
        const invalidField = section?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(":invalid");
        invalidField?.reportValidity();
      }, 0);
      return false;
    }
    return true;
  }

  function captureReviewFields(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const snapshot: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") snapshot[key] = value;
    });
    setReviewFields(snapshot);
  }

  useEffect(() => {
    if (currentStep !== 5 || !formRef.current) return;
    const snapshot: Record<string, string> = {};
    new FormData(formRef.current).forEach((value, key) => {
      if (typeof value === "string") snapshot[key] = value;
    });
    setReviewFields(snapshot);
  }, [currentStep]);

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
    if (currentStep < stepLabels.length) {
      goNext();
      return;
    }
    if (!validateBeforeSubmit()) return;
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

  const selectedRep = [...availableReps, ...favoriteReps, ...companyReps].find(
    (rep) => rep.id === selectedRepId
  );
  const requestDateLabel = scheduledDate
    ? new Date(`${scheduledDate}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Choose a date";
  const requestUrgency = deriveUrgency(scheduledDate, scheduledTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-[2px] sm:p-5">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="hidden items-center gap-0.5 sm:flex" aria-label="GoRepYo">
                <span className="text-2xl font-semibold tracking-tight text-slate-500">Go</span>
                <span className="text-2xl font-bold tracking-tight text-rose-600">RepYo</span>
              </div>
              <div className="hidden h-11 w-px bg-slate-200 sm:block" />
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {isRepMode ? "Create Provider Request" : "Request a Rep"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {isRepMode
                    ? "Create and assign a request on a provider’s behalf."
                    : "We’ll match the closest eligible rep for you."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-4 text-[11px] text-slate-500 lg:flex">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-slate-500" /> Protected access</span>
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-slate-500" /> Live status</span>
                <span className="flex items-center gap-1.5"><UsersRound className="h-4 w-4 text-slate-500" /> Connected teams</span>
              </div>
              <button type="button" onClick={onClose} aria-label="Close request form" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="mt-5 grid grid-cols-5 gap-1 sm:gap-3" aria-label="Request steps">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const active = currentStep === step;
              const completed = currentStep > step;
              return (
                <div key={label} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      completed ? "bg-rose-600 text-white" : active ? "bg-rose-600 text-white ring-4 ring-rose-100" : "bg-slate-100 text-slate-500"
                    )}>
                      {completed ? <Check className="h-4 w-4" /> : step}
                    </span>
                    <span className={cn("hidden truncate text-xs font-semibold sm:block", active ? "text-slate-900" : completed ? "text-rose-700" : "text-slate-400")}>{label}</span>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full transition-all", currentStep >= step ? "bg-rose-500" : "bg-transparent")} />
                  </div>
                  <span className={cn("mt-1 block truncate text-[10px] sm:hidden", active ? "font-semibold text-slate-900" : "text-slate-400")}>{label}</span>
                </div>
              );
            })}
          </nav>
        </header>

        <form ref={formRef} noValidate onSubmit={handleSubmit} onChange={captureReviewFields} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6">
            {error && (
              <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            <section data-wizard-step="1" hidden={currentStep !== 1} className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">1</span>
                <div><h3 className="text-base font-bold text-slate-900">Facility and requester information</h3><p className="text-sm text-slate-600">Your profile details are filled in when available.</p></div>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><MapPin className="h-4 w-4 text-rose-600" /><h4 className="text-sm font-semibold text-slate-900">Facility information</h4></div>
                  <FacilitySearchPicker selected={selectedFacility} onChange={setSelectedFacility} label="Hospital or clinic" helperText="Choose the facility. Requests route to eligible people who cover it." />
                  {activeFacility && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{[activeFacility.address, activeFacility.city, activeFacility.state, activeFacility.zipCode].filter(Boolean).join(", ")}</div>}
                  <Input label="Department" name="department" defaultValue={defaultFacility?.department} />
                  <Input label="Facility phone (optional)" name="facilityPhone" type="tel" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Facility contact name" name="facilityContactName" defaultValue={defaultFacility?.contactName} required />
                    <Input label="Facility contact phone" name="facilityContactPhone" type="tel" defaultValue={defaultFacility?.contactPhone} required />
                  </div>
                </section>
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><User className="h-4 w-4 text-rose-600" /><h4 className="text-sm font-semibold text-slate-900">Requester information</h4></div>
                  <Input label="Requester name" name="requesterName" defaultValue={defaultRequester?.name} required />
                  <Input label="Requester phone" name="requesterPhone" type="tel" defaultValue={defaultRequester?.phone} required />
                  <Input label="Requester email" name="requesterEmail" type="email" defaultValue={defaultRequester?.email} required />
                  <Input label="Requester fax (optional)" name="requesterFax" type="tel" defaultValue={defaultRequester?.fax} />
                </section>
              </div>
            </section>

            <section data-wizard-step="2" hidden={currentStep !== 2} className="space-y-5">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">2</span><div><h3 className="text-base font-bold text-slate-900">Select request type</h3><p className="text-sm text-slate-600">Choose the kind of device support you need.</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["procedure", "appointment"] as const).map((kind) => {
                  const active = requestKind === kind;
                  return <button key={kind} type="button" aria-pressed={active} onClick={() => setRequestKind(kind)} className={cn("flex min-h-44 flex-col items-center justify-center rounded-xl border-2 p-6 text-center transition", active ? "border-rose-500 bg-rose-50/70 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")}>
                    {kind === "procedure" ? <Stethoscope className={cn("mb-3 h-9 w-9", active ? "text-rose-600" : "text-slate-500")} /> : <CalendarClock className={cn("mb-3 h-9 w-9", active ? "text-rose-600" : "text-slate-500")} />}
                    <span className="text-base font-bold uppercase tracking-wide text-slate-900">{kind === "procedure" ? "Procedure" : "Appointment"}</span>
                    <span className="mt-2 max-w-xs text-sm text-slate-600">{kind === "procedure" ? "Procedure, implant, changeout, or surgical support" : "Device check, programming, troubleshooting, or follow-up"}</span>
                  </button>;
                })}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Timing</p>
                <p className="mt-1 text-sm text-slate-600">Your request is marked <span className="font-semibold text-rose-700">{requestUrgency === "ASAP" ? "ASAP" : "Scheduled"}</span> based on the date and time you choose in the next step.</p>
              </div>
            </section>

            <section data-wizard-step="3" hidden={currentStep !== 3} className="space-y-5">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">3</span><div><h3 className="text-base font-bold text-slate-900">Enter clinical details</h3><p className="text-sm text-slate-600">Add the details that help the right rep prepare.</p></div></div>
              <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><Stethoscope className="h-4 w-4 text-rose-600" /><h4 className="text-sm font-semibold text-slate-900">Procedure / appointment</h4></div>
                  {isProcedure ? <Select label="Procedure type" name="procedureType" required options={PROCEDURE_TYPES.map((p) => ({ value: p, label: p }))} /> : <Textarea label="Appointment details" name="appointmentDetails" rows={3} required placeholder="Reason for visit, device check details, etc." />}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Device company" name="companyId" value={selectedCompany} required onChange={(e) => { setSelectedCompany(e.target.value); setSelectedRepId(isRepMode ? currentRepId ?? null : null); }} options={companies.map((c) => ({ value: c.id, label: c.name }))} />
                    <Select label="Product (optional)" name="product" value={selectedProduct} onChange={(e) => { setSelectedProduct(e.target.value); if (!isRepMode) setSelectedRepId(null); }} options={[{ value: "", label: "Any product" }, ...(company?.products ?? []).map((p) => ({ value: p, label: p }))]} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label={isProcedure ? "Procedure date" : "Appointment date"} name="scheduledDate" type="date" value={scheduledDate} onChange={(e) => { setScheduledDate(e.target.value); if (!isRepMode) setSelectedRepId(null); }} required />
                    <Input label={isProcedure ? "Procedure time" : "Appointment time"} name="scheduledTime" type="time" value={scheduledTime} onChange={(e) => { setScheduledTime(e.target.value); if (!isRepMode) setSelectedRepId(null); }} required />
                  </div>
                  {isProcedure && <Textarea label="Additional notes (optional)" name="notes" rows={3} placeholder="Special equipment, preferences, or other details" />}
                </section>
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3"><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-rose-600" /><h4 className="text-sm font-semibold text-slate-900">{isRepMode ? "Assign a rep" : "Rep assignment"}</h4></div>{!loadingReps && !isRepMode && <span className="text-xs text-slate-500">{availableReps.length} available</span>}</div>
                  {loadingReps ? <p className="py-6 text-center text-sm text-slate-500">Finding eligible reps…</p> : isRepMode ? companyReps.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">No reps found for your company. Select a device company above.</div> : <div className="max-h-[26rem] space-y-2 overflow-y-auto">{companyReps.map((rep) => <RepOption key={rep.id} rep={rep} subtitle={rep.id === currentRepId ? "You" : rep.companyName} />)}</div> : <div className="max-h-[26rem] space-y-2 overflow-y-auto">
                    <button type="button" onClick={() => setSelectedRepId(null)} className={cn("flex w-full items-start gap-3 rounded-lg border p-3 text-left transition", selectedRepId === null ? "border-rose-300 bg-rose-50 ring-1 ring-rose-200" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")}>
                      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selectedRepId === null ? "border-rose-600 bg-rose-600" : "border-slate-300")}>{selectedRepId === null && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span><span><span className="flex items-center gap-2 font-medium text-slate-900"><Sparkles className="h-4 w-4 text-rose-500" />Auto-assign closest eligible rep</span><span className="mt-1 block text-xs text-slate-500">We’ll route this to an available rep who covers this facility.</span></span>
                    </button>
                    {availableFavoriteReps.length > 0 && <><p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Favorite reps</p>{availableFavoriteReps.map((rep) => <RepOption key={rep.id} rep={rep} badge={<span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700"><Heart className="h-3 w-3 fill-current" />Favorite</span>} />)}</>}
                    {otherAvailableReps.map((rep) => <RepOption key={rep.id} rep={rep} />)}
                    {availableFavoriteReps.length === 0 && otherAvailableReps.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm text-slate-600">No reps are currently available. Submit and the covering manager will receive the request.</div>}
                  </div>}
                </section>
              </div>
            </section>

            <section data-wizard-step="4" hidden={currentStep !== 4} className="space-y-5">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">4</span><div><h3 className="text-base font-bold text-slate-900">Patient information</h3><p className="text-sm text-slate-600">Patient details stay hidden from reps until access is authorized.</p></div></div>
              {!phiEnabled ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 shrink-0" /><div><p className="font-semibold">Patient information is unavailable</p><p className="mt-1 text-sm">{accessMessage ?? "Your organization must activate PHI access before patient-identifiable information can be submitted. You can continue with a request that contains no patient details."}</p></div></div></div> : <div className="rounded-xl border border-rose-100 bg-white p-4 sm:p-6">
                <div className="mb-5 flex items-start gap-3 rounded-lg bg-rose-50 px-4 py-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /><p className="text-sm text-slate-700">Patient details are protected and are shown only when request access and PHI authorization allow it.</p></div>
                <div className="grid gap-4 sm:grid-cols-2"><Input label="Patient first and last name" name="patientNameField" value={patientName} onChange={(e) => setPatientName(e.target.value)} required /><Input label="Date of birth" name="patientDOBField" type="date" value={patientDOB} onChange={(e) => setPatientDOB(e.target.value)} required /></div>
                {isProcedure && <div className="mt-4"><Input label="Patient room number" name="patientRoom" required /></div>}
                <div className="mt-4"><Input label="Device manufacturer" name="deviceManufacturerField" value={deviceManufacturer} onChange={(e) => setDeviceManufacturer(e.target.value)} placeholder="e.g. Medtronic, Abbott, Biotronik" required /></div>
                <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" variant="secondary" size="sm" onClick={lookupDeviceInCrm} disabled={crmLoading}>{crmLoading ? "Looking up…" : "Look up device in CRM"}</Button>{crmMessage && <p className="text-xs text-slate-600">{crmMessage}</p>}</div>
                {(deviceName || deviceSerial) && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{deviceName && <p className="font-medium">{deviceName}</p>}{deviceSerial && <p className="text-xs text-emerald-800">Serial: {deviceSerial}</p>}</div>}
                <p className="mt-4 text-xs text-slate-500">CRM lookup is available when your organization has configured an integration.</p>
              </div>}
            </section>

            <section data-wizard-step="5" hidden={currentStep !== 5} className="space-y-5">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">5</span><div><h3 className="text-base font-bold text-slate-900">Review and submit</h3><p className="text-sm text-slate-600">Check the request details before sending.</p></div></div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5"><div><h4 className="font-semibold text-slate-900">Request summary</h4><p className="mt-0.5 text-xs text-slate-500">{requestUrgency === "ASAP" ? "ASAP" : "Scheduled"} · {requestDateLabel} at {scheduledTime || "Choose a time"}</p></div><ClipboardCheck className="h-5 w-5 text-rose-600" /></div>
                <dl className="grid gap-x-8 sm:grid-cols-2">
                  {[
                    ["Request type", `${isProcedure ? "Procedure" : "Appointment"} · ${isProcedure ? reviewFields.procedureType || "—" : reviewFields.appointmentDetails || "—"}`],
                    ["Facility", activeFacility?.name || "Select a facility"],
                    ["Department", reviewFields.department || defaultFacility?.department || "—"],
                    ["Facility contact", [reviewFields.facilityContactName, reviewFields.facilityContactPhone].filter(Boolean).join(" · ") || "—"],
                    ["Requester", [reviewFields.requesterName || defaultRequester?.name, reviewFields.requesterPhone || defaultRequester?.phone].filter(Boolean).join(" · ") || "—"],
                    ["Device company", company?.name || "Choose a device company"],
                    ["Product", selectedProduct || "Any product"],
                    ["Assigned rep", selectedRep?.name || (isRepMode ? "Select a rep" : "Auto-assign closest eligible rep")],
                    ...(phiEnabled ? [["Patient", patientName || "—"], ["Date of birth", patientDOB || "—"], ...(isProcedure ? [["Room", reviewFields.patientRoom || "—"]] : []), ["Manufacturer", deviceManufacturer || "—"]] : []),
                    ["Notes", reviewFields.notes || reviewFields.appointmentDetails || "—"],
                  ].map(([label, value]) => <div key={label} className="border-b border-slate-100 px-4 py-3 sm:px-5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd></div>)}
                </dl>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-slate-100 px-4 py-3 text-xs text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" /><p>Patient details are protected separately from request assignment and are only made available to authorized users.</p></div>
            </section>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-7">
            <div className="text-xs text-slate-500">Step {currentStep} of {stepLabels.length}</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={currentStep === 1 ? onClose : () => { setError(""); setCurrentStep((step) => Math.max(step - 1, 1)); }} disabled={loading}>
                {currentStep === 1 ? "Cancel" : <><ChevronLeft className="mr-1 h-4 w-4" />Back</>}
              </Button>
              <Button type="submit" disabled={loading || (isRepMode && !selectedRepId)}>
                {loading ? "Submitting…" : currentStep === stepLabels.length ? <>{isRepMode ? "Create & assign request" : selectedRepId ? "Request selected rep" : "Submit request"}<Check className="ml-2 h-4 w-4" /></> : <>Next<ChevronRight className="ml-1 h-4 w-4" /></>}
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
