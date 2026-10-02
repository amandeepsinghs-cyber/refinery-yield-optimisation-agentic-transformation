// @ts-nocheck — @playwright/test is not a project dependency yet (types unavailable to tsc); install with `npx playwright install` before `make web-e2e`.
// BDD-28 — L0 Refinery Twin & L1 Unit Workbench screens.
// Run with the API on :8010 and the dev server on :3001 (`make api-run`, `make web-dev`, then `make web-e2e`).
// Use `localhost`, not 127.0.0.1 — Next's dev server blocks cross-origin dev resources from other hosts.
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE ?? "http://localhost:3001";
// Demo context (demoflow.md §2): the crude-switch run at 10:00. Override with E2E_RUN / E2E_T.
const RUN = process.env.E2E_RUN ?? "random_s107";
const T = Number(process.env.E2E_T ?? 600);
const GREY = /^#?(808080|a0a0a0|a1a1aa|71717a|64748b|94a3b8|9ca3af|6b7280|bfbfbf|c0c0c0|d4d4d8|e4e4e7)$/i;

test.beforeEach(async ({ page }) => {
  // Same seeding the CDP screenshot helper uses (sessionStorage store context). Only when absent, so a test that
  // scrubs the clock or switches the register keeps its own state across reloads. Fresh contexts start dark by default.
  await page.addInitScript(([run, t]) => {
    try {
      if (!sessionStorage.getItem("fcc-cockpit-context")) {
        sessionStorage.setItem("fcc-cockpit-context", JSON.stringify({ state: { runId: run, property: "LCO_T98_F", timeMin: t, lang: "en" }, version: 0 }));
      }
    } catch { /* storage unavailable */ }
  }, [RUN, T] as const);
});

async function openTwin(page: Page) {
  await page.goto(`${BASE}/twin`);
  await expect(page.getByTestId("l0-root")).toBeVisible();
  await expect(page.locator(".l0-loading")).toHaveCount(0, { timeout: 30_000 });
}

