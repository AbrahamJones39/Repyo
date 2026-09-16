import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompanyOrgPage } from "@/components/company/company-org-page";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") redirect("/login");
  return <CompanyOrgPage userName={session.user.name} />;
}
