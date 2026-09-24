import { db } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/security/require-auth";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

/** Operational preview for the buzzing screen. No patient or device identifiers. */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const user = authResult.user;

  const { id } = await context.params;
  const request = await db.serviceRequest.findUnique({
    where: { id },
    select: {
      facilityName: true,
      scheduledAt: true,
      assignedRepId: true,
      assignedAdminId: true,
      escalatedToId: true,
      acknowledgedAt: true,
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assigneeId = request.assignedRepId ?? request.assignedAdminId;
  if (assigneeId !== user.id && request.escalatedToId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    facilityName: request.facilityName,
    scheduledAt: request.scheduledAt,
    summary: "Device support requested",
    acknowledged: Boolean(request.acknowledgedAt),
  });
}
