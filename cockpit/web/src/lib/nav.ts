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

export const DASHBOARDS: Dashboard[] = [
  {
    id: "twin",
    label: "Refinery Twin",
    href: "/twin",
    pages: [
      { href: "/twin", label: "Overview", Icon: IconGauge },
    ],
  },
  {
    id: "decision",
    label: "Decision",
    href: "/decision/overview",
    pages: [
      { href: "/decision/overview", label: "Overview & Twin", Icon: IconGauge },
      { href: "/decision/decisions", label: "Decisions", Icon: IconListCheck },
      { href: "/decision/quality", label: "Quality", Icon: IconFan },
    ],
  },
  {
    id: "technical",
    label: "Technical",
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
    label: "Modelling",
    href: "/modelling/models",
    pages: [
      { href: "/modelling/models", label: "Model comparison", Icon: IconTable },
      { href: "/modelling/confidence", label: "Confidence", Icon: IconTarget },
      { href: "/modelling/calibration", label: "Calibration", Icon: IconBell },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    href: "/knowledge",
    pages: [{ href: "/knowledge", label: "Library", Icon: IconBook }],
  },
];

/** Rail highlight: exact match, plus /knowledge/{docId} under the Library entry. */
export function isRailActive(pageHref: string, pathname: string): boolean {
  return pathname === pageHref || (pageHref === "/knowledge" && pathname.startsWith("/knowledge/"));
}

export const SHARED_PAGES: NavPage[] = [
  { href: "/audit", label: "Audit log", Icon: IconAudit },
  { href: "/settings", label: "Settings", Icon: IconGear, planned: true },
];

export function dashboardFor(pathname: string): Dashboard {
  const seg = pathname.split("/")[1] ?? "";
  return DASHBOARDS.find((d) => d.id === seg) ?? DASHBOARDS[0];
}
