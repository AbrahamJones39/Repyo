import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSecretToken, hashSecret } from "@/lib/verification/tokens";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "COMPANY_ADMIN" || !session.user.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const kind = body.kind === "scim" ? "scim" : body.kind === "directory" ? "directory" : null;
  if (!kind) return NextResponse.json({ error: "kind must be scim or directory" }, { status: 400 });

  const token = generateSecretToken();
  await db.company.update({
    where: { id: session.user.companyId },
    data:
      kind === "scim"
        ? { scimTokenHash: hashSecret(token), scimEnabled: true }
        : { directoryTokenHash: hashSecret(token) },
  });

  return NextResponse.json({
    token,
    endpoint:
      kind === "scim" ? "/api/scim/v2/Users" : "/api/directory/sync",
  });
}
