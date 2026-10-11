"use client";

import Link from "next/link";
import { BrandMark } from "@/components/shared/brand-mark";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/shared/notification-bell";
import { CoverageAlert } from "@/components/shared/coverage-alert";
import {
  Building2,
  CircleUser,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Network,
  Shield,
  Stethoscope,
  Users,
  X,
  Calendar,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_CONFIG: Record<string, { title: string; items: NavItem[] }> = {
  provider: {
    title: "Provider Portal",
    items: [
      { href: "/provider", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/provider/schedule", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { href: "/provider/requests", label: "Requests", icon: <Stethoscope className="h-4 w-4" /> },
      { href: "/provider/facilities", label: "My Facilities", icon: <MapPin className="h-4 w-4" /> },
      { href: "/provider/favorites", label: "Favorite Reps", icon: <Users className="h-4 w-4" /> },
      { href: "/provider/profile", label: "My Profile", icon: <CircleUser className="h-4 w-4" /> },
    ],
  },
  rep: {
    title: "Rep App",
    items: [
      { href: "/rep", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/rep/schedule", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { href: "/rep/facilities", label: "My Facilities", icon: <MapPin className="h-4 w-4" /> },
      { href: "/rep/teams", label: "Teams", icon: <Users className="h-4 w-4" /> },
      { href: "/rep/territory", label: "Territory", icon: <MapPin className="h-4 w-4" /> },
      { href: "/rep/profile", label: "My Profile", icon: <CircleUser className="h-4 w-4" /> },
    ],
  },
  company: {
    title: "Admin",
    items: [
      { href: "/company", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/company/requests", label: "Requests", icon: <Stethoscope className="h-4 w-4" /> },
      { href: "/company/facilities", label: "My Facilities", icon: <MapPin className="h-4 w-4" /> },
      { href: "/company/reps", label: "Reps", icon: <Users className="h-4 w-4" /> },
      { href: "/company/organization", label: "Organization", icon: <Network className="h-4 w-4" /> },
      { href: "/company/authorization", label: "Authorization", icon: <Shield className="h-4 w-4" /> },
      { href: "/company/teams", label: "Teams", icon: <Users className="h-4 w-4" /> },
      { href: "/company/schedule", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { href: "/company/analytics", label: "Analytics", icon: <Building2 className="h-4 w-4" /> },
      { href: "/company/profile", label: "My Profile", icon: <CircleUser className="h-4 w-4" /> },
    ],
  },
  admin: {
    title: "Platform Admin",
    items: [
      { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/admin/tenants", label: "Tenants", icon: <Building2 className="h-4 w-4" /> },
      { href: "/admin/organizations", label: "Provider Orgs", icon: <Stethoscope className="h-4 w-4" /> },
      { href: "/admin/facilities", label: "Facilities", icon: <MapPin className="h-4 w-4" /> },
      { href: "/admin/security", label: "Security", icon: <Building2 className="h-4 w-4" /> },
      { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
      { href: "/admin/profile", label: "My Profile", icon: <CircleUser className="h-4 w-4" /> },
    ],
  },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function isActive(pathname: string, href: string, rootHref: string) {
  if (href === rootHref) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalShell({
  portal,
  userName,
  children,
}: {
  portal: keyof typeof NAV_CONFIG;
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const config = NAV_CONFIG[portal];
  const rootHref = config.items[0]?.href ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = config.items.find((item) => isActive(pathname, item.href, rootHref));

  const nav = (
    <>
      {config.items.map((item) => {
        const active = isActive(pathname, item.href, rootHref);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-rose-50 text-rose-700"
                : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
            )}
          >
            {active && (
              <span className="absolute inset-y-1.5 -left-3 w-1 rounded-r-full bg-rose-600" aria-hidden />
            )}
            <span
              className={cn(
                "transition-colors",
                active ? "text-rose-600" : "text-slate-400 group-hover:text-slate-600"
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-xl p-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-xs font-semibold text-white shadow-sm">
        {initials(userName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
        <p className="truncate text-xs text-slate-500">{config.title}</p>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Sign out"
        aria-label="Sign out"
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  const sidebar = (
    <>
      <div className="flex h-16 items-center px-6">
        <Link href="/" onClick={() => setMobileOpen(false)}>
          <BrandMark size="sm" />
        </Link>
      </div>
      <div className="px-6 pb-2">
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {config.title}
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">{nav}</nav>
      <div className="border-t border-slate-200/70 p-3">{userCard}</div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white lg:flex">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="animate-fade-in relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <button
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <CoverageAlert />
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="lg:hidden">
              <BrandMark size="sm" showIcon={false} />
            </Link>
            {current && (
              <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
                <span className="text-slate-400">{config.title}</span>
                <span className="text-slate-300">/</span>
                <span className="truncate font-medium text-slate-900">{current.label}</span>
              </div>
            )}
          </div>
          <NotificationBell />
        </header>

        <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