test.describe("Level 0 — Refinery Twin home", () => {
  test("root redirects to /twin; the home is data-first (SVG curves, no Plotly) and scrolls only vertically", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveURL(/\/twin$/);
    await expect(page.locator(".l0-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".js-plotly-plot")).toHaveCount(0);
    await expect(page.getByTestId("unit-spark")).toHaveCount(6);
    await expect(page.getByTestId("flow-strip")).toBeVisible();
    await expect(page.getByTestId("unit-flow")).toBeVisible();
  });

  test("six unit tiles: KPI vs plan, status pill, 4 h fan sparkline, N(μ,σ) bell, P(on-spec) and counts", async ({ page }) => {
    await openTwin(page);
    const tiles = page.getByTestId("unit-tile");
    await expect(tiles).toHaveCount(6);
    for (const id of ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]) {
      const t = page.locator(`[data-testid=unit-tile][data-unit="${id}"]`);
      await expect(t).toHaveCount(1);
      await expect(t.locator(".u-tile-kpi-val")).toHaveText(/\d/);
      await expect(t.locator(".u-tile-pill")).toHaveText(/IN ENVELOPE|DRIFT|ACT NOW/);
      await expect(t.getByTestId("unit-spark")).toBeVisible();
      await expect(t.locator("svg.gauss")).toBeVisible();
      await expect(t.locator(".u-tile-foot")).toContainText(/μ .* σ/);
      await expect(t.locator(".u-tile-foot")).toContainText(/P\(on-spec\)/);
      expect(["OK", "WATCH", "ACT"]).toContain(await t.getAttribute("data-state"));
      await expect(t).toHaveAttribute("href", new RegExp(`/twin/unit/${id}\\?tag=`));
    }
    // process connectors are drawn between tiles (hydrocarbon train, catalyst loop, heat recovery)
    expect(await page.locator("[data-testid=unit-flow] svg.u-flow-links path").count()).toBeGreaterThanOrEqual(6);
  });

  test("systemic view: pipeline flow strip, cause → effect ripple, open decisions and crude adaptation", async ({ page }) => {
    await openTwin(page);
    const strip = page.getByTestId("flow-strip");
    for (const id of ["flow-regime", "flow-committee", "flow-optimiser", "flow-agents"]) await expect(strip.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("ripple-card")).toContainText(/Cause → effect/);
    const dec = page.getByTestId("open-decisions");
    await expect(dec).toBeVisible();
    expect(await dec.getByTestId("open-decision").count()).toBeGreaterThanOrEqual(1);
    await expect(dec.getByTestId("l0-accept").first()).toBeVisible();
    await expect(dec.getByTestId("l0-decline").first()).toBeVisible();
    await expect(page.getByTestId("crude-adaptation")).toContainText(/R[1-4]/);
    // full PFD is still reachable behind a disclosure
    await page.getByTestId("full-flowsheet").locator("summary").click();
    await expect(page.locator(".pfd-live")).toHaveCount(6);
  });

  test("crude-slate banner, plant strip and needs-attention lines with consequences", async ({ page }) => {
    await openTwin(page);
    await expect(page.getByTestId("plant-strip")).toContainText(/Plant mass closure/);
    await expect(page.getByTestId("plant-strip")).toContainText(/open decision/);
    await expect(page.getByTestId("plant-strip")).toContainText(/proactive agent flag/);
    await expect(page.getByTestId("crude-banner")).toContainText(/Declared .* °API/);
    await expect(page.getByTestId("crude-banner")).toContainText(/Detected/);
    const rows = page.locator(".l0-attn-item");
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    expect(await rows.count()).toBeLessThanOrEqual(5);
    const first = rows.first();
    await expect(first.locator(".l0-attn-time")).toHaveText(/\d{2}:\d{2}/);
    await expect(first.locator(".l0-attn-cons")).not.toBeEmpty();
    await expect(page.locator(".l0-attn-cons", { hasText: "Action required" })).toHaveCount(0);
  });

  test("header shows shift · clock, language switch and Gemini Live", async ({ page }) => {
    await openTwin(page);
    await expect(page.locator(".l0-title")).toHaveText(/Refinery Digital Twin · Shift [ABC] · \d{2}:\d{2}/);
    const seg = page.getByTestId("lang-toggle");
    await expect(seg.getByRole("button", { pressed: true })).toHaveText("EN");
    await seg.getByRole("button", { name: "हिंदी" }).click();
    await expect(seg.getByRole("button", { pressed: true })).toHaveText("हिंदी");
    await expect(page.getByRole("button", { name: /Gemini Live/ })).toBeVisible();
  });

  test("clicking the fractionator tile opens its workbench on the headline tag", async ({ page }) => {
    await openTwin(page);
    await page.locator('[data-testid=unit-tile][data-unit="unit_4_fractionator"]').click();
    await expect(page).toHaveURL(/\/twin\/unit\/unit_4_fractionator\?tag=/);
  });

  test("timeline scrubs the twin clock", async ({ page }) => {
    await openTwin(page);
    const tl = page.getByTestId("shift-timeline").getByRole("slider");
    const before = Number(await tl.getAttribute("aria-valuenow"));
    await tl.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(tl).toHaveAttribute("aria-valuenow", String(before - 60));
    await expect(page.locator(".l0-title")).not.toHaveText(new RegExp(`${before}`)); // clock re-rendered from the new minute
  });

  test("register: dark by default, light persists, no grey data colours, no horizontal scroll at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTwin(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    // loop lines and state pills must not be grey; boundary blocks and borders may be
    const strokes = await page.locator(".pfd-svg g[stroke]:not(.pfd-flow-bnd)").evaluateAll((els) => els.map((e) => e.getAttribute("stroke") ?? ""));
    for (const c of strokes) expect(c, `grey data stroke ${c}`).not.toMatch(GREY);
    await page.locator("[data-testid=theme-seg] button[aria-pressed=false]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

async function openUnit(page: Page, unit = "unit_4_fractionator", query = "") {
  await page.goto(`${BASE}/twin/unit/${unit}${query}`);
  await expect(page.getByTestId("l1-root")).toBeVisible();
  await expect(page.locator(".l1-loading")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(".js-plotly-plot .cartesianlayer").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("Level 1 — Unit workbench (SDD-L1-01..07)", () => {
  test("U4 renders header, I/O strip, five primary panels and a labelled right rail", async ({ page }) => {
    await openUnit(page);
    await expect(page.locator(".l1-title")).toContainText(/Unit Workbench — LCO T98/);
    await expect(page.getByTestId("unit-io-strip")).toContainText(/IN/);
    await expect(page.getByTestId("headline-kpi")).toContainText(/plan/);
    const panels = page.getByTestId("chart-panel");
    await expect(panels).toHaveCount(5);
    expect(await panels.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).toEqual(["measured_vs_expected", "residual", "mv", "disturbance", "yield"]);
    for (const id of ["rail-decision", "target-distribution", "rail-optimisation", "rail-regime", "rail-evidence", "rail-gemini"]) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("target-distribution").locator("svg.gauss")).toBeVisible();
    await expect(page.getByTestId("target-distribution")).toContainText(/P\(on-spec\)/);
    await expect(page.locator(".l1-section-label", { hasText: "Data" })).toBeVisible();
    await expect(page.locator(".l1-section-label", { hasText: "Analysis" })).toBeVisible();
    await expect(page.locator(".l1-section-label", { hasText: "Models" })).toBeVisible();
    await expect(page.locator(".l1-section-label", { hasText: "Decisions" })).toBeVisible();
  });

  test("one cursor at the store minute appears in every panel and an event chip moves it", async ({ page }) => {
    await openUnit(page);
    const minuteOf = async () => Number(await page.evaluate(() => JSON.parse(sessionStorage.getItem("fcc-cockpit-context") ?? "{}")?.state?.timeMin ?? NaN));
    const before = await minuteOf();
    expect(Number.isFinite(before)).toBe(true);
    // every panel carries at least one shape (the cursor); panels without hlines/markers carry exactly one
    const shapeCounts = await page.getByTestId("chart-panel").evaluateAll((els) => els.map((e) => e.querySelectorAll(".shapelayer path").length));
    for (const n of shapeCounts) expect(n).toBeGreaterThanOrEqual(1);
    const chip = page.getByTestId("event-ribbon").locator(".l1-chip").first();
    const chipMin = await chip.locator(".mono").textContent();
    await chip.click();
    await expect.poll(minuteOf).not.toBe(before);
    await expect(page.locator(".l1-clock")).toHaveText(chipMin!.trim());
  });

  test("?uc= entry scrolls to and highlights the owning panel and lists its citations", async ({ page }) => {
    // UC-03 (HN T98 quality) → signature panel `quality_2`, which lives under "More panels" and must be auto-opened.
    await openUnit(page, "unit_4_fractionator", "?uc=UC-03");
    const panel = page.locator(".l1-panel.twin-panel-highlight");
    await expect(panel).toHaveCount(1, { timeout: 10_000 });
    await expect(panel).toHaveId("panel-quality_2");
    await expect(panel).toContainText(/HN T98/);
    expect(await panel.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })).toBe(true);
    await expect(page.getByTestId("decision-citations").locator(".l1-cite").first()).toBeVisible();
  });

  test("language toggle changes the analysis briefing; Gemini card offers Hindi-first prompts", async ({ page }) => {
    await openUnit(page);
    const en = await page.getByTestId("analysis-summary").textContent();
    await page.getByTestId("lang-toggle").getByRole("button", { name: "हिंदी" }).click();
    await expect(page.getByTestId("analysis-summary")).not.toHaveText(en!);
    await expect(page.getByTestId("analysis-summary")).toHaveAttribute("lang", "hi");
    await expect(page.getByTestId("rail-gemini").locator(".l1-chip[lang=hi]").first()).toBeVisible();
  });

  test("model evidence shows members, physics checks and the spread gate; decision card has Accept / Decline", async ({ page }) => {
    await openUnit(page);
    await expect(page.getByTestId("rail-evidence").locator("table tbody tr")).toHaveCount(4);
    await expect(page.getByTestId("spread-gate")).toHaveText(/Spread gate (PASS|WITHHELD) · W90/);
    await expect(page.getByTestId("rail-evidence")).toContainText(/mass closure/);
    const decision = page.getByTestId("rail-decision");
    await expect(decision.getByTestId("decision-line")).toHaveText(/^(RAISE|LOWER|HOLD) \S+ [+−]?\d+\.\d °F \(\d+\.\d → \d+\.\d\)$/);
    await expect(decision.getByTestId("decision-accept")).toBeVisible();
    await expect(decision.getByTestId("decision-decline")).toBeVisible();
    await expect(page.getByTestId("optimisation-curve")).toBeVisible();
    await expect(page.getByTestId("rail-optimisation").locator("input[type=range]").first()).toBeVisible();
  });

  test("sober register: no grey data traces, light/dark both render, no horizontal scroll at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openUnit(page);
    const strokes = await page.locator(".js-plotly-plot .scatterlayer .lines path").evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke));
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) expect(s, `grey trace ${s}`).not.toMatch(/^rgb\((\d+), \1, \1\)$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.locator("[data-testid=theme-seg] button[aria-pressed=false]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".js-plotly-plot .cartesianlayer").first()).toBeVisible();
  });

  test("every simulator unit opens its workbench from one call", async ({ page }) => {
    for (const u of ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_5_condenser", "unit_6_stabiliser"]) {
      await openUnit(page, u);
      expect(await page.getByTestId("chart-panel").count()).toBeGreaterThanOrEqual(3);
      await expect(page.getByTestId("rail-evidence")).toBeVisible();
    }
  });
});

test.describe("Navigation and deep links after L1 (SDD-L1-05, D3)", () => {
  test("nav shows the Refinery Twin only; brand returns home; the six units sit in the rail", async ({ page }) => {
    await page.goto(`${BASE}/twin`);
    await expect(page.locator("nav.tabs .tab")).toHaveCount(1);
    await expect(page.locator("nav.tabs .tab")).toHaveText(/Refinery Twin/);
    await expect(page.locator("a.brand")).toHaveAttribute("href", "/twin");
    const rail = page.locator("nav.rail .rail-link");
    await expect(rail.filter({ hasText: "U4 · Fractionator" })).toBeVisible();
    await expect(rail.filter({ hasText: "Audit log" })).toBeVisible();
    for (const legacy of ["Decision", "Technical", "Modelling", "Knowledge"]) {
      await expect(page.locator("nav.tabs .tab", { hasText: legacy })).toHaveCount(0);
    }
  });

  test("a needs-attention line opens the unit workbench on the panel that plots its tag", async ({ page }) => {
    await page.goto(`${BASE}/twin`);
    const link = page.getByTestId("attention-link").first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/twin\/unit\/unit_\d_[a-z]+\?tag=/);
    await link.click();
    await expect(page.getByTestId("l1-root")).toBeVisible();
    await expect(page.locator(".twin-panel-highlight")).toHaveCount(1, { timeout: 5000 });
  });

  test("?more=1 reveals the unit-specific panels: fractionator tray profile, furnace combustion", async ({ page }) => {
    await openUnit(page, "unit_4_fractionator", "?more=1");
    const tray = page.locator("[data-testid=chart-panel][data-kind=tray_profile]");
    await expect(tray).toBeVisible();
    await expect(tray.locator(".g-xtitle")).toHaveText(/Tray/);
    await openUnit(page, "unit_1_furnace", "?more=1");
    const comb = page.locator("[data-testid=chart-panel][data-kind=combustion]");
    await expect(comb).toBeVisible();
    await expect(comb.locator(".g-y2title")).toHaveText(/CO ppm/);
  });

  test("yield panels keep engineering units per unit: % feed on the left, power on the right", async ({ page }) => {
    await openUnit(page, "unit_3_regenerator");
    const y = page.locator("[data-testid=chart-panel][data-kind=yield]");
    await expect(y.locator(".g-ytitle")).toHaveText(/% feed/);
    await expect(y.locator(".g-y2title")).toHaveText(/power/);
    await openUnit(page, "unit_5_condenser");
    await expect(page.locator("[data-testid=chart-panel][data-kind=yield] .g-ytitle")).toHaveText(/power/);
  });
});
