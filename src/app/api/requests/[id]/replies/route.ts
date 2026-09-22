import { getDelegatedAdminIdsForRep } from "@/lib/admin-matching";
import { db } from "@/lib/db";
import { createRequestReply, listRequestReplies } from "@/lib/request-replies";
import {
  canAccessRequestRecord,
  type SessionUser,
} from "@/lib/security/authorization";
import { checkRequestAccessible } from "@/lib/security/kill-switch";
import { isAuthError, requireAuth } from "@/lib/security/require-auth";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function loadAccessibleRequest(user: SessionUser, requestId: string) {
  const accessible = await checkRequestAccessible(requestId);
  if (!accessible) return { error: NextResponse.json({ error: "Request unavailable" }, { status: 403 }) };

  const serviceRequest = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      providerId: true,
      assignedRepId: true,
      assignedAdminId: true,
      initiatedByRepId: true,
      escalatedToId: true,
      companyId: true,
    },
  });

  if (!serviceRequest) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const delegatedAdminIds =
    user.role === "REP" ? await getDelegatedAdminIdsForRep(user.id) : [];
  const scopedRepIds =
    user.role === "COMPANY_ADMIN"
      ? await (await import("@/lib/org-scope")).getScopedRepIds(user)
      : [];

  if (
    !canAccessRequestRecord(user, serviceRequest, {
      delegatedAdminIds,
      scopedRepIds,
    })
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { serviceRequest };
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { id } = await context.params;
  const loaded = await loadAccessibleRequest(authResult.user, id);
  if ("error" in loaded && loaded.error) return loaded.error;

  const replies = await listRequestReplies(id);
  return NextResponse.json(replies);
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { id } = await context.params;
  const loaded = await loadAccessibleRequest(authResult.user, id);
  if ("error" in loaded && loaded.error) return loaded.error;
  const serviceRequest = loaded.serviceRequest!;

  const body = await request.json();
  try {
    const reply = await createRequestReply({
      requestId: id,
      authorId: authResult.user.id,
      body: String(body.body ?? ""),
      participants: [
        serviceRequest.providerId,
        serviceRequest.assignedRepId,
        serviceRequest.assignedAdminId,
        serviceRequest.initiatedByRepId,
        serviceRequest.escalatedToId,
      ],
    });
    return NextResponse.json(reply, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send note" },
      { status: 400 }
    );
  }
}
