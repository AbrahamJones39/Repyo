import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { CompanyOrgPage } from "@/components/company/company-org-page";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "COMPANY_ADMIN") redirect("/login");

  const companyId = session.user.companyId;
  const company = companyId
    ? await db.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      })
    : null;

  return (
    <CompanyOrgPage
      userName={session.user.name}
      companyName={company?.name ?? ""}
    />
  );
}
