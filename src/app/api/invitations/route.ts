import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createInvitation,
  InvitationRateLimitError,
} from "@/lib/invitations/service";
import type { InvitationChannel, InvitationType, Role } from "@prisma/client";
import { NextResponse } from "next/server";

async function getInviterContext(userId: string, role: Role) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      providerInfo: { select: { organizationId: true, isOrgAdministrator: true } },
      teamMemberships: { select: { teamId: true } },
    },
  });
  return user;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invitations = await db.platformInvitation.findMany({
    where: { invitedById: session.user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      token: true,
      inviteeEmail: true,
      targetRole: true,
      channel: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      organization: { select: { name: true } },
      company: { select: { name: true } },
    },
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";

  return NextResponse.json(
    invitations.map((inv) => ({
      ...inv,
      inviteUrl: `${base.replace(/\/$/, "")}/invite/${inv.token}`,
      token: undefined,
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const inviteeEmail = body.inviteeEmail?.trim() || null;
  const channel = (body.channel ?? "LINK") as InvitationChannel;

  if (!["EMAIL", "LINK", "QR"].includes(channel)) {
    return NextResponse.json({ error: "Invalid invitation channel" }, { status: 400 });
  }

  if (!inviteeEmail && channel !== "LINK" && channel !== "QR") {
    return NextResponse.json(
      { error: "Email required for this invitation type" },
      { status: 400 }
    );
  }

  const inviter = await getInviterContext(session.user.id, session.user.role);
  if (!inviter) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let targetRole = (body.targetRole ?? session.user.role) as Role;
  let organizationId: string | null = body.organizationId ?? null;
  let companyId: string | null = body.companyId ?? session.user.companyId ?? null;
  let teamId: string | null = body.teamId ?? null;
  let orgUnitId: string | null = body.orgUnitId ?? null;
  let managerId: string | null = body.managerId ?? null;
  let healthcareSiteId: string | null = body.healthcareSiteId ?? null;
  let invitationType: InvitationType = "PEER";

  if (session.user.role === "PROVIDER") {
    targetRole = "PROVIDER";
    organizationId =
      organizationId ?? inviter.providerInfo?.organizationId ?? null;
    invitationType = inviter.providerInfo?.isOrgAdministrator
      ? "ORG_ADMIN"
      : "PEER";
    if (body.targetRole && body.targetRole !== "PROVIDER") {
      return NextResponse.json(
        { error: "Providers may only invite other providers" },
        { status: 403 }
      );
    }
  } else if (session.user.role === "REP") {
    targetRole = body.targetRole === "COMPANY_ADMIN" ? "COMPANY_ADMIN" : "REP";
    if (!["REP", "COMPANY_ADMIN"].includes(targetRole)) {
      return NextResponse.json({ error: "Invalid invite role" }, { status: 400 });
    }
    teamId = teamId ?? inviter.teamMemberships[0]?.teamId ?? null;
    if (targetRole === "REP") {
      managerId = managerId ?? session.user.id;
    }
  } else if (session.user.role === "COMPANY_ADMIN") {
    invitationType = "ADMIN";
    if (!["REP", "COMPANY_ADMIN"].includes(targetRole)) {
      targetRole = "REP";
    }
    if (targetRole === "REP") {
      managerId = managerId ?? session.user.id;
    }
    if (targetRole === "COMPANY_ADMIN") {
      orgUnitId = orgUnitId ?? inviter.orgUnitId ?? null;
      if (!orgUnitId) {
        return NextResponse.json(
          { error: "Assign the Admin to an organizational unit" },
          { status: 400 }
        );
      }
    }
  } else if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const invitation = await createInvitation({
      invitedById: session.user.id,
      inviterRole: session.user.role,
      inviteeEmail,
      targetRole,
      invitationType,
      channel,
      organizationId,
      companyId,
      teamId,
      orgUnitId,
      managerId,
      healthcareSiteId,
      territoryContext: body.territoryContext,
      expiryDays: body.expiryDays,
      adminPermissions: Array.isArray(body.permissions) ? body.permissions : undefined,
    });

    return NextResponse.json(
      {
        id: invitation.id,
        inviteUrl: invitation.inviteUrl,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
        channel,
        deliveryNote:
          channel === "EMAIL"
            ? "Share this link with your colleague."
            : null,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof InvitationRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
