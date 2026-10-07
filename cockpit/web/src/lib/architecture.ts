/**
 * Target architecture page data (owner, 6 Oct 2026; verbatim.md Part 11). Mirrors
 * use_cases/ARCHITECTURE_AND_PHILOSOPHY.md. This page shows the TARGET — what we build with IOCL — and marks every
 * part with what the demo proves today. Overview and the unit pages describe the build itself. No value figures.
 */

/** today = runs in the demo, on simulated data (6 Oct owner: never "working" / "live" — nothing is deployed) · preview = visible with a scripted outcome, labelled · next = built after the data foundation. */
export type ArchStatus = "today" | "preview" | "next";

export const ARCH_STATUS_WORD: Record<ArchStatus, string> = {
  today: "In the demo",
  preview: "Preview",
  next: "Next",
};

export const ARCH_STATUS_ORDER: ArchStatus[] = ["today", "preview", "next"];

export interface CloudService {
  id: string;
  name: string;
  /** Official Google Cloud product icon, served locally (no CDN behind IAP). */
  logo: string;
  /** One plain line: what this service does in the platform (also the glossary line). */
  role: string;
  /** Omitted for Identity & access: it is part of the design on every layer, not a phase. */
  status?: ArchStatus;
}

const svc = (id: string, name: string, role: string, status?: ArchStatus, icon = id): CloudService => ({
  id, name, role, status, logo: `/icons/gcp/${icon}.svg`,
});

export const SERVICES = {
  bigquery: svc("bigquery", "BigQuery", "Query engine for the lakehouse; holds the gold tables; vector search over documents", "today"),
  storage: svc("storage", "Cloud Storage", "Holds the files: raw bronze, Iceberg silver, original documents", "today"),
  pubsub: svc("pubsub", "Pub/Sub", "Carries historian readings out of the plant as they are; filters nothing", "next"),
  dataflow: svc("dataflow", "Dataflow", "Writes raw readings to bronze and Bigtable; flags bad ones and writes 1-minute summaries to silver", "next"),
  bigtable: svc("bigtable", "Bigtable", "Live store: the last few weeks of readings, read by the agents every minute in milliseconds", "next"),
  composer: svc("composer", "Cloud Composer", "Runs the scheduled jobs: lab, assay and document loads, table builds, quality checks", "next"),
  docai: svc("docai", "Document AI", "Only for scanned pages and forms: turns images into text an embedding model can read", "next", "document-ai"),
  embed: svc("embed", "Vertex AI embeddings", "Turns each document section into a vector so the right section can be found", "today", "vertex-ai"),
  dataplex: svc("dataplex", "Dataplex", "One catalogue, lineage, and quality rules run on every load", "next"),
  vertex: svc("vertex-ai", "Vertex AI", "Train, version and serve each agent's models", "next"),
  gemini: svc("gemini", "Gemini", "Orchestrator: calls the agents, answers in plain words, cites the SOP sections it retrieves", "today"),
  run: svc("run", "Cloud Run", "Runs the agents and the operator screen", "today"),
  iam: svc("iam", "Cloud IAM", "One identity per agent, least privilege"),
  iap: svc("identity-aware-proxy", "Identity-Aware Proxy", "Every screen and API call checks who and which role"),
  kms: svc("key-management-service", "Cloud KMS", "Customer-managed keys held by IOCL, India regions"),
  vpcsc: svc("vpc-service-controls", "VPC Service Controls", "Perimeter around the lakehouse: no data leaves it"),
  logging: svc("logging", "Cloud Audit Logs", "Who did what, on every layer"),
} as const;

export type ServiceId = keyof typeof SERVICES;

export interface Agent {
  name: string;
  useCases: string;
  decisions: string;
  status: ArchStatus;
  note: string;
}

