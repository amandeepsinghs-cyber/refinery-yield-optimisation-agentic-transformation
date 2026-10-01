"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useConfig, useHealth, useRuns } from "@/lib/api";
import { clock, propLabel } from "@/lib/format";
import { DASHBOARDS, SHARED_PAGES, dashboardFor, isRailActive } from "@/lib/nav";
import { useCockpit } from "@/lib/store";
import type { PropertyId } from "@/lib/types";
import type { ThemeName } from "@/lib/theme";
import CopilotLauncher from "@/components/copilot/CopilotLauncher";
import DemoGuideModal from "@/components/shell/DemoGuideModal";
import Toaster from "@/components/ui/Toaster";
import { IconMoon, IconSun } from "@/components/ui/icons";

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--accent)" />
      <path d="M7 16.5V7.5h6M7 12h4.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M14.5 16.5c1.5 0 2.5-1 2.5-2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />
    </svg>
  );
}

/** Keeps store ⇄ DOM theme in sync and restores the persisted session context. */
function ContextBootstrap() {
  const runs = useRuns();
  const cfg = useConfig();
  const runId = useCockpit((s) => s.runId);
  const setRun = useCockpit((s) => s.setRun);

  useEffect(() => {
    void useCockpit.persist.rehydrate();
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") useCockpit.setState({ theme: t as ThemeName });
  }, []);

  useEffect(() => {
    if (!runs.data?.length || cfg.isLoading) return;
    const found = runs.data.find((r) => r.run_id === runId);
    if (found) return;
    // Default chain: API-advertised default_run → random_s140 → first available run.
    const apiDefault = (cfg.data as { default_run?: string } | undefined)?.default_run;
    const pick =
      (apiDefault ? runs.data.find((r) => r.run_id === apiDefault) : undefined) ??
      runs.data.find((r) => r.run_id === "random_s140") ??
      runs.data[0];
    setRun(pick.run_id, pick.n_minutes);
  }, [runs.data, runId, setRun, cfg.data, cfg.isLoading]);

  return null;
}

function ThemeToggle() {
  const theme = useCockpit((s) => s.theme);
  const toggle = useCockpit((s) => s.toggleTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn icon"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      id="theme-toggle"
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function Provenance() {
  const runs = useRuns();
  const health = useHealth();
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const run = runs.data?.find((r) => r.run_id === runId);
  const up = health.isSuccess;
  const text = run
    ? `Simulated data · ${run.batch} · ${run.run_id} · t ${timeMin ?? "—"} min (${clock(timeMin)})`
    : health.isError
      ? "Simulated data · API offline"
      : "Simulated data · no run selected";
  return (
    <span className="chip provenance" title={text} tabIndex={0} aria-describedby="provenance-tip" id="provenance-chip">
      <span className={`chip-dot ${up ? "ok" : health.isError ? "bad" : ""}`} aria-hidden />
      <span className="prov-text">{text}</span>
      <span role="tooltip" id="provenance-tip" className="prov-tip">
        {text}
      </span>
    </span>
  );
}

function RunPropertySelect() {
  const runs = useRuns();
  const runId = useCockpit((s) => s.runId);
  const setRun = useCockpit((s) => s.setRun);
  const property = useCockpit((s) => s.property);
  const setProperty = useCockpit((s) => s.setProperty);
  const byBatch = new Map<string, NonNullable<typeof runs.data>>();
  for (const r of runs.data ?? []) {
    const arr = byBatch.get(r.batch) ?? [];
    arr.push(r);
    byBatch.set(r.batch, arr);
  }
  return (
    <>
      <label className="sr-only" htmlFor="run-select">
        Simulated run
      </label>
      <select
        id="run-select"
        className="select"
        style={{ maxWidth: 190 }}
        value={runId ?? ""}
        disabled={!runs.data?.length}
        onChange={(e) => {
          const r = runs.data?.find((x) => x.run_id === e.target.value);
          if (r) setRun(r.run_id, r.n_minutes);
        }}
      >
        {!runs.data?.length ? <option value="">{runs.isError ? "API offline" : "No runs"}</option> : null}
        {[...byBatch.entries()].map(([batch, list]) => (
          <optgroup key={batch} label={batch}>
            {list.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.run_id} · {r.split}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="seg" role="group" aria-label="Property">
        {(["LCO_T98_F", "HN_T98_F"] as PropertyId[]).map((p) => (
          <button key={p} type="button" aria-pressed={property === p} onClick={() => setProperty(p)}>
            {propLabel(p)}
          </button>
        ))}
      </div>
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const dash = dashboardFor(pathname);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ContextBootstrap />
      <header className="topbar">
        <Link href="/twin" className="brand" aria-label="FCC Decision Cockpit home">
          <BrandMark />
          <span>
            FCC <span className="brand-sub">Decision Cockpit</span>
          </span>
        </Link>
        <nav className="tabs" aria-label="Dashboards">
          {DASHBOARDS.map((d) => (
            <Link
              key={d.id}
              href={d.href}
              className="tab"
              aria-current={dash.id === d.id && !pathname.startsWith("/audit") && !pathname.startsWith("/settings") ? "page" : undefined}
            >
              {d.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-spacer" />
        <div className="topbar-ctx">
          <DemoGuideModal />
          <Provenance />
          <RunPropertySelect />
          <ThemeToggle />
        </div>
      </header>
      <nav className="rail" aria-label={`${dash.label} pages`}>
        <div className="rail-title">{dash.label}</div>
        {dash.pages.map((p) => (
          <Link key={p.href} href={p.href} className="rail-link" aria-current={isRailActive(p.href, pathname) ? "page" : undefined}>
            <p.Icon />
            {p.label}
            {p.planned ? <span className="badge-planned">Demo+</span> : null}
          </Link>
        ))}
        <div className="rail-foot">
          {SHARED_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="rail-link" aria-current={pathname === p.href ? "page" : undefined}>
              <p.Icon />
              {p.label}
              {p.planned ? <span className="badge-planned">Demo+</span> : null}
            </Link>
          ))}
        </div>
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        {children}
      </main>
      <CopilotLauncher />
      <Toaster />
    </div>
  );
}
