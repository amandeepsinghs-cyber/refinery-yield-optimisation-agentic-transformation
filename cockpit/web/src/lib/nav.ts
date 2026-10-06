import type { ComponentType, SVGProps } from "react";
import {
  IconAudit,
  IconGauge,
  IconLines,
  IconBook,
} from "@/components/ui/icons";

export type DashboardId = "twin";

export interface NavPage {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  planned?: boolean;
}

export interface Dashboard {
  id: DashboardId;
  label: string;
  href: string;
  pages: NavPage[];
}

/** The six connected units in flow order (API_CONTRACT_v3 §5) — the L0 → L1 rail. */
export const TWIN_UNITS: { unit_id: string; short: string; label: string }[] = [
  { unit_id: "unit_1_furnace", short: "U1", label: "Furnace" },
  { unit_id: "unit_2_riser", short: "U2", label: "Riser" },
  { unit_id: "unit_3_regenerator", short: "U3", label: "Regenerator" },
  { unit_id: "unit_4_fractionator", short: "U4", label: "Fractionator" },
  { unit_id: "unit_5_condenser", short: "U5", label: "Gas plant" },
  { unit_id: "unit_6_stabiliser", short: "U6", label: "Stabiliser" },
];

export const TWIN_DASHBOARD: Dashboard = {
  id: "twin",
  label: "FCC Complex Twin",
  href: "/twin",
  pages: [
    { href: "/platform", label: "Overview", Icon: IconBook },
    { href: "/twin", label: "FCC Complex", Icon: IconGauge },
    ...TWIN_UNITS.map((u) => ({ href: `/twin/unit/${u.unit_id}`, label: `${u.short} · ${u.label}`, Icon: IconLines })),
  ],
};

/**
 * Navigation shows the FCC Complex Twin only. The legacy Decision / Technical / Modelling dashboards and Settings were
 * removed on 6 Oct 2026 (not used in the demo). /knowledge stays as a route because Gemini's source links open it.
 */
export const DASHBOARDS: Dashboard[] = [TWIN_DASHBOARD];

/** Rail highlight: exact match, unit workbench prefix, plus /knowledge/{docId} under the Library entry. */
export function isRailActive(pageHref: string, pathname: string): boolean {
  if (pathname === pageHref) return true;
  if (pageHref.startsWith("/twin/unit/")) return pathname.startsWith(pageHref);
  return pageHref === "/knowledge" && pathname.startsWith("/knowledge/");
}

export const SHARED_PAGES: NavPage[] = [
  { href: "/audit", label: "Decision record", Icon: IconAudit },
];

export function dashboardFor(pathname: string): Dashboard {
  const seg = pathname.split("/")[1] ?? "";
  return DASHBOARDS.find((d) => d.id === seg) ?? TWIN_DASHBOARD;
}
