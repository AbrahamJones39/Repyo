import { createHmac, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isAccountActive } from "@/lib/security/authorization";
import { isKillSwitchActive } from "@/lib/security/kill-switch";
import type { Role, UserAccountState } from "@prisma/client";
import type { Session } from "next-auth";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

type MobileTokenPayload = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  accountState: UserAccountState;
  adminPermissions: string[];
  sessionVersion: number;
  iat: number;
  exp: number;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for mobile auth");
  }
  return secret;
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function signMobileToken(
  payload: Omit<MobileTokenPayload, "iat" | "exp">
) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body: MobileTokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const data = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(
    JSON.stringify(body)
  )}`;
  const signature = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
  return { token: `${data}.${signature}`, expiresAt: body.exp * 1000 };
}

function verifyMobileToken(token: string): MobileTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", getSecret())
    .update(`${header}.${payload}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as MobileTokenPayload;
    if (!parsed?.id || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function toMobileSession(payload: {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  accountState: UserAccountState;
  adminPermissions: string[];
  exp?: number;
}): Session {
  return {
    user: {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      companyId: payload.companyId,
      accountState: payload.accountState,
      adminPermissions: payload.adminPermissions,
    },
    expires: new Date((payload.exp ?? 0) * 1000 || Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function sessionFromMobileToken(token: string): Promise<Session | null> {
  const payload = verifyMobileToken(token);
  if (!payload) return null;

  const [globalKill, user] = await Promise.all([
    isKillSwitchActive("GLOBAL"),
    db.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        accountState: true,
        adminPermissions: true,
        sessionVersion: true,
      },
    }),
  ]);

  if (globalKill.blocked || !user || !isAccountActive(user.accountState)) {
    return null;
  }
  if (user.sessionVersion !== payload.sessionVersion) {
    return null;
  }

  const userKill = await isKillSwitchActive("USER", user.id);
  if (userKill.blocked) return null;

  return toMobileSession({
    ...user,
    exp: payload.exp,
  });
}

export async function sessionFromMobileBearer(): Promise<Session | null> {
  try {
    const hdrs = await headers();
    const authorization = hdrs.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    return sessionFromMobileToken(authorization.slice(7).trim());
  } catch {
    return null;
  }
}
