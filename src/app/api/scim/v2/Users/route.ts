import { db } from "@/lib/db";
import { tenantFromBearer } from "@/lib/verification/tenant-token";
import { provisionDirectoryUser } from "@/lib/verification/provision";
import { NextResponse } from "next/server";

function scimError(detail: string, status: number) {
  return NextResponse.json(
    { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail, status },
    { status }
  );
}

export async function POST(request: Request) {
  const tenant = await tenantFromBearer(request, "scim");
  if (!tenant) return scimError("Invalid SCIM token", 401);

  const body = await request.json();
  const email = String(body.userName ?? body.emails?.[0]?.value ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) return scimError("userName email is required", 400);

  const name =
    body.name?.formatted ||
    [body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ") ||
    body.displayName ||
    email;

  try {
    const user = await provisionDirectoryUser({
      tenant,
      email,
      name,
      externalId: body.externalId ?? null,
      active: body.active !== false,
      source: "SCIM_PROVISIONING",
      method: "SCIM",
    });
    return NextResponse.json(
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user?.id,
        userName: email,
        active: body.active !== false,
        name: { formatted: name },
      },
      { status: 201 }
    );
  } catch (error) {
    return scimError(error instanceof Error ? error.message : "Provisioning failed", 409);
  }
}

export async function GET(request: Request) {
  const tenant = await tenantFromBearer(request, "scim");
  if (!tenant) return scimError("Invalid SCIM token", 401);

  const filter = new URL(request.url).searchParams.get("filter") ?? "";
  const match = filter.match(/userName\s+eq\s+"([^"]+)"/i);
  if (!match) {
    return NextResponse.json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 0,
      Resources: [],
    });
  }

  const user = await db.user.findFirst({
    where: {
      email: match[1].toLowerCase(),
      ...(tenant.kind === "company"
        ? { companyId: tenant.id }
        : { providerInfo: { organizationId: tenant.id } }),
    },
    select: { id: true, email: true, name: true, disabledAt: true },
  });

  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: user ? 1 : 0,
    Resources: user
      ? [
          {
            id: user.id,
            userName: user.email,
            name: { formatted: user.name },
            active: !user.disabledAt,
          },
        ]
      : [],
  });
}
