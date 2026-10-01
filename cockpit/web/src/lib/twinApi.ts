import { fetchJson } from "./api";
import { TwinOverview, TwinWorkbench } from "./twinTypes";

export async function getTwinOverview(runId?: string | null, timeMin?: number | null): Promise<TwinOverview> {
  const params = new URLSearchParams();
  if (runId) params.set("run_id", runId);
  if (timeMin != null) params.set("time_min", timeMin.toString());
  
  return fetchJson(`/api/twin?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

export async function getTwinWorkbench(
  unitId: string,
  runId?: string | null,
  timeMin?: number | null,
  windowMin = 720,
  step = 2
): Promise<TwinWorkbench> {
  const params = new URLSearchParams();
  if (runId) params.set("run_id", runId);
  if (timeMin != null) params.set("time_min", timeMin.toString());
  params.set("window_min", windowMin.toString());
  params.set("step", step.toString());
  
  return fetchJson(`/api/unit/${unitId}/workbench?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

export async function postWhatIf(
  runId: string,
  timeMin: number,
  unitId: string,
  moves: Record<string, number>
): Promise<{
  predicted: Record<string, number>;
  d_yield_pct_feed: Record<string, number>;
  p_on_spec: Record<string, number>;
  within_limits: boolean;
}> {
  return fetchJson("/api/recipe/whatif", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, time_min: timeMin, unit_id: unitId, moves }),
  });
}
