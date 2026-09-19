import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyFacilitiesPage } from "@/components/shared/my-facilities";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") redirect("/login");

  return (
    <MyFacilitiesPage
      portal="rep"
      userName={session.user.name}
      apiPath="/api/rep/site-coverage"
      description="Facilities you cover. Incoming requests go to reps who cover that hospital, or whoever covers the nearest one."
    />
  );
}
