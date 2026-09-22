import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/layout/portal-shell";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Users, Stethoscope, Activity, MapPin } from "lucide-react";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  const [companies, users, requests, activeRequests, pendingFacilities] =
    await Promise.all([
      db.company.count(),
      db.user.count(),
      db.serviceRequest.count(),
      db.serviceRequest.count({
        where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      }),
      db.healthcareSite.count({ where: { status: "PENDING_REVIEW" } }),
    ]);

  const stats = [
    { label: "Device Companies", value: companies, icon: Building2 },
    { label: "Platform Users", value: users, icon: Users },
    { label: "Total Requests", value: requests, icon: Stethoscope },
    { label: "Active Requests", value: activeRequests, icon: Activity },
    { label: "Facilities pending review", value: pendingFacilities, icon: MapPin, href: "/admin/facilities" },
  ];

  return (
    <PortalShell portal="admin" userName={session.user.name}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Platform Admin</h1>
        <p className="text-sm text-slate-600">System monitoring & tenant management</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => {
          const card = (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">{stat.label}</p>
                <stat.icon className="h-5 w-5 text-rose-500" />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
            </div>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block hover:opacity-90">
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
      </div>
    </PortalShell>
  );
}
