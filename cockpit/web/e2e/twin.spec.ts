// @ts-nocheck — @playwright/test is not a project dependency yet (types unavailable to tsc); install with `npx playwright install` before `make web-e2e`.
// BDD-28 / BDD-29 — L0 FCC complex home (UI v2 progressive disclosure) & L1 Unit Workbench screens.
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

test.describe("Level 0 — FCC complex home (UI v2, BDD-29 progressive disclosure)", () => {
  test("root redirects to /twin; the home is the Pyramid: headline → crude line → unit train + pane → footer; no Plotly; vertical scroll only", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveURL(/\/twin$/);
    await expect(page.locator(".l0-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".js-plotly-plot")).toHaveCount(0);
    const order = await page.evaluate(() =>
      ["l0-headline", "crude-banner", "unit-train", "l0-pane", "plant-strip"].map((id) => document.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect().top ?? -1));
    for (const y of order) expect(y).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(order[2]).toBeLessThan(order[4]);
    await expect(page.getByTestId("unit-spark")).toHaveCount(6);
    // architecture strip and full flowsheet are behind the "About this data" disclosure, not on the ops home
    await expect(page.getByTestId("flow-strip")).toBeHidden();
    await page.getByTestId("about-data").locator("summary").click();
    await expect(page.getByTestId("flow-strip")).toBeVisible();
    await expect(page.locator(".pfd-live")).toHaveCount(6);
  });

  test("headline answers Q1 in one sentence: units in envelope · worst deviation with since-when · recommendations", async ({ page }) => {
    await openTwin(page);
    const h = page.getByTestId("l0-headline");
    await expect(h).toContainText(/\d of 6 units in envelope/);
    await expect(h).toContainText(/(vs plan|all units tracking plan)/);
    await expect(h).toContainText(/(recommendation|no set-point move needed)/);
    await expect(page.getByTestId("crude-banner")).toContainText(/Declared .* °API/);
    await expect(page.getByTestId("crude-banner")).toContainText(/Detected/);
  });

  test("unit train: six flat tiles in process order, status as dot + word (no stripes, no pills), hero numeral, Δ vs plan, 1 px trend", async ({ page }) => {
    await openTwin(page);
    const tiles = page.getByTestId("unit-tile");
    await expect(tiles).toHaveCount(6);
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-unit")))).toEqual(
      ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]);
    for (const id of ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]) {
      const t = page.locator(`[data-testid=unit-tile][data-unit="${id}"]`);
      await expect(t.locator(".u2-val")).toHaveText(/\d/);
      await expect(t.locator(".u2-state")).toHaveText(/In envelope|Drifting|Act now/);
      await expect(t.locator(".u2-state .u2-dot")).toHaveCount(1);
      await expect(t.getByTestId("unit-spark")).toBeVisible();
      expect(["OK", "WATCH", "ACT"]).toContain(await t.getAttribute("data-state"));
      await expect(t).toHaveAttribute("href", new RegExp(`/twin/unit/${id}\\?tag=`));
      // register: no coloured left stripe, no pill
      const stripe = await t.evaluate((el) => { const cs = getComputedStyle(el); return [cs.borderLeftWidth, cs.borderLeftStyle]; });
      expect(stripe[0] === "0px" || stripe[1] === "none").toBe(true);
      await expect(t.locator("[class*=twin-pill]")).toHaveCount(0);
    }
    // the whole home carries no pill borders and no primary (filled) buttons — one primary action per screen, and it lives on L1
    const pillBorders = await page.locator("[class*=twin-pill], .l1-tag").evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopWidth));
    for (const b of pillBorders) expect(b).toBe("0px");
    await expect(page.locator("[data-testid=l0-root] .btn.primary")).toHaveCount(0);
  });

  test("detail pane: plant overview by default (needs attention + real Δ≠0 recommendations, holds summarised); hover/focus a unit opens its curve, N(μ,σ), since-why and recommendation; pin keeps it", async ({ page }) => {
    await openTwin(page);
    const pane = page.getByTestId("l0-pane");
    await expect(pane).toHaveAttribute("data-mode", "plant");
    await expect(pane.getByTestId("pane-plant")).toBeVisible();
    const rows = pane.locator(".l0-attn-item");
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    expect(await rows.count()).toBeLessThanOrEqual(5);
    await expect(rows.first().locator(".l0-attn-time")).toHaveText(/\d{2}:\d{2}/);
    // no HOLD 0.0 filler is ever listed as a decision
    for (const txt of await pane.getByTestId("pane-decision").allTextContents()) {
      expect(txt).not.toMatch(/HOLD/);
      expect(txt).not.toMatch(/[+−]0\.0 /);
    }
    await expect(pane.locator(".l0-attn-cons", { hasText: "Action required" })).toHaveCount(0);

    // hover the fractionator → unit detail
    await page.locator('[data-testid=unit-tile][data-unit="unit_4_fractionator"]').hover();
    await expect(pane).toHaveAttribute("data-mode", "unit", { timeout: 3_000 });
    const unit = pane.getByTestId("pane-unit");
    await expect(unit).toHaveAttribute("data-unit", "unit_4_fractionator");
    await expect(unit.locator("svg.gauss")).toBeVisible();
    await expect(unit).toContainText(/P\(on-spec\)/);
    await expect(unit).toContainText(/μ .* σ/);
    await expect(unit.locator(".pane-spark svg")).toBeVisible();
    await expect(unit).toContainText(/Since when, and why/);
    // pin, move the pointer away, pane stays
    await unit.getByTestId("pane-pin").click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await expect(pane).toHaveAttribute("data-mode", "unit");
    await expect(unit.getByTestId("pane-open")).toHaveAttribute("href", /\/twin\/unit\/unit_4_fractionator/);
    // keyboard focus also opens a pane (touch / a11y path)
    await unit.getByTestId("pane-pin").click(); // unpin
    await page.locator('[data-testid=unit-tile][data-unit="unit_3_regenerator"]').focus();
    await expect(pane.getByTestId("pane-unit")).toHaveAttribute("data-unit", "unit_3_regenerator", { timeout: 3_000 });
  });

  test("header shows shift · clock, language switch and Gemini Live; demo controls live in the Scenario tray", async ({ page }) => {
    await openTwin(page);
    await expect(page.locator(".l0-title")).toHaveText(/FCC complex · Shift [ABC] · \d{2}:\d{2}/);
    const seg = page.getByTestId("lang-toggle");
    await expect(seg.getByRole("button", { pressed: true })).toHaveText("EN");
    await seg.getByRole("button", { name: "हिंदी" }).click();
    await expect(seg.getByRole("button", { pressed: true })).toHaveText("हिंदी");
    await expect(page.getByRole("button", { name: /Gemini Live/ })).toBeVisible();
    await expect(page.getByTestId("theme-seg")).toBeHidden();
    await page.getByTestId("scenario-tray").locator("summary").click();
    await expect(page.getByTestId("theme-seg")).toBeVisible();
    await expect(page.locator("#run-select")).toBeVisible();
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

  test("footer answers Q4 (trust): provenance, cadence, mass closure without −0.00, decisions and flags", async ({ page }) => {
    await openTwin(page);
    const f = page.getByTestId("plant-strip");
    await expect(f).toContainText(/Simulated data/);
    await expect(f).toContainText(/1-min historian/);
    await expect(f).toContainText(/Plant mass closure/);
    await expect(f).not.toContainText(/−0\.00|-0\.00/);
    await expect(f).toContainText(/open decision/);
    await expect(f).toContainText(/proactive agent flag/);
  });

  test("register: dark by default, light persists, normal traces are neutral and abnormal ones coloured, no horizontal scroll at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTwin(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    // ISA-101: colour only for abnormal — an OK tile's trend is the neutral trace colour, an ACT tile's is red
    const ok = page.locator('[data-testid=unit-tile][data-state="OK"] .u2-spark-line').first();
    const act = page.locator('[data-testid=unit-tile][data-state="ACT"] .u2-spark-line');
    const okStroke = await ok.evaluate((e) => getComputedStyle(e).stroke);
    expect(okStroke).toBe("rgb(159, 179, 200)");
    if (await act.count()) expect(await act.first().evaluate((e) => getComputedStyle(e).stroke)).toBe("rgb(244, 63, 94)");
    await page.getByTestId("scenario-tray").locator("summary").click();
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
    await page.getByTestId("scenario-tray").locator("summary").click();
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
  test("nav shows the FCC Complex Twin only; brand returns home; the six units sit in the rail", async ({ page }) => {
    await page.goto(`${BASE}/twin`);
    await expect(page.locator("nav.tabs .tab")).toHaveCount(1);
    await expect(page.locator("nav.tabs .tab")).toHaveText(/FCC Complex Twin/);
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
