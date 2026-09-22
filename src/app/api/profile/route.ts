import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateOwnProfileSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import type { Prisma, Role } from "@prisma/client";
import { syncProductGrants } from "@/lib/authorization/scope-grants";

const profileSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  accountState: true,
  zipCodeStart: true,
  zipCodeEnd: true,
  adminPermissions: true,
  company: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, role: true } },
  homeOrgUnit: { select: { id: true, name: true, typeLabel: true } },
  orgAssignments: {
    select: {
      permissions: true,
      orgUnit: { select: { id: true, name: true, typeLabel: true } },
    },
  },
  repProfile: {
    select: {
      status: true,
      products: true,
      credentialStatus: true,
      onCallEnabled: true,
      travelRadiusMiles: true,
      territories: {
        select: { state: true, county: true, zipCode: true },
      },
    },
  },
  providerInfo: {
    select: {
      jobTitle: true,
      department: true,
      facilityName: true,
      facilityAddress: true,
      facilityPhone: true,
      facilityContactName: true,
      facilityContactPhone: true,
      zipCode: true,
      requesterPhone: true,
      requesterFax: true,
      defaultPhysician: true,
      accountStatus: true,
      workEmail: true,
      isOrgAdministrator: true,
      organization: { select: { id: true, name: true } },
      orgFacility: {
        select: { id: true, name: true, department: true, address: true },
      },
    },
  },
  providerSiteMemberships: {
    select: {
      jobTitle: true,
      department: true,
      isPrimary: true,
      site: {
        select: {
          name: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
    },
    orderBy: { isPrimary: "desc" as const },
  },
} satisfies Prisma.UserSelect;

async function loadOwnProfile(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await loadOwnProfile(session.user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    console.error("GET /api/profile error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateOwnProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const userId = session.user.id;
    const role = session.user.role as Role;

    const userData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) userData.name = data.name.trim();
    if (data.phone !== undefined) userData.phone = data.phone;

    if (role === "COMPANY_ADMIN") {
      if (data.zipCodeStart !== undefined) userData.zipCodeStart = data.zipCodeStart;
      if (data.zipCodeEnd !== undefined) userData.zipCodeEnd = data.zipCodeEnd;
    }

    if (Object.keys(userData).length > 0) {
      await db.user.update({ where: { id: userId }, data: userData });
    }

    if (role === "REP") {
      const repData: Prisma.RepProfileUpdateInput = {};
      if (data.status !== undefined) repData.status = data.status;
      if (data.onCallEnabled !== undefined) repData.onCallEnabled = data.onCallEnabled;
      if (data.products !== undefined) repData.products = data.products;

      if (Object.keys(repData).length > 0) {
        await db.repProfile.upsert({
          where: { userId },
          create: {
            userId,
            status: data.status ?? "OFF_DUTY",
            onCallEnabled: data.onCallEnabled ?? false,
            products: data.products ?? [],
            companies: [],
          },
          update: repData,
        });
        if (data.products !== undefined && session.user.companyId) {
          await syncProductGrants({
            userId,
            companyId: session.user.companyId,
            products: data.products,
            grantedById: userId,
            ownerLabel: session.user.name,
          });
        }
      }
    }

    if (role === "PROVIDER") {
      const providerData: Prisma.ProviderProfileUpdateInput = {};
      if (data.jobTitle !== undefined) providerData.jobTitle = data.jobTitle;
      if (data.department !== undefined) providerData.department = data.department;
      if (data.facilityName !== undefined) providerData.facilityName = data.facilityName;
      if (data.facilityAddress !== undefined) {
        providerData.facilityAddress = data.facilityAddress;
      }
      if (data.facilityPhone !== undefined) providerData.facilityPhone = data.facilityPhone;
      if (data.facilityContactName !== undefined) {
        providerData.facilityContactName = data.facilityContactName;
      }
      if (data.facilityContactPhone !== undefined) {
        providerData.facilityContactPhone = data.facilityContactPhone;
      }
      if (data.zipCode !== undefined) providerData.zipCode = data.zipCode;
      if (data.requesterPhone !== undefined) {
        providerData.requesterPhone = data.requesterPhone;
      } else if (data.phone !== undefined) {
        providerData.requesterPhone = data.phone;
      }
      if (data.requesterFax !== undefined) providerData.requesterFax = data.requesterFax;
      if (data.defaultPhysician !== undefined) {
        providerData.defaultPhysician = data.defaultPhysician;
      }

      if (Object.keys(providerData).length > 0) {
        const existing = await db.providerProfile.findUnique({
          where: { userId },
          select: { userId: true },
        });
        if (existing) {
          await db.providerProfile.update({
            where: { userId },
            data: providerData,
          });
        }
      }
    }

    const profile = await loadOwnProfile(userId);
    return NextResponse.json(profile);
  } catch (error) {
    console.error("PATCH /api/profile error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
