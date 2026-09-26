export const REQUEST_SHARE_REASONS = [
  "Shift Handoff",
  "Care Team",
  "Scheduler / Coordination",
  "Other",
] as const;

export type RequestShareReason = (typeof REQUEST_SHARE_REASONS)[number];

export function isRequestShareReason(value: string): value is RequestShareReason {
  return (REQUEST_SHARE_REASONS as readonly string[]).includes(value);
}

export type ProviderRequestShare = {
  id: string;
  userId: string;
  reason: string;
  createdAt: Date;
  requestAccess: boolean;
  phiAccess: boolean;
  revokedAt: Date | null;
  sharedBy: { id: string; name: string };
  user: {
    id: string;
    name: string;
    role: string;
    accountState: string;
    providerInfo: {
      organizationId: string | null;
      accountStatus: string;
    } | null;
  };
};

export type ProviderRequestShareContext = {
  provider?: { providerInfo?: { organizationId: string | null } | null } | null;
  shares: ProviderRequestShare[];
};

/** Sharing grants request access only while both users remain verified members of the same organization. PHI is a separate flag and is never implied. */
export function activeVerifiedProviderShares<T extends ProviderRequestShare>(
  request: ProviderRequestShareContext & { shares: T[] }
): T[] {
  const ownerOrganizationId = request.provider?.providerInfo?.organizationId;
  if (!ownerOrganizationId) return [];

  return request.shares.filter((share): share is T =>
    !share.revokedAt &&
    share.requestAccess &&
    share.user.role === "PROVIDER" &&
    share.user.accountState === "VERIFIED" &&
    share.user.providerInfo?.accountStatus === "ACTIVE" &&
    share.user.providerInfo.organizationId === ownerOrganizationId
  );
}

export function isSharedWithActiveProvider(
  shares: ProviderRequestShare[],
  userId: string
): boolean {
  return shares.some((share) => share.userId === userId && !share.revokedAt && share.requestAccess);
}

export function sharedWithProviderWhere(userId: string, organizationId: string) {
  return {
    provider: { providerInfo: { is: { organizationId } } },
    shares: {
      some: {
        userId,
        revokedAt: null,
        requestAccess: true,
      },
    },
  };
}

export type PublicRequestActivity = {
  id: string;
  at: string;
  label: string;
};

type ActivityShare = {
  id: string;
  userId: string;
  reason: string;
  user?: { name?: string | null } | null;
  sharedBy?: { name?: string | null } | null;
};

type ActivityEvent = {
  id: string;
  eventType: string;
  createdAt: Date | string;
  targetUserId?: string | null;
  metadata?: unknown;
  actor?: { name?: string | null } | null;
};

type ActivityStatus = {
  id?: string;
  status: string;
  createdAt: Date | string;
};

const STATUS_ACTIVITY: Record<string, string> = {
  EN_ROUTE: "Rep on the way",
  ARRIVED: "Rep arrived",
  COMPLETED: "Completed",
  CANCELLED: "Request cancelled",
  DECLINED: "Request declined",
};

function isoTime(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function metadataReason(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("reason" in metadata)) return null;
  const reason = (metadata as { reason?: unknown }).reason;
  return typeof reason === "string" && isRequestShareReason(reason) ? reason : null;
}

function shareForEvent(event: ActivityEvent, shares: ActivityShare[]) {
  const shareId = event.metadata && typeof event.metadata === "object" && "shareId" in event.metadata
    ? (event.metadata as { shareId?: unknown }).shareId
    : null;
  return shares.find((share) => share.id === shareId || (event.targetUserId && share.userId === event.targetUserId));
}

export function publicRequestActivity(
  source: {
    routingEvents?: ActivityEvent[];
    statusLogs?: ActivityStatus[];
    shares?: ActivityShare[];
    provider?: { name?: string | null } | null;
  },
  options?: { includePhiEvents?: boolean }
): PublicRequestActivity[] {
  const shares = source.shares ?? [];
  const items: PublicRequestActivity[] = [];

  for (const event of source.routingEvents ?? []) {
    if (event.eventType === "HANDOFF_CREATED" || event.eventType === "PHI_ACCESSED") continue;
    if (event.eventType === "PHI_VIEWED" && !options?.includePhiEvents) continue;

    const actor = event.actor?.name?.trim() || "A coworker";
    const share = shareForEvent(event, shares);
    const target = share?.user?.name?.trim() || "a coworker";
    const reason = share && isRequestShareReason(share.reason) ? share.reason : metadataReason(event.metadata);
    let label: string | null = null;

    switch (event.eventType) {
      case "REQUEST_CREATED":
        label = `${event.actor?.name?.trim() || source.provider?.name?.trim() || "A coworker"} created request`;
        break;
      case "REP_NOTIFIED":
        label = "Rep notified";
        break;
      case "REP_AUTO_ASSIGNED":
      case "ADMIN_REASSIGNED":
        label = "Rep assigned";
        break;
      case "REP_ACKNOWLEDGED":
        label = "Rep opened the request";
        break;
      case "REP_ACCEPTED":
        label = "Rep accepted";
        break;
      case "REP_FORWARDED":
        label = "Request forwarded";
        break;
      case "REP_DECLINED":
        label = "Rep declined";
        break;
      case "ESCALATED_TO_MANAGER":
        label = "Escalated to a manager";
        break;
      case "REQUEST_REROUTED":
        label = "Request rerouted";
        break;
      case "REQUEST_SHARED":
        label = `${share?.sharedBy?.name?.trim() || actor} shared request with ${target}${reason ? ` · Reason: ${reason}` : ""}`;
        break;
      case "REQUEST_UNSHARED":
        label = "Request access removed";
        break;
      case "SHARED_USER_OPENED_REQUEST":
        label = `${actor} opened request`;
        break;
      case "PHI_VIEWED":
        label = "Patient details viewed";
        break;
      default:
        label = null;
    }

    if (!label) continue;
    items.push({ id: event.id, at: isoTime(event.createdAt), label });
  }

  for (const status of source.statusLogs ?? []) {
    const label = STATUS_ACTIVITY[status.status];
    if (!label) continue;
    items.push({
      id: status.id ?? `${status.status}-${isoTime(status.createdAt)}`,
      at: isoTime(status.createdAt),
      label,
    });
  }

  return items
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-40);
}
