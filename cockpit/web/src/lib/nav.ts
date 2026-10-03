import type { ComponentType, SVGProps } from "react";
import {
  IconAudit,
  IconFan,
  IconFlask,
  IconGauge,
  IconGear,
  IconLines,
  IconListCheck,
  IconPulse,
  IconReplay,
  IconSliders,
  IconTable,
  IconTarget,
  IconBell,
  IconBook,
} from "@/components/ui/icons";

export type DashboardId = "twin" | "decision" | "technical" | "modelling" | "knowledge";

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
  label: "Refinery Twin",
  href: "/twin",
  pages: [
    { href: "/platform", label: "Overview", Icon: IconBook },
    { href: "/twin", label: "Refinery", Icon: IconGauge },
    ...TWIN_UNITS.map((u) => ({ href: `/twin/unit/${u.unit_id}`, label: `${u.short} · ${u.label}`, Icon: IconLines })),
  ],
};

/**
 * Navigation shows the Refinery Twin only (SDD-L1-05, D3: Phase-13 catalogue and the Decision / Technical /
 * Modelling / Knowledge dashboards are retired from nav once L0/L1 ship). Their routes still resolve — see
 * LEGACY_DASHBOARDS — so deep links from Gemini citations and the audit log keep working.
 */
export const DASHBOARDS: Dashboard[] = [TWIN_DASHBOARD];

export const LEGACY_DASHBOARDS: Dashboard[] = [
  {
    id: "decision",
    label: "Decision (legacy)",
    href: "/decision/overview",
    pages: [
      { href: "/decision/overview", label: "Overview & Twin", Icon: IconGauge },
      { href: "/decision/decisions", label: "Decisions", Icon: IconListCheck },
      { href: "/decision/quality", label: "Quality", Icon: IconFan },
    ],
  },
  {
    id: "technical",
    label: "Technical (legacy)",
    href: "/technical/timeseries",
    pages: [
      { href: "/technical/timeseries", label: "Time-Series Explorer", Icon: IconLines },
      { href: "/technical/replay", label: "Replay", Icon: IconReplay },
      { href: "/technical/data-quality", label: "Data quality", Icon: IconPulse, planned: true },
      { href: "/technical/labs", label: "Labs", Icon: IconFlask, planned: true },
      { href: "/technical/whatif", label: "What-if", Icon: IconSliders, planned: true },
    ],
  },
  {
    id: "modelling",
    label: "Modelling (legacy)",
    href: "/modelling/models",
    pages: [
      { href: "/modelling/models", label: "Model comparison", Icon: IconTable },
      { href: "/modelling/confidence", label: "Confidence", Icon: IconTarget },
      { href: "/modelling/calibration", label: "Calibration", Icon: IconBell },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge (legacy)",
    href: "/knowledge",
    pages: [{ href: "/knowledge", label: "Library", Icon: IconBook }],
  },
];

/** Rail highlight: exact match, unit workbench prefix, plus /knowledge/{docId} under the Library entry. */
export function isRailActive(pageHref: string, pathname: string): boolean {
  if (pathname === pageHref) return true;
  if (pageHref.startsWith("/twin/unit/")) return pathname.startsWith(pageHref);
  return pageHref === "/knowledge" && pathname.startsWith("/knowledge/");
}

export const SHARED_PAGES: NavPage[] = [
  { href: "/audit", label: "Decision record", Icon: IconAudit },
  { href: "/settings", label: "Settings", Icon: IconGear, planned: true },
];

export function dashboardFor(pathname: string): Dashboard {
  const seg = pathname.split("/")[1] ?? "";
  return DASHBOARDS.find((d) => d.id === seg) ?? LEGACY_DASHBOARDS.find((d) => d.id === seg) ?? TWIN_DASHBOARD;
}
