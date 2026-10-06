/** Target architecture page (owner, 6 Oct 2026; use_cases/ARCHITECTURE_AND_PHILOSOPHY.md): honest statuses, official logos, no money. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESS, AGENTS, ARCH_STATUS_WORD, GLOSSARY, INGEST, LAYERS, OPEN_PARTS, ROLES, SERVICES, ZONES } from "@/lib/architecture";
import { TWIN_DASHBOARD } from "@/lib/nav";

const ROOT = join(__dirname, "..");

describe("target architecture", () => {
  it("draws the four layers top to bottom: screen, Gemini, agents, lakehouse", () => {
    expect(LAYERS.map((l) => l.n)).toEqual([4, 3, 2, 1]);
  });

  it("gives every agent a status, with the soft-sensor agent interactive in the demo", () => {
    for (const a of AGENTS) expect(Object.keys(ARCH_STATUS_WORD)).toContain(a.status);
    expect(AGENTS.filter((a) => a.status === "today").map((a) => a.name)).toEqual(["Soft-sensor agent"]);
    expect(AGENTS.find((a) => a.name === "Soft-sensor agent")?.note).toBe("Interactive");
  });

  it("does not claim streaming, governance or Vertex AI as built today", () => {
    for (const id of ["pubsub", "dataflow", "dataplex", "vertex", "composer", "docai", "bigtable"] as const) expect(SERVICES[id].status).toBe("next");
    for (const id of ["bigquery", "storage", "gemini", "run", "embed"] as const) expect(SERVICES[id].status).toBe("today");
  });

  it("sends only historian readings through Pub/Sub and Dataflow; decisions are written straight in", () => {
    const streamed = INGEST.filter((l) => l.services.includes("pubsub") || l.services.includes("dataflow")).map((l) => l.source);
    expect(streamed).toEqual(["Historian tags"]);
    const decisions = INGEST.find((l) => /decision/i.test(l.source));
    expect(decisions?.services).toEqual([]);
    expect(INGEST.find((l) => /SOP/.test(l.source))?.services).toEqual(["docai", "embed"]);
    for (const l of INGEST) expect(l.kind.length).toBeGreaterThan(0);
  });

  it("shows the RAG knowledge index and Apache Iceberg in the lakehouse", () => {
    expect(ZONES.map((z) => z.name)).toEqual(["Bronze", "Silver", "Gold", "Knowledge"]);
    expect(ZONES.find((z) => z.name === "Silver")?.format).toMatch(/Apache Iceberg/);
    expect(ZONES.find((z) => z.name === "Knowledge")?.format).toMatch(/RAG/);
  });

  it("gives every service on the page a one-line glossary entry", () => {
    const onPage = new Set<string>([...LAYERS.flatMap((l) => l.services), ...ACCESS.map((a) => a.service), ...INGEST.flatMap((l) => l.services)]);
    for (const id of onPage) expect(GLOSSARY).toContain(id);
    for (const id of GLOSSARY) expect(SERVICES[id].role.length).toBeGreaterThan(10);
    expect(OPEN_PARTS.map((p) => p.name)).toContain("Apache Iceberg");
  });

  it("layer badges never claim more than the layer shows", () => {
    expect(LAYERS.find((l) => l.n === 2)?.badge).toBe("Soft-sensor agent interactive in the demo");
    expect(LAYERS.find((l) => l.n === 1)?.badge).toMatch(/streaming next/);
    expect(AGENTS).toHaveLength(6);
  });

  it("designs identity & access in: agents first, then people by role, with no phase label", () => {
    expect(ACCESS[0].title).toMatch(/agent/i);
    expect(ACCESS[0].lines.join(" ")).toMatch(/no .*path to the DCS/i);
    for (const a of ACCESS) expect(SERVICES[a.service].status).toBeUndefined();
    expect(ROLES.map(([r]) => r)).toContain("Board operator");
  });

  it("serves every official logo locally", () => {
    const used = new Set([...LAYERS.flatMap((l) => l.services), ...ACCESS.map((a) => a.service), "bigquery", "storage", "pubsub", "dataflow", "dataplex", "gemini"]);
    for (const id of used) {
      const logo = SERVICES[id as keyof typeof SERVICES].logo;
      expect(logo).toMatch(/^\/icons\/gcp\/[a-z-]+\.svg$/);
      expect(existsSync(join(ROOT, "public", logo))).toBe(true);
    }
  });

  it("shows no money figures", () => {
    const text = JSON.stringify({ ACCESS, AGENTS, LAYERS, ROLES, SERVICES })
      + readFileSync(join(ROOT, "src/components/how/ArchitectureView.tsx"), "utf8");
    expect(text).not.toMatch(/[$₹€£]\s?\d|\b(crore|lakh|USD|INR)\b|\bper (year|annum)\b/i);
  });

  it("sits in the nav right after Overview", () => {
    expect(TWIN_DASHBOARD.pages.slice(0, 3).map((p) => p.href)).toEqual(["/platform", "/architecture", "/twin"]);
  });
});
