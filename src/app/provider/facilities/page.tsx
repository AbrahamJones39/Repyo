import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyFacilitiesPage } from "@/components/shared/my-facilities";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PROVIDER") redirect("/login");

  return (
    <MyFacilitiesPage
      portal="provider"
      userName={session.user.name}
      apiPath="/api/provider/sites"
      allowPrimary
      description="Hospitals and clinics where you request reps. Requests use the selected facility, not a zip code."
    />
  );
}
