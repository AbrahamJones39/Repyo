import { db } from "@/lib/db";
import { provisionDirectoryUser } from "@/lib/verification/provision";
import { findSsoTenantById, oidcMetadata } from "@/lib/verification/sso";
import { generateSecretToken, hashSecret } from "@/lib/verification/tokens";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function appOrigin(request: Request) {
  return (process.env.NEXTAUTH_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expected = cookieStore.get("sso_state")?.value;
  const tenantCookie = cookieStore.get("sso_tenant")?.value ?? "";
  const [kind, id] = tenantCookie.split(":");

  if (!code || !state || state !== expected || (kind !== "company" && kind !== "organization") || !id) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }

  const tenant = await findSsoTenantById(kind, id);
  if (!tenant) return NextResponse.redirect(new URL("/login?error=sso", request.url));

  try {
    const metadata = await oidcMetadata(tenant.issuer);
    const redirectUri = `${appOrigin(request)}/api/auth/sso/callback`;
    const tokenResponse = await fetch(metadata.token_endpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: tenant.clientId,
        client_secret: tenant.clientSecret,
      }),
    });
    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=sso", request.url));
    }
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token || !metadata.userinfo_endpoint) {
      return NextResponse.redirect(new URL("/login?error=sso", request.url));
    }

    const profileResponse = await fetch(metadata.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) {
      return NextResponse.redirect(new URL("/login?error=sso", request.url));
    }
    const profile = (await profileResponse.json()) as {
      email?: string;
      name?: string;
      sub?: string;
    };
    const email = profile.email?.trim().toLowerCase();
    if (!email) return NextResponse.redirect(new URL("/login?error=sso", request.url));

    const user = await provisionDirectoryUser({
      tenant: { kind: tenant.kind, id: tenant.id, name: tenant.name },
      email,
      name: profile.name || email,
      externalId: profile.sub ?? null,
      source: "SSO_PROVISIONING",
      method: "SSO",
    });
    if (!user) return NextResponse.redirect(new URL("/login?error=sso", request.url));

    const rawTicket = generateSecretToken();
    await db.authTicket.create({
      data: {
        tokenHash: hashSecret(rawTicket),
        userId: user.id,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });

    const destination = new URL("/login", request.url);
    destination.searchParams.set("ssoTicket", rawTicket);
    destination.searchParams.set("email", email);
    const response = NextResponse.redirect(destination);
    response.cookies.delete("sso_state");
    response.cookies.delete("sso_tenant");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }
}
