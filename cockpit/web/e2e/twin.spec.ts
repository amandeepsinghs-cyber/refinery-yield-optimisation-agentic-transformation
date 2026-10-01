// @ts-nocheck — @playwright/test is not a project dependency yet (types unavailable to tsc); install with `npx playwright install` before `make web-e2e`.
// BDD-28 — L0 Refinery Twin & L1 Unit Workbench screens.
// Run with the API on :8010 and the dev server on :3001 (`make api-run`, `make web-dev`, then `make web-e2e`).
// Use `localhost`, not 127.0.0.1 — Next's dev server blocks cross-origin dev resources from other hosts.
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE ?? "http://localhost:3001";
const GREY = /^#?(808080|a0a0a0|a1a1aa|71717a|64748b|94a3b8|9ca3af|6b7280|bfbfbf|c0c0c0|d4d4d8|e4e4e7)$/i;

async function openTwin(page: Page) {
  await page.goto(`${BASE}/twin`);
  await expect(page.getByTestId("l0-root")).toBeVisible();
  await expect(page.locator(".l0-loading")).toHaveCount(0, { timeout: 30_000 });
}

test.describe("Level 0 — Refinery Twin home", () => {
  test("root redirects to /twin and the page has no charts", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveURL(/\/twin$/);
    await expect(page.locator(".l0-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".js-plotly-plot")).toHaveCount(0);
  });

  test("six live unit blocks with KPI vs plan, status pill and counts", async ({ page }) => {
    await openTwin(page);
    const live = page.locator(".pfd-live");
    await expect(live).toHaveCount(6);
    for (const id of ["unit_1_furnace", "unit_2_riser", "unit_3_regenerator", "unit_4_fractionator", "unit_5_condenser", "unit_6_stabiliser"]) {
      const b = page.locator(`.pfd-live[data-unit="${id}"]`);
      await expect(b).toHaveCount(1);
      await expect(b.locator(".pfd-kpi-plan")).toContainText("vs plan");
      await expect(b.locator(".pfd-pill")).toHaveText(/IN ENVELOPE|DRIFT|ACT NOW/);
      await expect(b.locator(".pfd-counts")).toContainText(/agent flag/);
      expect(["OK", "WATCH", "ACT"]).toContain(await b.getAttribute("data-state"));
    }
    await expect(page.locator(".pfd-boundary")).toHaveCount(9);
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

  test("clicking the fractionator opens its workbench", async ({ page }) => {
    await openTwin(page);
    await page.locator('.pfd-live[data-unit="unit_4_fractionator"]').click();
    await expect(page).toHaveURL(/\/twin\/unit\/unit_4_fractionator$/);
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

  test("sober register: light by default, dark persists, no grey data colours, no horizontal scroll at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTwin(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    // loop lines and state pills must not be grey; boundary blocks and borders may be
    const strokes = await page.locator(".pfd-svg g[stroke]:not(.pfd-flow-bnd)").evaluateAll((els) => els.map((e) => e.getAttribute("stroke") ?? ""));
    for (const c of strokes) expect(c, `grey data stroke ${c}`).not.toMatch(GREY);
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("Level 1 — Unit workbench (smoke until Step 18 L1 lands)", () => {
  test("U4 workbench renders panels on one axis", async ({ page }) => {
    await page.goto(`${BASE}/twin/unit/unit_4_fractionator`);
    await page.waitForSelector(".js-plotly-plot", { timeout: 30_000 });
    expect(await page.locator(".js-plotly-plot").count()).toBeGreaterThanOrEqual(4);
  });
});
