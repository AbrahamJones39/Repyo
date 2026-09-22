import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminFacilitiesPage } from "@/components/admin/admin-facilities";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") redirect("/login");
  return <AdminFacilitiesPage userName={session.user.name} />;
}
