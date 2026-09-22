import { findSsoTenantByEmail, oidcMetadata } from "@/lib/verification/sso";
import { generateSecretToken } from "@/lib/verification/tokens";
import { NextResponse } from "next/server";

function appOrigin(request: Request) {
  return (process.env.NEXTAUTH_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }

  const tenant = await findSsoTenantByEmail(email);
  if (!tenant) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }

  try {
    const metadata = await oidcMetadata(tenant.issuer);
    const state = generateSecretToken();
    const redirectUri = `${appOrigin(request)}/api/auth/sso/callback`;
    const authorize = new URL(metadata.authorization_endpoint!);
    authorize.searchParams.set("client_id", tenant.clientId);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "openid email profile");
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("login_hint", email);

    const response = NextResponse.redirect(authorize);
    const cookie = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    };
    response.cookies.set("sso_state", state, cookie);
    response.cookies.set("sso_tenant", `${tenant.kind}:${tenant.id}`, cookie);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }
}
