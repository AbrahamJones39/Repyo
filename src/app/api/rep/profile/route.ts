import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  updateRepProfileSchema,
  updateRepStatusSchema,
  updateRepLocationSchema,
} from "@/lib/validations";
import { NextResponse } from "next/server";
import { syncProductGrants } from "@/lib/authorization/scope-grants";

async function getOrCreateProfile(userId: string) {
  let profile = await db.repProfile.findUnique({
    where: { userId },
    include: {
      territories: { include: { facility: true } },
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          company: { select: { name: true, onCallDndOverrideEnabled: true } },
        },
      },
    },
  });

  if (!profile) {
    await db.repProfile.create({
      data: { userId, products: [], companies: [] },
    });
    profile = await db.repProfile.findUnique({
      where: { userId },
      include: {
        territories: { include: { facility: true } },
        user: {
        select: {
          name: true,
          email: true,
          phone: true,
          company: { select: { name: true, onCallDndOverrideEnabled: true } },
        },
      },
      },
    });
  }

  return profile;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "REP") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getOrCreateProfile(session.user.id);
    return NextResponse.json(profile);
  } catch (error) {
    console.error("GET /api/rep/profile error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "REP") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await getOrCreateProfile(session.user.id);

    const body = await request.json();

    if (body.lat != null && body.lng != null && Object.keys(body).length === 2) {
      const parsed = updateRepLocationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      }
      const updated = await db.repProfile.update({
        where: { userId: session.user.id },
        data: { lat: parsed.data.lat, lng: parsed.data.lng },
      });
      return NextResponse.json(updated);
    }

    const profileParsed = updateRepProfileSchema.safeParse(body);
    if (profileParsed.success) {
      const {
        status,
        onCallEnabled,
        dndOverrideOptIn,
        travelRadiusMiles,
        maxTravelDistance,
        products,
        lat,
        lng,
      } = profileParsed.data;

      const company = session.user.companyId
        ? await db.company.findUnique({
            where: { id: session.user.companyId },
            select: { onCallDndOverrideEnabled: true },
          })
        : null;
      if (dndOverrideOptIn && !company?.onCallDndOverrideEnabled) {
        return NextResponse.json(
          { error: "Your company has not enabled an on-call Do Not Disturb override" },
          { status: 400 }
        );
      }

      const updated = await db.repProfile.update({
        where: { userId: session.user.id },
        data: {
          ...(status && { status }),
          ...(onCallEnabled != null && { onCallEnabled }),
          ...(dndOverrideOptIn != null && { dndOverrideOptIn }),
          ...(travelRadiusMiles != null && { travelRadiusMiles }),
          ...(maxTravelDistance != null && { maxTravelDistance }),
          ...(products && { products }),
          ...(lat != null && { lat }),
          ...(lng != null && { lng }),
        },
      });
      if (products && session.user.companyId) {
        await syncProductGrants({
          userId: session.user.id,
          companyId: session.user.companyId,
          products,
          grantedById: session.user.id,
          ownerLabel: session.user.name,
        });
      }
      return NextResponse.json(updated);
    }

    const statusParsed = updateRepStatusSchema.safeParse(body);
    if (!statusParsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const updated = await db.repProfile.update({
      where: { userId: session.user.id },
      data: {
        status: statusParsed.data.status,
        ...(statusParsed.data.lat != null && { lat: statusParsed.data.lat }),
        ...(statusParsed.data.lng != null && { lng: statusParsed.data.lng }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/rep/profile error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
