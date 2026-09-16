"use client";

import Link from "next/link";
import { BrandMark } from "@/components/shared/brand-mark";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/shared/notification-bell";
import {
  Building2,
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
      { href: "/provider/favorites", label: "Favorite Reps", icon: <Users className="h-4 w-4" /> },
    ],
  },
  rep: {
    title: "Rep App",
    items: [
      { href: "/rep", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/rep/schedule", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { href: "/rep/teams", label: "Teams", icon: <Users className="h-4 w-4" /> },
      { href: "/rep/territory", label: "Territory", icon: <MapPin className="h-4 w-4" /> },
    ],
  },
  company: {
    title: "Admin",
    items: [
      { href: "/company", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/company/requests", label: "Requests", icon: <Stethoscope className="h-4 w-4" /> },
      { href: "/company/reps", label: "Reps", icon: <Users className="h-4 w-4" /> },
      { href: "/company/organization", label: "Organization", icon: <Network className="h-4 w-4" /> },
      { href: "/company/authorization", label: "Authorization", icon: <Shield className="h-4 w-4" /> },
      { href: "/company/teams", label: "Teams", icon: <Users className="h-4 w-4" /> },
      { href: "/company/schedule", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
      { href: "/company/analytics", label: "Analytics", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  admin: {
    title: "Platform Admin",
    items: [
      { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/admin/tenants", label: "Tenants", icon: <Building2 className="h-4 w-4" /> },
      { href: "/admin/organizations", label: "Provider Orgs", icon: <Stethoscope className="h-4 w-4" /> },
      { href: "/admin/security", label: "Security", icon: <Building2 className="h-4 w-4" /> },
      { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
    ],
  },
};

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <>
      {config.items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === item.href
              ? "bg-rose-50 text-rose-700"
              : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-100 p-6">
          <Link href="/">
            <BrandMark size="sm" />
          </Link>
          <p className="mt-1 text-xs text-slate-500">{config.title}</p>
        </div>
        <nav className="flex-1 space-y-1 p-4">{nav}</nav>
        <div className="border-t border-slate-100 p-4">
          <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-2 flex items-center gap-2 text-sm text-slate-500 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/" className="lg:hidden">
              <BrandMark size="sm" />
            </Link>
          </div>
          <NotificationBell />
        </header>

        {mobileOpen && (
          <div className="border-b border-slate-200 bg-white p-4 lg:hidden">
            <nav className="space-y-1">{nav}</nav>
          </div>
        )}

        <div className="bg-slate-50/50 p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
