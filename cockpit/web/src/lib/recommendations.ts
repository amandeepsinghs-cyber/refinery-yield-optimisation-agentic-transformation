import type { RecStatus } from "./types";

export interface RecStatusMeta {
  status: RecStatus;
  label: string;
  badgeClass: string;
}

export const REC_STATUS_BADGE: Record<RecStatus, string> = {
  OPEN: "accent",
  ACCEPTED: "green",
  DECLINED: "neutral",
  WITHHELD: "amber",
  EXPIRED: "neutral",
  HOLD: "neutral",
};

export const REC_STATUS_LABEL: Record<RecStatus, string> = {
  OPEN: "OPEN",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  WITHHELD: "WITHHELD",
  EXPIRED: "EXPIRED",
  HOLD: "HOLD — no safe move",
};

export const REC_STATUS_META: Record<RecStatus, RecStatusMeta> = {
  OPEN: { status: "OPEN", label: "OPEN", badgeClass: "accent" },
  ACCEPTED: { status: "ACCEPTED", label: "ACCEPTED", badgeClass: "green" },
  DECLINED: { status: "DECLINED", label: "DECLINED", badgeClass: "neutral" },
  WITHHELD: { status: "WITHHELD", label: "WITHHELD", badgeClass: "amber" },
  EXPIRED: { status: "EXPIRED", label: "EXPIRED", badgeClass: "neutral" },
  HOLD: { status: "HOLD", label: "HOLD — no safe move", badgeClass: "neutral" },
};

export function recStatusBadge(status: RecStatus | string): RecStatusMeta {
  const s = status as RecStatus;
  return (
    REC_STATUS_META[s] ?? {
      status: s,
      label: status,
      badgeClass: "neutral",
    }
  );
}

export function isRecActionable(status: RecStatus | string): boolean {
  return status === "OPEN";
}
