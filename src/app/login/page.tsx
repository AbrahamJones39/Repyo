"use client";

import Link from "next/link";
import { BrandMark } from "@/components/shared/brand-mark";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const sessionError = searchParams.get("error") === "session";
  const credentialsError = searchParams.get("error") === "CredentialsSignin";
  const ssoError = searchParams.get("error") === "sso";
  const ssoTicket = searchParams.get("ssoTicket");
  const presetEmail = searchParams.get("email") ?? "";
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!ssoTicket || !presetEmail) return;
    const safeCallback =
      callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
    void signIn("credentials", {
      email: presetEmail,
      password: ssoTicket,
      ssoTicket: "1",
      callbackUrl: safeCallback,
    });
  }, [ssoTicket, presetEmail, callbackUrl]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const email = (form.get("email") as string)?.trim().toLowerCase();
    const password = form.get("password") as string;

    if (!email || !password) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    const safeCallback =
      callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/";

    try {
      await signIn("credentials", {
        email,
        password,
        callbackUrl: safeCallback,
      });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <BrandMark size="lg" className="justify-center" />
          <p className="mt-2 text-sm text-slate-600">
            Healthcare rep dispatch platform
          </p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {(sessionError || credentialsError || ssoError) && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {credentialsError
                ? "Invalid email or password."
                : ssoError
                  ? "Organization sign-in is not configured for that email, or the identity provider did not complete."
                  : "Your session expired. Sign in again to continue."}
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="you@hospital.org"
            required
            autoComplete="email"
            defaultValue={presetEmail}
          />
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              const email = String(new FormData(formRef.current!).get("email") ?? "")
                .trim()
                .toLowerCase();
              if (!email.includes("@")) {
                setError("Enter your work email to sign in with your organization.");
                return;
              }
              window.location.href = `/api/auth/sso/start?email=${encodeURIComponent(email)}`;
            }}
          >
            Sign in with your organization
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-rose-600 hover:underline">
            Sign up
          </Link>
        </p>

        <div className="mt-4 space-y-1 text-center text-xs text-slate-500">
          <p>Demo accounts (password: demo123)</p>
          <p>
            <span className="font-medium text-slate-600">Provider:</span> provider@demo.com
          </p>
          <p>
            <span className="font-medium text-slate-600">Rep:</span> rep@demo.com ·{" "}
            <span className="font-medium text-slate-600">Company admin:</span> admin@demo.com
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white">
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
