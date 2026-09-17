import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type {
  PhiAccessType,
  PermissionChangeType,
  RoutingEventType,
  Role,
} from "@prisma/client";

/** Audit metadata must never contain PHI — use IDs and enums only. */
export async function logRoutingEvent(params: {
  requestId: string;
  eventType: RoutingEventType;
  actorId?: string | null;
  actorRole?: Role | null;
  organizationId?: string | null;
  companyId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.requestRoutingEvent.create({
    data: {
      requestId: params.requestId,
      eventType: params.eventType,
      actorId: params.actorId ?? null,
      actorRole: params.actorRole ?? null,
      organizationId: params.organizationId ?? null,
      companyId: params.companyId ?? null,
      targetUserId: params.targetUserId ?? null,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function logPhiAccess(params: {
  requestId?: string | null;
  userId: string;
  userRole: Role;
  accessType: PhiAccessType;
  organizationId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.phiAccessLog.create({
    data: {
      requestId: params.requestId ?? null,
      userId: params.userId,
      userRole: params.userRole,
      accessType: params.accessType,
      organizationId: params.organizationId ?? null,
      companyId: params.companyId ?? null,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function logPermissionChange(params: {
  targetUserId: string;
  changedById: string;
  changeType: PermissionChangeType;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  reason?: string;
}) {
  await db.permissionChangeLog.create({
    data: {
      targetUserId: params.targetUserId,
      changedById: params.changedById,
      changeType: params.changeType,
      beforeState: params.beforeState as Prisma.InputJsonValue,
      afterState: params.afterState as Prisma.InputJsonValue,
      reason: params.reason,
    },
  });
}

/** Safe status log notes — never include patient/device identifiers. */
export function safeStatusNote(note: string): string {
  return note
    .replace(/\b(?:patient|mrn|dob|serial)\b/gi, "[redacted]")
    .slice(0, 500);
}

export const GENERIC_NOTIFICATION = {
  newRequest: {
    title: "New rep request",
    body: "A new request is available. Open GoRepYo to view details.",
  },
  assigned: {
    title: "Request assigned to you",
    body: "You have a new assignment. Open GoRepYo to view details.",
  },
  statusUpdate: {
    title: "Request status updated",
    body: "A request you are following has been updated. Open GoRepYo for details.",
  },
  repAcknowledged: {
    title: "Rep has seen assignment",
    body: "An assigned rep opened a request you routed. Open GoRepYo to view details.",
  },
  escalated: {
    title: "Request escalated to you",
    body: "A request was missed and routed to you as the designated manager. Open GoRepYo to reassign or respond.",
  },
} as const;
