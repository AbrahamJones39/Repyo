"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function LegalDocumentModal({
  slug,
  open,
  onClose,
}: {
  slug: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<{
    title: string;
    version: string;
    content: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !slug) return;
    setLoading(true);
    fetch(`/api/legal/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDoc(data))
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [open, slug]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={cn(
          "relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl",
          "border border-slate-200 bg-white shadow-xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              {doc?.title ?? "Loading..."}
            </h2>
            {doc?.version && (
              <p className="text-xs text-slate-500">Version {doc.version}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading document...</p>
          ) : doc ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {doc.content.replace(/^#+\s/gm, "").trim()}
            </pre>
          ) : (
            <p className="text-sm text-red-600">Could not load document.</p>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
          {slug && (
            <a
              href={`/legal/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open in new tab
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DocLink({
  slug,
  children,
  onOpen,
}: {
  slug: string;
  children: React.ReactNode;
  onOpen: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(slug)}
      className="font-medium text-rose-600 underline hover:text-rose-700"
    >
      {children}
    </button>
  );
}

function LegalDocumentEmbed({
  slug,
  onOpen,
  onReachedEnd,
}: {
  slug: string;
  onOpen: (slug: string) => void;
  onReachedEnd?: (slug: string) => void;
}) {
  const [doc, setDoc] = useState<{
    title: string;
    version: string;
    content: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/legal/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setDoc(data);
      })
      .catch(() => {
        if (!cancelled) setDoc(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function markIfScrolled(element: HTMLElement) {
    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 24) onReachedEnd?.(slug);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {doc?.title ?? (loading ? "Loading document..." : "Could not load document")}
          </p>
          {doc?.version && (
            <p className="text-xs text-slate-500">Version {doc.version}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpen(slug)}
          className="shrink-0 text-xs font-medium text-rose-600 underline hover:text-rose-700"
        >
          Expand
        </button>
      </div>
      <div
        className="max-h-52 overflow-y-auto px-3 py-2"
        onScroll={(event) => markIfScrolled(event.currentTarget)}
      >
        {loading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : doc ? (
          <pre
            ref={(node) => {
              if (node?.parentElement) markIfScrolled(node.parentElement);
            }}
            className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700"
          >
            {doc.content.replace(/^#+\s/gm, "").trim()}
          </pre>
        ) : (
          <p className="text-xs text-red-600">Could not load this document.</p>
        )}
      </div>
    </div>
  );
}

export type ProviderAgreementChecks = {
  orgAuth: boolean;
  userAgreement: boolean;
  phiUse: boolean;
  notEmergency: boolean;
  privacyAck: boolean;
  electronicComm: boolean;
};

export const EMPTY_PROVIDER_AGREEMENT_CHECKS: ProviderAgreementChecks = {
  orgAuth: false,
  userAgreement: false,
  phiUse: false,
  notEmergency: false,
  privacyAck: false,
  electronicComm: false,
};

export function allProviderChecksAccepted(checks: ProviderAgreementChecks) {
  return (
    checks.orgAuth &&
    checks.userAgreement &&
    checks.phiUse &&
    checks.notEmergency &&
    checks.privacyAck &&
    checks.electronicComm
  );
}

function AgreementCheckbox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-start gap-3 text-sm ${
        disabled ? "text-slate-400" : "text-slate-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
        required
      />
      <span>{children}</span>
    </label>
  );
}

export function ProviderAccountAgreementSection({
  checks,
  onChange,
  onOpenDocument,
  ctaHint = "create your account",
}: {
  checks: ProviderAgreementChecks;
  onChange: (next: ProviderAgreementChecks) => void;
  onOpenDocument: (slug: string) => void;
  ctaHint?: string;
}) {
  const [readSlugs, setReadSlugs] = useState<string[]>([]);
  const requiredReads = ["terms-of-use", "privacy-policy", "provider-user-agreement"];
  const documentsRead = requiredReads.every((slug) => readSlugs.includes(slug));

  function setCheck<K extends keyof ProviderAgreementChecks>(
    key: K,
    value: boolean
  ) {
    onChange({ ...checks, [key]: value });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account Agreement
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Read the Terms of Use, Privacy Policy, and Healthcare Provider User
          Agreement below, then accept all acknowledgements to {ctaHint}.
        </p>
      </div>

      <LegalDocumentEmbed
        slug="terms-of-use"
        onOpen={onOpenDocument}
        onReachedEnd={(slug) =>
          setReadSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]))
        }
      />
      <LegalDocumentEmbed
        slug="privacy-policy"
        onOpen={onOpenDocument}
        onReachedEnd={(slug) =>
          setReadSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]))
        }
      />
      <LegalDocumentEmbed
        slug="provider-user-agreement"
        onOpen={onOpenDocument}
        onReachedEnd={(slug) =>
          setReadSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]))
        }
      />
      {!documentsRead && (
        <p className="text-xs text-slate-500">
          Scroll to the end of each document before accepting.
        </p>
      )}

      <AgreementCheckbox
        checked={checks.orgAuth}
        disabled={!documentsRead}
        onChange={(v) => setCheck("orgAuth", v)}
      >
        I confirm that I am authorized by the healthcare organization identified
        above to use RepYo for legitimate professional purposes.
      </AgreementCheckbox>

      <AgreementCheckbox
        checked={checks.userAgreement}
        disabled={!documentsRead}
        onChange={(v) => setCheck("userAgreement", v)}
      >
        I agree to the{" "}
        <DocLink slug="provider-user-agreement" onOpen={onOpenDocument}>
          RepYo Healthcare Provider User Agreement
        </DocLink>
        .
      </AgreementCheckbox>

      <AgreementCheckbox
        checked={checks.phiUse}
        disabled={!documentsRead}
        onChange={(v) => setCheck("phiUse", v)}
      >
        I understand that RepYo may contain Protected Health Information and
        agree to access, enter, use, and disclose patient information only as
        authorized and reasonably necessary for legitimate professional
        purposes.
      </AgreementCheckbox>

      <AgreementCheckbox
        checked={checks.notEmergency}
        disabled={!documentsRead}
        onChange={(v) => setCheck("notEmergency", v)}
      >
        I understand that RepYo is for representative-support requests and is
        not an emergency service, electronic health record, or substitute for my
        organization&apos;s clinical communication systems.
      </AgreementCheckbox>

      <AgreementCheckbox
        checked={checks.privacyAck}
        disabled={!documentsRead}
        onChange={(v) => setCheck("privacyAck", v)}
      >
        I acknowledge that I have been provided access to the{" "}
        <DocLink slug="privacy-policy" onOpen={onOpenDocument}>
          RepYo Privacy Policy
        </DocLink>
        .
      </AgreementCheckbox>

      <AgreementCheckbox
        checked={checks.electronicComm}
        disabled={!documentsRead}
        onChange={(v) => setCheck("electronicComm", v)}
      >
        I consent to electronic service, security, scheduling, request-status,
        and account communications from RepYo.
      </AgreementCheckbox>
    </div>
  );
}

