import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signMobileToken, toMobileSession } from "@/lib/mobile-auth";
import { isAccountActive } from "@/lib/security/authorization";
import { isKillSwitchActive } from "@/lib/security/kill-switch";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const globalKill = await isKillSwitchActive("GLOBAL");
    if (globalKill.blocked) {
      return NextResponse.json({ error: "Sign-in is temporarily disabled" }, { status: 403 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !isAccountActive(user.accountState)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const userKill = await isKillSwitchActive("USER", user.id);
    if (userKill.blocked) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (user.role !== "REP") {
      return NextResponse.json(
        { error: "This app is for device representatives only" },
        { status: 403 }
      );
    }

    const { token, expiresAt } = signMobileToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      accountState: user.accountState,
      adminPermissions: user.adminPermissions,
      sessionVersion: user.sessionVersion,
    });

    return NextResponse.json({
      token,
      expiresAt,
      user: toMobileSession(user).user,
    });
  } catch (error) {
    console.error("POST /api/mobile/auth/login error:", error);
    return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });
  }
}
