import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ProviderDashboard } from "@/components/provider/provider-dashboard";

export default async function ProviderPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PROVIDER") {
    redirect("/login");
  }

  const profile = await db.providerProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile?.onboardingComplete) {
    redirect("/provider/onboarding");
  }

  const primarySite = await db.providerSiteMembership.findFirst({
    where: { userId: session.user.id },
    include: { site: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  return (
    <ProviderDashboard
      userName={session.user.name}
      defaultFacility={{
        siteId: primarySite?.site.id,
        name: primarySite?.site.name ?? profile?.facilityName ?? undefined,
        address: primarySite
          ? `${primarySite.site.address}, ${primarySite.site.city}, ${primarySite.site.state} ${primarySite.site.zipCode}`
          : profile?.facilityAddress ?? undefined,
        city: primarySite?.site.city,
        state: primarySite?.site.state,
        zip: primarySite?.site.zipCode ?? profile?.zipCode ?? undefined,
        lat: primarySite?.site.lat,
        lng: primarySite?.site.lng,
        department: profile?.department ?? undefined,
        contactName: profile?.facilityContactName ?? undefined,
        contactPhone: profile?.facilityContactPhone ?? undefined,
      }}
      defaultRequester={{
        name: session.user.name,
        email: session.user.email ?? undefined,
        phone: profile?.requesterPhone ?? undefined,
        fax: profile?.requesterFax ?? undefined,
      }}
    />
  );
}
