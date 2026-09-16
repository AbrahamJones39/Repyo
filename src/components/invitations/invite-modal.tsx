"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Copy, Check, Mail, Link2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InvitationChannel } from "@prisma/client";

type InviteResult = {
  id: string;
  inviteUrl: string;
  expiresAt: string;
  deliveryNote?: string | null;
};

const CHANNELS: { id: InvitationChannel; label: string; icon: typeof Mail }[] = [
  { id: "EMAIL", label: "Email", icon: Mail },
  { id: "LINK", label: "Link", icon: Link2 },
  { id: "QR", label: "QR code", icon: QrCode },
];

type InviteTargetRole = "REP" | "COMPANY_ADMIN";

export function InviteModal({
  onClose,
  targetRoleOptions,
}: {
  onClose: () => void;
  targetRoleOptions?: { value: InviteTargetRole; label: string }[];
}) {
  const [channel, setChannel] = useState<InvitationChannel>("LINK");
  const [targetRole, setTargetRole] = useState<InviteTargetRole>(
    targetRoleOptions?.[0]?.value ?? "REP"
  );
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<
    {
      id: string;
      inviteUrl: string;
      inviteeEmail: string | null;
      status: string;
      expiresAt: string;
    }[]
  >([]);
  const [orgUnits, setOrgUnits] = useState<
    { id: string; name: string; typeLabel: string; depth: number }[]
  >([]);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [orgUnitId, setOrgUnitId] = useState("");
  const [managerId, setManagerId] = useState("");

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/invitations");
      if (res.ok) {
        const data = await res.json();
        setRecent(
          Array.isArray(data)
            ? data.filter((inv) => inv.status === "PENDING")
            : []
        );
      }
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    loadRecent();
    if (targetRoleOptions) {
      fetch("/api/company/org-units")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setOrgUnits(data.flat ?? []);
          setPeople(data.people ?? []);
          if (data.flat?.[0]?.id) setOrgUnitId(data.flat[0].id);
        })
        .catch(() => undefined);
    }
  }, [loadRecent, targetRoleOptions]);

  async function createInvite() {
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          inviteeEmail: channel === "EMAIL" ? email : undefined,
          targetRole: targetRoleOptions ? targetRole : undefined,
          orgUnitId: orgUnitId || undefined,
          managerId: managerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create invitation");
        return;
      }
      setResult(data);
      loadRecent();
    } catch {
      setError("Failed to create invitation");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function revokeInvite(id: string) {
    setRecent((prev) => prev.filter((inv) => inv.id !== id));
    if (result?.id === id) setResult(null);

    const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to revoke invitation");
      loadRecent();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Invite to RepYo</h2>
            <p className="text-xs text-slate-500">
              Invitations never include patient information. Verification still applies after signup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setChannel(id);
                  setResult(null);
                  setError("");
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  channel === id
                    ? "bg-rose-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {targetRoleOptions && targetRoleOptions.length > 1 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Invite as</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as InviteTargetRole)}
              >
                {targetRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {targetRoleOptions && targetRole === "REP" && people.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Designated manager</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">Me (default)</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.role === "REP" ? "Rep" : "Admin"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {targetRoleOptions && orgUnits.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {targetRole === "COMPANY_ADMIN" ? "Admin organizational unit" : "Home unit (optional)"}
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={orgUnitId}
                onChange={(e) => setOrgUnitId(e.target.value)}
              >
                {targetRole !== "COMPANY_ADMIN" && <option value="">None</option>}
                {orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {"— ".repeat(unit.depth)}
                    {unit.name} ({unit.typeLabel})
                  </option>
                ))}
              </select>
            </label>
          )}

          {channel === "EMAIL" && (
            <Input
              label="Colleague's email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@hospital.org"
            />
          )}

          {(channel === "LINK" || channel === "QR") && (
            <p className="text-sm text-slate-600">
              Generate a single-use link{channel === "QR" ? " and QR code" : ""} you can share with a colleague.
            </p>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <Button
            onClick={createInvite}
            disabled={loading || (channel === "EMAIL" && !email.trim())}
            className="w-full"
          >
            {loading ? "Creating..." : "Create invitation"}
          </Button>

          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              {result.deliveryNote && (
                <p className="text-xs text-emerald-800">{result.deliveryNote}</p>
              )}
              <div className="flex gap-2">
                <input
                  readOnly
                  value={result.inviteUrl}
                  className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyLink(result.inviteUrl)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {channel === "QR" && (
                <div className="flex justify-center pt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(result.inviteUrl)}`}
                    alt="Invitation QR code"
                    width={180}
                    height={180}
                    className="rounded-lg border border-emerald-200 bg-white p-2"
                  />
                </div>
              )}
              <p className="text-xs text-emerald-700">
                Expires {new Date(result.expiresAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {recent.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your recent invitations
              </p>
              <ul className="space-y-2">
                {recent.slice(0, 5).map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">
                        {inv.inviteeEmail ?? "Shareable link"}
                      </p>
                      <p className="text-slate-500">
                        {inv.status} · expires{" "}
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyLink(inv.inviteUrl)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {inv.status === "PENDING" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => revokeInvite(inv.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