export function AccountAgreementSection({
  role,
  acceptAuthorization,
  acceptPrivacy,
  onAcceptAuthorization,
  onAcceptPrivacy,
  onOpenDocument,
  acceptOrgAdminAcknowledgment = false,
  onAcceptOrgAdminAcknowledgment,
}: {
  role: "REP" | "COMPANY_ADMIN";
  acceptAuthorization: boolean;
  acceptPrivacy: boolean;
  onAcceptAuthorization: (v: boolean) => void;
  onAcceptPrivacy: (v: boolean) => void;
  onOpenDocument: (slug: string) => void;
  acceptOrgAdminAcknowledgment?: boolean;
  onAcceptOrgAdminAcknowledgment?: (v: boolean) => void;
}) {
  const userAgreementSlug =
    role === "REP" ? "rep-user-agreement" : "organization-admin-acknowledgment";
  const requiredReads = [
    "terms-of-use",
    "privacy-policy",
    userAgreementSlug,
  ];
  const [readSlugs, setReadSlugs] = useState<string[]>([]);
  const documentsRead = requiredReads.every((slug) => readSlugs.includes(slug));

  function markRead(slug: string) {
    setReadSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account Agreement
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          {role === "REP"
            ? "Read the Terms of Use, Privacy Policy, and Medical Device Representative User Agreement below, then accept both acknowledgements to create your account."
            : "Read the Terms of Use, Privacy Policy, and Organization Administrator Acknowledgment below, then accept all acknowledgements to create your account."}
        </p>
      </div>

      <LegalDocumentEmbed
        slug="terms-of-use"
        onOpen={onOpenDocument}
        onReachedEnd={markRead}
      />
      <LegalDocumentEmbed
        slug="privacy-policy"
        onOpen={onOpenDocument}
        onReachedEnd={markRead}
      />
      <LegalDocumentEmbed
        slug={userAgreementSlug}
        onOpen={onOpenDocument}
        onReachedEnd={markRead}
      />
      {!documentsRead && (
        <p className="text-xs text-slate-500">
          Scroll to the end of each document before accepting.
        </p>
      )}

      <AgreementCheckbox
        checked={acceptAuthorization}
        disabled={!documentsRead}
        onChange={onAcceptAuthorization}
      >
        I confirm that I am authorized to use RepYo and agree to the{" "}
        <DocLink slug="terms-of-use" onOpen={onOpenDocument}>
          RepYo Terms of Use
        </DocLink>{" "}
        and the{" "}
        <DocLink slug={userAgreementSlug} onOpen={onOpenDocument}>
          User Agreement applicable to my account type
        </DocLink>
        . I understand that RepYo may involve confidential healthcare information
        and that I may access or use such information only for authorized
        professional purposes.
      </AgreementCheckbox>

      <AgreementCheckbox
        checked={acceptPrivacy}
        disabled={!documentsRead}
        onChange={onAcceptPrivacy}
      >
        I acknowledge that I have been provided access to the{" "}
        <DocLink slug="privacy-policy" onOpen={onOpenDocument}>
          RepYo Privacy Policy
        </DocLink>{" "}
        and consent to necessary electronic account, security, request,
        scheduling, and service communications.
      </AgreementCheckbox>

      {role === "COMPANY_ADMIN" && onAcceptOrgAdminAcknowledgment && (
        <AgreementCheckbox
          checked={acceptOrgAdminAcknowledgment}
          disabled={!documentsRead}
          onChange={onAcceptOrgAdminAcknowledgment}
        >
          I confirm that I am authorized by the organization identified above to
          act as a RepYo Organization Administrator. I have read and agree to
          the RepYo{" "}
          <DocLink
            slug="organization-admin-acknowledgment"
            onOpen={onOpenDocument}
          >
            Organization Administrator Acknowledgment
          </DocLink>{" "}
          and understand that my administrative privileges must be used only for
          authorized organizational purposes, including appropriately managing
          user access and protecting confidential information and PHI.
        </AgreementCheckbox>
      )}
    </div>
  );
}

export function ProviderAgreementSection({
  checks,
  onChange,
  onOpenDocument,
}: {
  checks: ProviderAgreementChecks;
  onChange: (next: ProviderAgreementChecks) => void;
  onOpenDocument: (slug: string) => void;
}) {
  return (
    <ProviderAccountAgreementSection
      checks={checks}
      onChange={onChange}
      onOpenDocument={onOpenDocument}
    />
  );
}

export function RepAgreementSection({
  accepted,
  onAccept,
  onOpenDocument,
}: {
  accepted: boolean;
  onAccept: (v: boolean) => void;
  onOpenDocument: (slug: string) => void;
}) {
  return (
    <AccountAgreementSection
      role="REP"
      acceptAuthorization={accepted}
      acceptPrivacy={accepted}
      onAcceptAuthorization={onAccept}
      onAcceptPrivacy={onAccept}
      onOpenDocument={onOpenDocument}
    />
  );
}
