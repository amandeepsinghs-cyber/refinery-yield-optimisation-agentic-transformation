"use client";

/** Knowledge dashboard (F24) data hooks. Kept separate from api.ts, which is owned by another worker. */
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "./api";
import { normaliseManifest, type LibraryDoc } from "./knowledgeDoc";

const STATIC = { staleTime: 5 * 60_000 } as const;

export interface RecordEntry {
  time_min: number;
  timestamp: string;
  section: string;
  event_code: number | null;
  text: string;
}

/** GET /api/knowledge/records item (contract §6), including the optional SHIFT-log fields. */
export interface KnowledgeRecordFull {
  doc_id: string;
  doc_type: string;
  title: string;
  date: string | null;
  time_min: number | null;
  run_id?: string | null;
  window?: number[] | null;
  entries?: RecordEntry[];
}

/** Library list: GET /api/knowledge/docs normalised. */
export const useKnowledgeLibrary = () =>
  useQuery({
    queryKey: ["kdocs"],
    queryFn: () => fetchJson<unknown>("/api/knowledge/docs"),
    select: (raw): LibraryDoc[] => normaliseManifest(raw),
    ...STATIC,
  });

/**
 * Job records. With a run: that run's SHIFT logs plus records whose date falls inside the run; other
 * runs' logs are dropped server-side. Without a run: every record, unplaced (listed by date).
 */
export const useRunRecords = (runId: string | null) =>
  useQuery({
    queryKey: ["krecords-all", runId],
    queryFn: () =>
      fetchJson<KnowledgeRecordFull[]>(
        `/api/knowledge/records${runId ? `?run_id=${encodeURIComponent(runId)}` : ""}`,
      ),
    retry: 0,
    ...STATIC,
  });
