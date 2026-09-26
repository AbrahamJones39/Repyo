import { db } from "@/lib/db";
import { isRequestShareReason } from "@/lib/request-shares";
import { realtimeBus } from "@/lib/routing-engine";
import { GENERIC_NOTIFICATION } from "@/lib/security/audit";
import { getProviderOrgContext } from "@/lib/security/sanitize-request";
import { isAuthError, requireAuth } from "@/lib/security/require-auth";
import { checkRequestAccessible } from "@/lib/security/kill-switch";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnedRequest(userId: string, id: string) {
  return db.serviceRequest.findFirst({
    where: { id, providerId: userId },
    select: { id: true, providerId: true, companyId: true },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const user = authResult.user;
  if (user.role !== "PROVIDER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const owned = await loadOwnedRequest(user.id, id);
  if (!owned) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (user.accountState !== "VERIFIED" || !await checkRequestAccessible(id)) return NextResponse.json({ error: "Request sharing is unavailable" }, { status: 403 });
  const actorProfile = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { organizationId: true, accountStatus: true } });
  if (!actorProfile?.organizationId || actorProfile.accountStatus !== "ACTIVE") return NextResponse.json({ error: "Your organization access is not active" }, { status: 403 });

  const url = new URL(request.url);
  if (url.searchParams.has("q")) {
    const organizationId = actorProfile.organizationId;
    const query = url.searchParams.get("q")?.trim() ?? "";
    const people = await db.user.findMany({
      where: {
        role: "PROVIDER",
        id: { not: user.id },
        accountState: "VERIFIED",
        AND: [
          { providerInfo: { is: { organizationId, accountStatus: "ACTIVE" } } },
          ...(query ? [{
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { providerInfo: { is: { jobTitle: { contains: query, mode: "insensitive" as const } } } },
              { providerInfo: { is: { facilityName: { contains: query, mode: "insensitive" as const } } } },
              { providerInfo: { is: { department: { contains: query, mode: "insensitive" as const } } } },
              { providerSiteMemberships: { some: { organizationId, site: { name: { contains: query, mode: "insensitive" as const } } } } },
              { providerSiteMemberships: { some: { organizationId, department: { contains: query, mode: "insensitive" as const } } } },
            ],
          }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        providerInfo: { select: { jobTitle: true, facilityName: true, department: true } },
        providerSiteMemberships: {
          where: { organizationId },
          select: { department: true, site: { select: { name: true } } },
          orderBy: { isPrimary: "desc" },
        },
      },
      orderBy: { name: "asc" },
      take: 20,
    });
    return NextResponse.json({ people });
  }

  const shares = await db.requestShare.findMany({
    where: {
      requestId: id,
      revokedAt: null,
      requestAccess: true,
      user: {
        role: "PROVIDER",
        accountState: "VERIFIED",
        providerInfo: { is: { organizationId: actorProfile.organizationId, accountStatus: "ACTIVE" } },
      },
    },
    include: {
      user: { select: { id: true, name: true, role: true, providerInfo: { select: { jobTitle: true, facilityName: true, department: true } }, providerSiteMemberships: { where: { organizationId: actorProfile.organizationId }, select: { department: true, site: { select: { name: true } } }, orderBy: { isPrimary: "desc" } } } },
      sharedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ shares });
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const user = authResult.user;
  if (user.role !== "PROVIDER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const owned = await loadOwnedRequest(user.id, id);
  if (!owned) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (user.accountState !== "VERIFIED" || !await checkRequestAccessible(id)) return NextResponse.json({ error: "Request sharing is unavailable" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  const reason = typeof body.reason === "string" && isRequestShareReason(body.reason) ? body.reason : "";
  if (!targetUserId || !reason) return NextResponse.json({ error: "Choose a verified coworker and reason" }, { status: 400 });

  const [sourceProfile, target] = await Promise.all([
    db.providerProfile.findUnique({ where: { userId: user.id }, select: { organizationId: true, accountStatus: true } }),
    db.user.findFirst({
      where: {
        id: targetUserId,
        role: "PROVIDER",
        accountState: "VERIFIED",
        providerInfo: { accountStatus: "ACTIVE" },
      },
      select: { id: true, providerInfo: { select: { organizationId: true } } },
    }),
  ]);
  if (!sourceProfile?.organizationId || sourceProfile.accountStatus !== "ACTIVE" || target?.providerInfo?.organizationId !== sourceProfile.organizationId) {
    return NextResponse.json({ error: "This person is not an active, verified user at your organization" }, { status: 403 });
  }

  const share = await db.$transaction(async (tx) => {
    const existing = await tx.requestShare.findFirst({ where: { requestId: id, userId: targetUserId, revokedAt: null }, select: { id: true } });
    if (existing) return null;
    const created = await tx.requestShare.create({
      data: { requestId: id, userId: targetUserId, sharedById: user.id, reason, requestAccess: true, phiAccess: false },
      include: { user: { select: { id: true, name: true, role: true, providerInfo: { select: { jobTitle: true, facilityName: true, department: true } }, providerSiteMemberships: { where: { organizationId: sourceProfile.organizationId }, select: { department: true, site: { select: { name: true } } }, orderBy: { isPrimary: "desc" } } } }, sharedBy: { select: { id: true, name: true } } },
    });
    await tx.requestRoutingEvent.create({
      data: {
        requestId: id,
        eventType: "REQUEST_SHARED",
        actorId: user.id,
        actorRole: user.role,
        organizationId: sourceProfile.organizationId,
        companyId: owned.companyId,
        targetUserId,
        metadata: { shareId: created.id, reason, requestAccess: true, phiAccess: false },
      },
    });
    if (reason === "Shift Handoff") {
      await tx.requestRoutingEvent.create({
        data: {
          requestId: id,
          eventType: "HANDOFF_CREATED",
          actorId: user.id,
          actorRole: user.role,
          organizationId: sourceProfile.organizationId,
          companyId: owned.companyId,
          targetUserId,
          metadata: { shareId: created.id, requestAccess: true, phiAccess: false },
        },
      });
    }
    await tx.notification.create({
      data: {
        userId: targetUserId,
        requestId: id,
        title: GENERIC_NOTIFICATION.requestShared.title,
        body: GENERIC_NOTIFICATION.requestShared.body,
        type: "REQUEST_SHARED",
        data: { requestId: id, shareId: created.id, reason, phiAccess: false },
      },
    });
    return created;
  });
  if (!share) return NextResponse.json({ error: "This person already has request access" }, { status: 409 });
  realtimeBus.emit("request:updated", { requestId: id });
  realtimeBus.emit(`user:${targetUserId}`, { type: "REQUEST_SHARED", requestId: id });
  return NextResponse.json({ share, permissions: { requestAccess: true, phiAccess: false } }, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const user = authResult.user;
  if (user.role !== "PROVIDER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const owned = await loadOwnedRequest(user.id, id);
  if (!owned) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (user.accountState !== "VERIFIED" || !await checkRequestAccessible(id)) return NextResponse.json({ error: "Request sharing is unavailable" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const shareId = typeof body.shareId === "string" ? body.shareId : "";
  const activeShare = await db.requestShare.findFirst({ where: { id: shareId, requestId: id, revokedAt: null }, select: { userId: true } });
  if (!activeShare) return NextResponse.json({ error: "Active share not found" }, { status: 404 });
  const changed = await db.$transaction(async (tx) => {
    const result = await tx.requestShare.updateMany({
      where: { id: shareId, requestId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return false;
    await tx.requestRoutingEvent.create({
      data: {
        requestId: id,
        eventType: "REQUEST_UNSHARED",
        actorId: user.id,
        actorRole: user.role,
        targetUserId: activeShare.userId,
        organizationId: await getProviderOrgContext(user.id),
        companyId: owned.companyId,
        metadata: { shareId, requestAccessRevoked: true, phiAccess: false },
      },
    });
    return true;
  });
  if (!changed) return NextResponse.json({ error: "Active share not found" }, { status: 404 });
  realtimeBus.emit("request:updated", { requestId: id });
  realtimeBus.emit(`user:${activeShare.userId}`, { type: "REQUEST_UNSHARED", requestId: id });
  return NextResponse.json({ ok: true });
}
