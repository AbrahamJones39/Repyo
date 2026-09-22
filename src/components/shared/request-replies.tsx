"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api-client";
import type { Role } from "@prisma/client";
import { MessageSquare } from "lucide-react";

const REPLY_MAX_LENGTH = 400;

export type RequestReply = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: Role };
};

const ROLE_LABEL: Record<Role, string> = {
  PROVIDER: "Provider",
  REP: "Rep",
  COMPANY_ADMIN: "Admin",
  SUPER_ADMIN: "Admin",
};

export function RequestReplies({
  requestId,
  replies,
  currentUserId,
  onPosted,
}: {
  requestId: string;
  replies: RequestReply[];
  currentUserId?: string;
  onPosted?: (reply: RequestReply) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? replies : replies.slice(-3);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const reply = await fetchJson<RequestReply>(
        `/api/requests/${requestId}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: draft }),
        }
      );
      setDraft("");
      onPosted?.(reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send note");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
        <MessageSquare className="h-3.5 w-3.5 text-rose-500" />
        Notes
        {replies.length > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
            {replies.length}
          </span>
        )}
      </div>

      {replies.length === 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          Leave a short note if this request needs a correction or
          clarification.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {replies.length > 3 && !showAll && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs font-medium text-rose-700 hover:underline"
              >
                Show earlier notes ({replies.length - 3})
              </button>
            </li>
          )}
          {visible.map((reply) => {
            const mine = currentUserId && reply.author.id === currentUserId;
            return (
              <li
                key={reply.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  mine ? "bg-rose-50" : "bg-white"
                }`}
              >
                <p className="text-[11px] font-medium text-slate-500">
                  {reply.author.name}
                  <span className="mx-1 text-slate-300">·</span>
                  {ROLE_LABEL[reply.author.role]}
                  <span className="mx-1 text-slate-300">·</span>
                  {format(new Date(reply.createdAt), "MMM d, h:mm a")}
                </p>
                <p className="mt-0.5 text-slate-800">{reply.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <textarea
        id={`${requestId}-reply`}
        value={draft}
        maxLength={REPLY_MAX_LENGTH}
        rows={2}
        placeholder="Reply with a short note…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          For scheduling and coverage only. Skip extra patient details.
        </p>
        <Button size="sm" onClick={send} disabled={sending || !draft.trim()}>
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
