import { auth } from "@/lib/auth";
import { listHealthcareSitesForAdmin } from "@/lib/healthcare-sites/service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await listHealthcareSitesForAdmin();
  return NextResponse.json(sites);
}
