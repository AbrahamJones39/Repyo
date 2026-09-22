import { provisionDirectoryUser, upsertDirectoryIdentity } from "@/lib/verification/provision";
import { tenantFromBearer } from "@/lib/verification/tenant-token";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const tenant = await tenantFromBearer(request, "directory");
  if (!tenant) {
    return NextResponse.json({ error: "Invalid directory token" }, { status: 401 });
  }

  const body = await request.json();
  const users = Array.isArray(body.users) ? body.users : [];
  if (users.length === 0) {
    return NextResponse.json({ error: "users is required" }, { status: 400 });
  }

  const provision = body.provision === true;
  let synced = 0;

  for (const entry of users) {
    const email = String(entry.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const name = String(entry.name ?? email);
    if (provision) {
      await provisionDirectoryUser({
        tenant,
        email,
        name,
        externalId: entry.externalId ?? null,
        active: entry.active !== false,
        source: "API_DIRECTORY",
        method: "API_DIRECTORY_VERIFICATION",
      });
    } else {
      await upsertDirectoryIdentity({
        tenant,
        email,
        name,
        externalId: entry.externalId ?? null,
        active: entry.active !== false,
        source: "API_DIRECTORY",
      });
    }
    synced += 1;
  }

  return NextResponse.json({ synced, provision });
}
