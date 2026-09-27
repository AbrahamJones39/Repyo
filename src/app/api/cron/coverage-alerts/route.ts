import { processCoverageAlerts } from "@/lib/coverage-alerts";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const processed = await processCoverageAlerts(100);
    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    console.error("Coverage alert cron failed:", error);
    return NextResponse.json({ error: "Coverage alert processing failed" }, { status: 500 });
  }
}
