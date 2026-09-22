import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [organizations, accessRequests] = await Promise.all([
    db.providerOrganization.findMany({
      include: {
        facilities: true,
        _count: { select: { providers: true, accessRequests: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.organizationAccessRequest.groupBy({
      by: ["requestedOrgName"],
      where: { status: "PENDING" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  return NextResponse.json({
    organizations: organizations.map(
      ({ scimTokenHash, directoryTokenHash, ssoClientSecretEnc, ...org }) => ({
        ...org,
        scimTokenSet: Boolean(scimTokenHash),
        directoryTokenSet: Boolean(directoryTokenHash),
        ssoSecretSet: Boolean(ssoClientSecretEnc),
      })
    ),
    accessLeads: accessRequests.map((r) => ({
      organizationName: r.requestedOrgName,
      requestCount: r._count.id,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const org = await db.providerOrganization.create({
    data: {
      name,
      slug: `${slug}-${Date.now().toString(36)}`,
      status: "PENDING",
      complianceMode: "STANDARD",
      contactEmail: body.contactEmail?.trim() || null,
    },
  });

  return NextResponse.json(org, { status: 201 });
}
