import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AppConfig,
  AuditRow,
  CalibrationResponse,
  Distribution,
  EstimateMessage,
  EstimatesTimeseries,
  Health,
  KnowledgeDoc,
  KnowledgeRecord,
  KnowledgeSearch,
  ModelsResponse,
  Overview,
  Recommendation,
  RunInfo,
  RunTimeseries,
  TagInfo,
  TwinState,
} from "./types";

/** Error raised for non-2xx responses; carries the contract `{error, detail}` body. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type Params = Record<string, string | number | null | undefined | boolean>;

export function qs(params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new HttpError(0, "API unreachable", "The cockpit API on port 8010 is not responding.");
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; detail?: unknown };
      if (body.error) msg = body.error;
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    if (res.status >= 500 && res.status <= 504 && !detail) {
      detail = "The cockpit API returned a server error or is not running.";
    }
    throw new HttpError(res.status, msg, detail);
  }
  return (await res.json()) as T;
}

const STATIC = { staleTime: 5 * 60_000 } as const;

export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: () => fetchJson<Health>("/api/health"),
    refetchInterval: 30_000,
    retry: 0,
  });

export const useRuns = () =>
  useQuery({ queryKey: ["runs"], queryFn: () => fetchJson<RunInfo[]>("/api/runs"), ...STATIC });

export const useTags = () =>
  useQuery({ queryKey: ["tags"], queryFn: () => fetchJson<TagInfo[]>("/api/tags"), ...STATIC });

export const useConfig = () =>
  useQuery({ queryKey: ["config"], queryFn: () => fetchJson<AppConfig>("/api/config"), ...STATIC });

export interface TimeWindow {
  from?: number | null;
  to?: number | null;
}

export const useRunTimeseries = (
  runId: string | null,
  cols: string[],
  win: TimeWindow,
  maxPoints = 2000,
) =>
  useQuery({
    queryKey: ["run-ts", runId, cols.join(","), win.from ?? null, win.to ?? null, maxPoints],
    queryFn: () =>
      fetchJson<RunTimeseries>(
        `/api/runs/${encodeURIComponent(runId!)}/timeseries${qs({
          cols: cols.join(","),
          from: win.from,
          to: win.to,
          max_points: maxPoints,
        })}`,
      ),
    enabled: !!runId && cols.length > 0,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useEstimatesTimeseries = (
  runId: string | null,
  property: string,
  win: TimeWindow,
  maxPoints = 2000,
  enabled = true,
) =>
  useQuery({
    queryKey: ["est-ts", runId, property, win.from ?? null, win.to ?? null, maxPoints],
    queryFn: () =>
      fetchJson<EstimatesTimeseries>(
        `/api/estimates/timeseries${qs({
          run_id: runId,
          property,
          from: win.from,
          to: win.to,
          max_points: maxPoints,
        })}`,
      ),
    enabled: !!runId && enabled,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useEstimate = (runId: string | null, property: string, timeMin: number | null) =>
  useQuery({
    queryKey: ["estimate", runId, property, timeMin],
    queryFn: () =>
      fetchJson<EstimateMessage>(`/api/estimate${qs({ run_id: runId, property, time_min: timeMin })}`),
    enabled: !!runId && timeMin !== null,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useDistribution = (runId: string | null, property: string, timeMin: number | null) =>
  useQuery({
    queryKey: ["distribution", runId, property, timeMin],
    queryFn: () =>
      fetchJson<Distribution>(`/api/distribution${qs({ run_id: runId, property, time_min: timeMin })}`),
    enabled: !!runId && timeMin !== null,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useModels = (property: string) =>
  useQuery({
    queryKey: ["models", property],
    queryFn: () => fetchJson<ModelsResponse>(`/api/models${qs({ property })}`),
    ...STATIC,
  });

export const useCalibration = (property: string) =>
  useQuery({
    queryKey: ["calibration", property],
    queryFn: () => fetchJson<CalibrationResponse>(`/api/calibration${qs({ property })}`),
    ...STATIC,
  });

export const useOverview = (runId: string | null, property: string = "LCO_T98_F", timeMin?: number | null) =>
  useQuery({
    queryKey: ["overview", runId, property, timeMin ?? null],
    queryFn: () => fetchJson<Overview>(`/api/overview${qs({ run_id: runId, property, time_min: timeMin })}`),
    enabled: !!runId,
    placeholderData: keepPreviousData,
  });

export const useRecommendations = (runId: string | null, status?: string, timeMin?: number | null) =>
  useQuery({
    queryKey: ["recs", runId, status ?? null, timeMin ?? null],
    queryFn: () =>
      fetchJson<Recommendation[]>(`/api/recommendations${qs({ run_id: runId, status, time_min: timeMin })}`),
    enabled: !!runId,
    placeholderData: keepPreviousData,
  });

export const useTwin = (runId: string | null, timeMin?: number | null) =>
  useQuery({
    queryKey: ["twin", runId, timeMin ?? null],
    queryFn: () => fetchJson<TwinState>(`/api/twin${qs({ run_id: runId, time_min: timeMin })}`),
    enabled: !!runId,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useAudit = (q: string) =>
  useQuery({
    queryKey: ["audit", q],
    queryFn: () => fetchJson<AuditRow[]>(`/api/audit${qs({ q })}`),
    placeholderData: keepPreviousData,
  });

export const useKnowledgeSearch = (q: string, type?: string) =>
  useQuery({
    queryKey: ["ks", q, type ?? null],
    queryFn: () => fetchJson<KnowledgeSearch>(`/api/knowledge/search${qs({ q, type, k: 8 })}`),
    enabled: q.trim().length > 1,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useKnowledgeDocs = () =>
  useQuery({
    queryKey: ["kdocs"],
    queryFn: () => fetchJson<unknown>("/api/knowledge/docs"),
    ...STATIC,
  });

export const useKnowledgeDoc = (docId: string | null) =>
  useQuery({
    queryKey: ["kdoc", docId],
    queryFn: () => fetchJson<KnowledgeDoc>(`/api/knowledge/docs/${encodeURIComponent(docId!)}`),
    enabled: !!docId,
    ...STATIC,
  });

export const useKnowledgeRecords = (runId: string | null) =>
  useQuery({
    queryKey: ["krecords", runId],
    queryFn: () => fetchJson<KnowledgeRecord[]>(`/api/knowledge/records${qs({ run_id: runId })}`),
    enabled: !!runId,
    retry: 0,
    ...STATIC,
  });

export async function postDecision(
  recId: string,
  decision: "accepted" | "declined",
  user: string,
  note = "",
): Promise<{ ok: boolean; audit_id: string }> {
  return fetchJson(`/api/recommendations/${encodeURIComponent(recId)}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, user, note }),
  });
}

export async function postTwinDecision(
  recId: string,
  decision: "accepted" | "declined",
  user: string,
  note = "",
  runId?: string | null,
  timeMin?: number | null,
  recipeId?: string,
): Promise<{ ok: boolean; rec_id: string; decision: string; status: string; audit_id: number; note: string }> {
  return fetchJson("/api/twin/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rec_id: recId,
      recipe_id: recipeId,
      decision,
      user,
      note,
      run_id: runId ?? null,
      time_min: timeMin ?? null,
    }),
  });
}

/** Normalises the knowledge manifest, whose exact shape is owned by the corpus generator. */
export function manifestDocs(raw: unknown): { doc_id: string; title: string; doc_type: string; revision?: string | number }[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { docs?: unknown }).docs)
      ? ((raw as { docs: unknown[] }).docs)
      : [];
  return arr
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && "doc_id" in d)
    .map((d) => ({
      doc_id: String(d.doc_id),
      title: String(d.title ?? d.doc_id),
      doc_type: String(d.doc_type ?? d.type ?? ""),
      revision: (d.revision as string | number | undefined) ?? undefined,
    }));
}
