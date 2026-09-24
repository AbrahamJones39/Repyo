import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logPhiAccess } from "@/lib/security/audit";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(notifications);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const ids = body.ids as string[];
  const delivered = Boolean(body.delivered);
  const requestId = typeof body.requestId === "string" ? body.requestId : null;

  const notifications = await db.notification.findMany({
    where: { id: { in: ids }, userId: session.user.id },
    select: { id: true, data: true },
  });

  await db.notification.updateMany({
    where: { id: { in: ids }, userId: session.user.id },
    data: delivered
      ? { deliveredAt: new Date(), deliveryStatus: "DELIVERED" }
      : { read: true },
  });

  if (delivered && requestId) {
    const { markCoverageDelivered } = await import("@/lib/coverage-alerts");
    await markCoverageDelivered({ requestId, userId: session.user.id });
  }

  for (const n of notifications) {
    const requestId =
      n.data && typeof n.data === "object" && "requestId" in n.data
        ? String((n.data as { requestId: string }).requestId)
        : null;
    if (requestId) {
      await logPhiAccess({
        requestId,
        userId: session.user.id,
        userRole: session.user.role,
        accessType: "NOTIFICATION_DELIVERED",
        metadata: { notificationId: n.id },
      });
    }
  }

  return NextResponse.json({ success: true });
}