/** Layer 2 — one specialist agent per IOCL use case (target). */
export const AGENTS: Agent[] = [
  { name: "Soft-sensor agent", useCases: "#1 Product-quality inferential · #11 Product soft sensors",
    decisions: "D1 move the cut point now or wait for the lab · D2 can the estimate be trusted · D9 pull an extra sample",
    status: "today", note: "Interactive" },
  { name: "Furnace agent", useCases: "#5 Fired-heater combustion · #10 Crude-furnace coke & hydraulics",
    decisions: "D6 preheat for this feed", status: "preview", note: "Gain measured, outcome scripted (move shown on run s107 at 10:00)" },
  { name: "Regenerator agent", useCases: "#4 Regeneration-cycle tracking",
    decisions: "D5 regenerator air against afterburn", status: "preview", note: "Scripted" },
  { name: "Light-ends agent", useCases: "#2 Stabiliser C5 recovery · #3 LPG / naphtha split · #7 Exchanger fouling",
    decisions: "D7 overhead temperature target", status: "preview", note: "Scripted" },
  { name: "Systems agent", useCases: "#6 Multi-unit energy · #8 Filter breakthrough · #9 Rotating equipment",
    decisions: "D8 riser drift and its downstream consequence (watch) · D3 riser move for the new crude (scripted; cut points stay with D1)",
    status: "preview", note: "Watch only / scripted" },
  { name: "Coker, CDU / VDU, alkylation, utilities & flare agents", useCases: "The rest of IOCL's list",
    decisions: "Same pattern on other units", status: "next", note: "After the data foundation" },
];

export interface Layer {
  n: 1 | 2 | 3 | 4;
  name: string;
  job: string;
  today: string;
  status: ArchStatus;
  /** Badge wording: never claims more than the layer shows (6 Oct: "Shown today" on L1/L2 overclaimed). */
  badge: string;
  services: ServiceId[];
}

/** Top to bottom as drawn: the operator screen on top, the lakehouse at the base. */
export const LAYERS: Layer[] = [
  { n: 4, name: "One operator screen — a person decides",
    job: "Refinery and FCC view · one page per unit · decision cards (Accept / Hold / Decline) · decision record.",
    today: "Nothing is written to the control system.", status: "today", badge: "In the demo", services: ["run"] },
  { n: 3, name: "Gemini orchestrator",
    job: "Answers the operator in plain words (English, Hinglish, Hindi; text or voice), calls the right agents, combines their answers across units, cites the SOP. Read-only.",
    today: "In the demo: Gemini 2.5 Flash calls the platform's tools.", status: "today", badge: "In the demo", services: ["gemini"] },
  { n: 2, name: "Specialist agents — one per use case",
    job: "Each agent: its own models, checks and decision; runs as its own service.",
    today: "Today the demo runs them as separate modules inside one service.", status: "today",
    badge: "Soft-sensor agent interactive in the demo", services: ["vertex", "run"] },
  { n: 1, name: "One refinery data lakehouse",
    job: "Each kind of data comes in by the route that suits it: historian readings stream, lab, assay and schedule data load on a schedule, documents are turned into text and indexed for search, and decisions are written straight in by the screen. A live store beside it serves the agents; BigQuery keeps the history for training.",
    today: "Today: every source is loaded in batches from a physics simulator; the 46 simulated documents are embedded and searched live. No live store yet: the app reads BigQuery once and caches it. Streaming, scheduled loads and Bigtable are next.",
    status: "today", badge: "Lakehouse in the demo · streaming next", services: ["pubsub", "dataflow", "bigtable", "composer", "docai", "embed", "bigquery", "storage", "dataplex"] },
];

/** What flows between the layers, drawn as connectors (between layer above and layer below). */
export const LINKS: Record<number, string> = {
  4: "Operator asks · decision recorded",
  3: "Calls the right agents · combines their answers",
  2: "Each agent reads its unit's live data (Bigtable) and history (BigQuery) · writes its advice and the decision",
};

/**
 * Identity & access — designed into every layer (owner, 6 Oct 2026: "this is how we are building it"). Agents first:
 * each agent is its own identity with least privilege; then people, by role.
 */
