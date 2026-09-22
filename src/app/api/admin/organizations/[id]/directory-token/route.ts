import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSecretToken, hashSecret } from "@/lib/verification/tokens";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await request.json();
  const kind = body.kind === "scim" ? "scim" : body.kind === "directory" ? "directory" : null;
  if (!kind) return NextResponse.json({ error: "kind must be scim or directory" }, { status: 400 });

  const token = generateSecretToken();
  await db.providerOrganization.update({
    where: { id },
    data:
      kind === "scim"
        ? { scimTokenHash: hashSecret(token), scimEnabled: true }
        : { directoryTokenHash: hashSecret(token) },
  });

  return NextResponse.json({
    token,
    endpoint: kind === "scim" ? "/api/scim/v2/Users" : "/api/directory/sync",
  });
}
