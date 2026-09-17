import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import type { Role, UserAccountState } from "@prisma/client";
import { isAccountActive } from "@/lib/security/authorization";
import { isKillSwitchActive } from "@/lib/security/kill-switch";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      companyId: string | null;
      accountState: UserAccountState;
      adminPermissions: string[];
    };
  }

  interface User {
    role: Role;
    companyId: string | null;
    sessionVersion: number;
    accountState: UserAccountState;
    adminPermissions: string[];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    companyId: string | null;
    sessionVersion: number;
    accountState: UserAccountState;
    adminPermissions: string[];
    error?: string;
  }
}

const nextAuth = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.companyId = user.companyId ?? null;
        token.sessionVersion = user.sessionVersion ?? 0;
        token.accountState = user.accountState ?? "REGISTERED";
        token.adminPermissions = user.adminPermissions ?? [];
        delete token.error;
        // Fresh sign-in for any role — don't inherit a prior SessionRevoked cookie.
        return token;
      }

      if (token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: {
            sessionVersion: true,
            accountState: true,
            role: true,
            companyId: true,
            adminPermissions: true,
          },
        });

        if (!dbUser || !isAccountActive(dbUser.accountState)) {
          token.error = "SessionRevoked";
          return token;
        }

        const tokenVersion = token.sessionVersion ?? 0;
        if (tokenVersion !== dbUser.sessionVersion) {
          token.error = "SessionRevoked";
          return token;
        }

        delete token.error;
        token.sessionVersion = dbUser.sessionVersion;
        token.role = dbUser.role;
        token.companyId = dbUser.companyId;
        token.accountState = dbUser.accountState;
        token.adminPermissions = dbUser.adminPermissions;
      }

      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();

        const globalKill = await isKillSwitchActive("GLOBAL");
        if (globalKill.blocked) return null;

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user || !isAccountActive(user.accountState)) return null;

        const userKill = await isKillSwitchActive("USER", user.id);
        if (userKill.blocked) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          sessionVersion: user.sessionVersion,
          accountState: user.accountState,
          adminPermissions: user.adminPermissions,
        };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

export async function auth() {
  const { sessionFromMobileBearer } = await import("@/lib/mobile-auth");
  const mobileSession = await sessionFromMobileBearer();
  if (mobileSession) return mobileSession;
  return nextAuth.auth();
}
