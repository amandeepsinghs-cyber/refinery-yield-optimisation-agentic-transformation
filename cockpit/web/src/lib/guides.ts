/**
 * Beginner guides (owner, 11 Oct 2026): which guide explains which page. Mirrors cockpit/api/app/copilot/guide_docs.py
 * (the API serves the markdown; this map only drives the header "Explainer" link and the in-page links).
 */
export const PAGE_GUIDE: Record<string, string> = {
  "/platform": "overview",
  "/architecture": "architecture",
  "/twin": "whole-unit",
  "/twin/unit/unit_1_furnace": "furnace",
  "/twin/unit/unit_2_riser": "riser",
  "/twin/unit/unit_3_regenerator": "regenerator",
  "/twin/unit/unit_4_fractionator": "fractionator",
  "/twin/unit/unit_5_condenser": "gas-plant",
  "/twin/unit/unit_6_stabiliser": "stabiliser",
  "/audit": "decision-record",
};

/** The guide for the page the user is on, or the hub. */
export function guideHref(pathname: string): string {
  const p = pathname.replace(/\/$/, "") || "/";
  const slug = PAGE_GUIDE[p];
  return slug ? `/explainer/${slug}` : "/explainer";
}
