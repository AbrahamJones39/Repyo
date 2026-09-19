import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyFacilitiesPage } from "@/components/shared/my-facilities";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") redirect("/login");

  return (
    <MyFacilitiesPage
      portal="company"
      userName={session.user.name}
      apiPath="/api/company/site-coverage"
      description="Facilities you cover as an admin. Unassigned requests at these sites, or the nearest covered site, route to you."
    />
  );
}