export const ACCESS: { title: string; service: ServiceId; lines: string[] }[] = [
  { title: "Every agent has its own identity", service: "iam", lines: [
    "Reads only its own unit's data in the lakehouse",
    "Enforced by row- and column-level security by unit",
    "Writes only its advice and the decision record",
    "No credential and no network path to the DCS",
  ] },
  { title: "Gemini has its own identity", service: "iam", lines: [
    "May call the agents and read their answers",
    "Cannot change a set point, a model or the data",
  ] },
  { title: "People sign in with IOCL's own login", service: "iap", lines: [
    "Single sign-on with IOCL's identity provider",
    "Every screen and action checks the person's role",
  ] },
  { title: "Keys stay with IOCL", service: "kms", lines: ["Customer-managed encryption keys, India regions"] },
  { title: "One perimeter round the data", service: "vpcsc", lines: ["Lakehouse and agents inside; data cannot be copied out"] },
  { title: "Every action is logged", service: "logging", lines: ["Agent calls, data reads and decisions, kept for review"] },
];

/** Role-based access: who may do what on the operator screen. */
export const ROLES: [string, string][] = [
  ["Board operator", "Accept / Hold / Decline on their own unit"],
  ["Shift / process engineer", "All units; reviews the decision record"],
  ["Management", "Read-only view"],
  ["Platform admin", "Users, roles, model and agent releases"],
];

/**
 * Layer 1 ingest lanes (owner, 6 Oct 2026: not everything goes through Pub/Sub and Dataflow). Each source arrives by
 * the route that suits its data type. Decisions are born in the platform, so they are written straight in.
 */
export interface IngestLane {
  source: string;
  /** What the data looks like when it leaves the source system. */
  kind: string;
  /** How it gets in, in plain words. */
  route: string;
  services: ServiceId[];
  /** Where it lands in the lakehouse. */
  lands: string;
}

export const INGEST: IngestLane[] = [
  { source: "Historian tags", kind: "Numbers: tag, time, value, quality", route: "One-way gateway out of the plant; raw readings streamed as they are",
    services: ["pubsub", "dataflow"], lands: "Bigtable live · bronze raw · silver 1‑minute" },
  { source: "LIMS · crude assays · schedule", kind: "Table records (CSV / JSON exports)", route: "Scheduled loads, every few minutes to daily",
    services: ["composer"], lands: "Bronze → silver" },
  { source: "SOPs & documents", kind: "PDF, Word, scanned pages", route: "Text extracted (Document AI only for scans), split into sections, each embedded",
    services: ["docai", "embed"], lands: "Knowledge index" },
  { source: "Operator decisions", kind: "Records created on the screen", route: "Written straight in by the operator screen (L4)",
    services: [], lands: "Gold · decision record" },
];

/** Lakehouse zones as drawn, with the storage format of each (Iceberg made explicit, 6 Oct). */
export const ZONES: { name: string; what: string; format: string }[] = [
  { name: "Bronze", what: "raw, as received, never changed", format: "Parquet files" },
  { name: "Silver", what: "cleaned, checked by rules", format: "Apache Iceberg tables" },
  { name: "Gold", what: "ready for agents and screen", format: "BigQuery tables" },
  { name: "Knowledge", what: "document sections + vectors", format: "BigQuery vector search (RAG)" },
];

/** Parts drawn without a product icon: Apache Iceberg (open source) and BigLake (Google, part of BigQuery). */
export const OPEN_PARTS: { name: string; mark: string; role: string }[] = [
  { name: "Apache Iceberg", mark: "Iceberg", role: "Open-source table format for silver's files in the bucket; Spark, Trino and other engines can read them too" },
  { name: "BigLake", mark: "BigLake", role: "Part of BigQuery: the link that lets BigQuery query the Iceberg files in Cloud Storage as tables" },
];

/** Glossary under the diagram: every service on the page, top layer to bottom, then identity & access. */
export const GLOSSARY: ServiceId[] = [
  "run", "gemini", "vertex", "pubsub", "dataflow", "bigtable", "composer", "docai", "embed", "storage", "bigquery", "dataplex",
  "iam", "iap", "kms", "vpcsc", "logging",
];
