import { auth } from "@/lib/auth";
import { getDefaultRoute } from "@/lib/auth-utils";
import { BrandMark } from "@/components/shared/brand-mark";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Shield,
  Stethoscope,
  Users,
  Zap,
} from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(getDefaultRoute(session.user.role));
  }

  const portals = [
    {
      role: "Healthcare Provider",
      desc: "Request/schedule qualified reps with live tracking and manage your favorite field team.",
      href: "/login",
      icon: Stethoscope,
      accent: "from-rose-500 to-pink-500",
    },
    {
      role: "Device Representative",
      desc: "Accept assignments, update availability, and navigate to the procedure on the go.",
      href: "/login",
      icon: Users,
      accent: "from-rose-600 to-red-500",
    },
    {
      role: "Company Admin",
      desc: "Oversee your rep roster, territories, qualification status, and operational analytics.",
      href: "/login",
      icon: Building2,
      accent: "from-pink-500 to-rose-600",
    },
  ];

  const features = [
    {
      icon: Zap,
      title: "Intelligent routing",
      desc: "Match the right rep by territory, product line, qualification, and availability.",
    },
    {
      icon: MapPin,
      title: "Live request tracking",
      desc: "Follow every request from assignment through arrival with real-time status updates.",
    },
    {
      icon: Clock,
      title: "More visibility",
      desc: "Cut messy scheduling delays for faster and more visible connections.",
    },
    {
      icon: Shield,
      title: "HIPAA-ready",
      desc: "Encrypted PHI handling built in from day one for healthcare environments.",
    },
  ];

  const steps = [
    { step: "01", title: "Request a rep", desc: "Providers submit case details, urgency, and device company in seconds." },
    { step: "02", title: "Auto-assign & track", desc: "GoRepYo routes to available qualified reps and streams live status." },
    { step: "03", title: "Complete request", desc: "Reps confirm arrival and completion — full audit trail included." },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <BrandMark size="md" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/signup"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-rose-600 sm:inline-block"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-100 via-pink-50 to-white blur-3xl" />
          <div className="absolute top-32 right-0 h-64 w-64 rounded-full bg-rose-200/40 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-pink-100/60 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/80 px-4 py-1.5 text-sm font-medium text-rose-700">
              <Shield className="h-4 w-4" />
              HIPAA-compliant rep dispatch
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl sm:leading-[1.1]">
              The fastest way to manage device reps
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
              GoRepYo connects hospitals and clinics with qualified medical device
              representatives — intelligent routing, live tracking, and streamlined
              scheduling for cath lab, EP lab, OR and clinics.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 sm:w-auto"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50/50 sm:w-auto"
              >
                Sign In
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
              {["Real-time status updates", "Multi-company support", "Role-based portals"].map(
                (item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-rose-500" />
                    {item}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-slate-100 bg-slate-50/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">
              Built for the procedural suite, clinical support and rep management
            </h2>
            <p className="mt-3 text-slate-600">
              Everything your team needs to coordinate reps without the chaos.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-rose-200 hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">How it works</h2>
            <p className="mt-3 text-slate-600">From request to rep on-site in three steps.</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="relative rounded-2xl border border-slate-200 p-8">
                <span className="text-4xl font-bold text-rose-100">{item.step}</span>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portals */}
      <section className="bg-slate-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">One platform, every role</h2>
            <p className="mt-3 text-slate-400">
              Sign in to the portal that matches your role.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {portals.map((portal) => (
              <Link
                key={portal.role}
                href={portal.href}
                className="group relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/50 p-6 transition hover:border-rose-500/50 hover:bg-slate-800"
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${portal.accent} text-white shadow-lg`}
                >
                  <portal.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">{portal.role}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{portal.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-rose-400 transition group-hover:gap-2">
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-3xl bg-gradient-to-br from-rose-600 to-pink-600 px-8 py-14 text-center text-white shadow-xl shadow-rose-600/20 sm:px-16">
            <h2 className="text-3xl font-bold sm:text-4xl">Ready to streamline rep dispatch?</h2>
            <p className="mx-auto mt-4 max-w-xl text-rose-100">
              Join GoRepYo and connect your providers with the right device rep — faster,
              every time.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                Create Account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-8 py-3.5 font-semibold text-white transition hover:bg-white/10"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <BrandMark size="sm" />
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} GoRepYo. Healthcare rep dispatch, simplified.
          </p>
        </div>
      </footer>
    </div>
  );
}
