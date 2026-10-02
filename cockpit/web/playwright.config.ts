// @ts-nocheck — @playwright/test is not a project dependency (Airlock npm mirror 404s a transitive dep on install);
// run with `make web-e2e` (launches the runner from the npx cache with NODE_PATH set so this import resolves)
import { defineConfig } from "@playwright/test";

/**
 * BDD-28 visual / behavioural acceptance for the Refinery Twin (L0) and Unit Workbench (L1).
 * Prereqs: API on :8010 (`make api-run`) and the Next dev server on :3001 (`make web-dev`).
 * Uses the system Chrome (`channel: "chrome"`) so no browser download is needed on Cloudtop.
 * Workers are capped at 2 to stay out of the way of the Octave data-generation batch.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/playwright-report" }]],
  outputDir: "artifacts/playwright-results",
  use: {
    baseURL: process.env.E2E_BASE ?? "http://localhost:3001",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--no-sandbox", "--disable-gpu"] },
  },
});
