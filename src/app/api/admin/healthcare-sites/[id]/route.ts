import { auth } from "@/lib/auth";
import {
  approveHealthcareSite,
  mergeHealthcareSite,
  rejectHealthcareSite,
} from "@/lib/healthcare-sites/service";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const action = String(body.action ?? "");

  const edits = {
    name: body.name,
    address: body.address,
    city: body.city,
    state: body.state,
    zipCode: body.zipCode,
    phone: body.phone,
    siteType: body.siteType,
  };

  try {
    if (action === "approve") {
      const site = await approveHealthcareSite(id, edits);
      return NextResponse.json(site);
    }
    if (action === "reject") {
      const site = await rejectHealthcareSite(id);
      return NextResponse.json(site);
    }
    if (action === "merge") {
      const mergeIntoId = String(body.mergeIntoId ?? "");
      if (!mergeIntoId) {
        return NextResponse.json(
          { error: "Choose an existing facility to merge into" },
          { status: 400 }
        );
      }
      const site = await mergeHealthcareSite(id, mergeIntoId);
      return NextResponse.json(site);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update facility" },
      { status: 400 }
    );
  }
}
