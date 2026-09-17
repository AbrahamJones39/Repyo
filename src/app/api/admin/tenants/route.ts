import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCompanyRootOrgUnit } from "@/lib/org-scope";
import { createCompanySchema, updateCompanySchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companies = await db.company.findMany({
    include: {
      _count: { select: { users: true, serviceRequests: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(companies);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const slug = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const company = await db.company.create({
    data: {
      name: parsed.data.name,
      slug,
      products: parsed.data.products,
    },
  });

  await ensureCompanyRootOrgUnit(company.id, company.name);

  return NextResponse.json(company, { status: 201 });
}
