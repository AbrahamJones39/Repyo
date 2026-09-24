import { processCoverageAlerts } from "@/lib/coverage-alerts";

/** Remind, escalate, or expand routing for unacknowledged coverage requests. */
export async function escalateMissedRequests(limit = 50): Promise<number> {
  return processCoverageAlerts(limit);
}
