/**
 * Target architecture page data (owner, 6 Oct 2026; verbatim.md Part 11). Mirrors
 * use_cases/ARCHITECTURE_AND_PHILOSOPHY.md. This page shows the TARGET — what we build with IOCL — and marks every
 * part with what the demo proves today. Overview and the unit pages describe the build itself. No value figures.
 */

/** today = runs in the demo, on simulated data (6 Oct owner: never "working" / "live" — nothing is deployed) · preview = visible with a scripted outcome, labelled · next = built after the data foundation. */
export type ArchStatus = "today" | "preview" | "next";

export const ARCH_STATUS_WORD: Record<ArchStatus, string> = {
  today: "In the demo",
  preview: "In the demo",
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
  registry: svc("registry", "Vertex AI (agent and model registry)", "Lists every agent and model version, who may call it, and its release status", undefined, "vertex-ai"),
  logging: svc("logging", "Cloud Logging & Monitoring", "Who did what on every layer; agent health and drift alerts"),
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
  { name: "Quality-estimation agent", useCases: "#1 Product-quality inferential · #11 Online property prediction",
    decisions: "D1 move the cut point now or wait for the lab · D2 can the estimate be trusted · D9 pull an extra sample",
    status: "today", note: "Interactive" },
  { name: "Furnace agent", useCases: "#5 Fired-heater combustion · #10 Crude-furnace coke & hydraulics",
    decisions: "D6 preheat for this feed", status: "preview", note: "Gain measured (move shown on run s107 at 10:00)" },
  { name: "Regenerator agent", useCases: "#4 Regeneration-cycle tracking",
    decisions: "D5 regenerator air against afterburn", status: "preview", note: "Response model" },
  { name: "Light-ends agent", useCases: "#2 Stabiliser C5 recovery · #3 LPG / naphtha split · #7 Exchanger fouling",
    decisions: "D7 overhead temperature target", status: "preview", note: "Response model" },
  { name: "Systems agent", useCases: "#6 Multi-unit energy · #8 Filter breakthrough · #9 Rotating equipment",
    decisions: "D8 riser drift and its downstream consequence (watch) · D3 riser move for the new feed (cut points stay with D1)",
    status: "preview", note: "Watch and response model" },
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
    job: "Each agent: its own models, checks and decision; runs as its own service. Update, patch or roll back one agent without touching the rest.",
    today: "Today the demo runs them as separate modules inside one service.", status: "today",
    badge: "Quality-estimation agent interactive in the demo", services: ["vertex", "run"] },
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
    "Acts with the asking person's permissions: sees only what they may see",
  ] },
  { title: "People sign in with IOCL's own login", service: "iap", lines: [
    "Single sign-on with IOCL's identity provider",
    "Every screen and action checks the person's role",
  ] },
  { title: "Keys stay with IOCL", service: "kms", lines: ["Customer-managed encryption keys, India regions"] },
  { title: "One perimeter round the data", service: "vpcsc", lines: ["Lakehouse and agents inside; data cannot be copied out"] },
  { title: "Agent registry", service: "registry", lines: [
    "Every agent listed with owner, version and unit",
    "Which roles may call it and which data it may read",
    "Released, paused or retired only with sign-off",
  ] },
  { title: "Every action logged and monitored", service: "logging", lines: [
    "Agent calls, Gemini answers, data reads and decisions, kept for review",
    "Agent health and model drift against the lab, with alerts",
  ] },
];

/** Role-based access: who may do what on the operator screen. */
export const ROLES: [string, string][] = [
  ["Board operator", "Asks their own unit's agents; Accept / Hold / Decline on their own unit"],
  ["Shift / process engineer", "Asks all agents for their units; reviews the decision record"],
  ["Management", "Summaries and outcomes only; read-only"],
  ["Platform admin", "Registers and retires agents and models; assigns roles; takes no plant decisions"],
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
  "iam", "iap", "kms", "vpcsc", "registry", "logging",
];

/* ------------------------------------------------------------------------------------------------------------------
 * View ② "How your data comes in" — Google Cloud Cortex Framework, Manufacturing Connect & Data Engine, "Overall
 * Architecture Overview" (Cortex deck slide 26). Owner, 11 Oct 2026: keep the slide's own structure and keywords
 * (Factory shop floor, L4–L0, MES / HMI / SCADA / DCS / PLC's / Field device / Actuator / Sensor; Data Engine Pipelines,
 * Storage and Services inside the Manufacturing Data Engine); add the refinery reading only as a quiet second line.
 * Target architecture only: no cloud region named. Logos are the slide's own (public/icons/cortex) or the official
 * Google Cloud icons (public/icons/gcp). Status words are the page's own: "today" = shown in the demo on simulated
 * data, "next" = design, built with the client.
 * ------------------------------------------------------------------------------------------------------------------ */

/** Real-time stream (every reading, seconds) vs batch (scheduled loads and history). */
export type DataFlow = "stream" | "batch" | "both";

export const FLOW_WORD: Record<DataFlow, string> = {
  stream: "Real-time stream",
  batch: "Batch",
  both: "Real-time stream and batch",
};

/** One clickable part of the diagram. `logo` = an image path under /public. */
export interface DataBox {
  id: string;
  name: string;
  /** Second line, always visible (optional). */
  sub?: string;
  /** Opened on click: what the part does. */
  does: string;
  /** Opened on click: the same part in refinery terms. */
  refinery: string;
  status: ArchStatus;
  /** Which data it carries: the real-time stream, batch loads, or both. Omitted for config-only parts. */
  flow?: DataFlow;
  /** Opened on click: what the demo shows today. */
  demo: string;
  logo?: string;
}

const GCP = (n: string) => `/icons/gcp/${n}.svg`;
const CTX = (n: string) => `/icons/cortex/${n}.png`;

/** How a level's data leaves the plant: streamed through the edge, exported as tables on a schedule, or not at all. */
export type LevelRoute = "edge" | "batch" | "stays";

export const ROUTE_WORD: Record<LevelRoute, string> = {
  edge: "Real-time stream, through the edge",
  batch: "Batch, scheduled table exports",
  stays: "Not connected directly: reaches the historian in seconds",
};

/** Slide 26 left panel, "Factory shop floor": ISA-95 levels as drawn, with the slide's own system chips. */
export interface ShopFloorLevel {
  label: string;
  chips: string[];
  /** Quiet second line: the same level at a refinery. */
  refinery: string;
  /** Detail panel: what lives at this level in a refinery, in full. */
  systems: string;
  /** Detail panel: how often its data changes. */
  rate: string;
  /** Detail panel, light text: the standard ISA-95 definition of the level (presenter memory aid). */
  defn: string;
  route: LevelRoute;
}

export const SHOP_FLOOR: ShopFloorLevel[] = [
  { label: "L4 Enterprise", chips: ["MQTT (optional)", "alternative"], refinery: "ERP · planning & scheduling · crude assays",
    systems: "ERP (maintenance, crude purchase) · planning & scheduling · crude assays", rate: "daily", route: "batch",
    defn: "Enterprise / Business Logistics: corporate IT systems that manage business-related activities, such as ERP (Enterprise Resource Planning)." },
  { label: "L3 Operations Systems", chips: ["MES", "MQTT (optional)"], refinery: "Plant historian · LIMS · oil movement & blending",
    systems: "Plant historian · LIMS (lab results) · oil movement & blending", rate: "seconds · every 8 h for the lab", route: "edge",
    defn: "Manufacturing Operations: systems managing production workflows on the plant floor, like MES (Manufacturing Execution Systems)." },
  { label: "L2 Supervisory Control", chips: ["HMI", "SCADA", "DCS"], refinery: "Operator consoles · advanced process control",
    systems: "Operator consoles · advanced process control", rate: "seconds", route: "edge",
    defn: "Supervisory Control: systems that monitor and control the physical processes, such as SCADA (Supervisory Control and Data Acquisition) or HMIs (Human-Machine Interfaces)." },
  { label: "L1 Basic Control", chips: ["PLC’s", "PLC’s", "PLC’s"], refinery: "DCS controllers · safety systems",
    systems: "DCS controllers · safety systems (stay isolated)", rate: "sub-second", route: "stays",
    defn: "Basic Control: intelligent devices that read sensors and drive actuators, like Programmable Logic Controllers (PLCs)." },
  { label: "L0 Field I/O Devices", chips: ["Field device", "Actuator", "Sensor"], refinery: "Transmitters · online analysers · valves",
    systems: "Transmitters · online analysers · valves", rate: "sub-second", route: "stays",
    defn: "Field Level / Physical Process: the actual physical equipment, sensors and actuators on the shop floor." },
];

export const SHOP_FLOOR_NOTE = "L1 and L0 are read through the historian; nothing is written back to any level.";

export const MC_EDGE: DataBox = {
  id: "mc-edge", flow: "stream", name: "Manufacturing Connect Edge", sub: "by Litmus Automation", logo: CTX("manufacturing-connect-edge"),
  does: "Edge gateway that reads the plant systems over industrial protocols (OPC UA, MQTT and others), buffers if the link drops and sends the data out one way.",
  refinery: "Sits in the plant DMZ with read access to the historian; no write path to the DCS.",
  status: "next", demo: "Not in the demo: the simulator writes its tags straight to files.",
};

export const VPN_LINK = "VPN & Private service endpoints";

/** Detail panel, "Leaves the plant": the edge, the private link, and the scheduled route for table data. */
export const LEAVE_ROUTES: DataBox[] = [
  MC_EDGE,
  { id: "vpn", flow: "stream", name: "VPN & Private service endpoints", sub: "private link to Google Cloud, never the public internet", logo: CTX("mqtt"),
    does: "Carries the edge's messages over an encrypted, private connection (Cloud VPN or Interconnect with Private Service Connect).",
    refinery: "Your network team keeps control of the only path out of the plant.",
    status: "next", demo: "Not in the demo." },
  { id: "exports", flow: "batch", name: "Scheduled table exports", sub: "LIMS, assays, ERP and schedules as files", logo: GCP("storage"),
    does: "Records that already sit in tables leave as scheduled exports or through a connector, into the batch importer; ERP can use the Cortex Data Foundation connectors.",
    refinery: "Lab results every few minutes, assays and plans daily, maintenance orders from ERP.",
    status: "today", demo: "Simulated lab draws and crude segments, loaded in batches." },
];

/** Data Engine Pipelines, as drawn: batch importer and transforms on top, Pub/Sub → transformation at the base. */
export const PIPELINES: DataBox[] = [
  { id: "batch", flow: "batch", name: "Batch importer", logo: CTX("gcp-service"),
    does: "Loads history and exported tables through the same pipeline, so history and live data look the same.",
    refinery: "Years of historian data for training; LIMS results and crude assays.",
    status: "today", demo: "Lakehouse loader (bronze → silver) does this job." },
  { id: "window", flow: "stream", name: "Transforms & Window aggregations", logo: CTX("gcp-service"),
    does: "Builds 1-minute summaries and derived signals as the data streams.",
    refinery: "Riser temperature rise, coke per unit feed, tray-to-tray differences.",
    status: "next", demo: "Not in the demo as a pipeline: the simulator already writes 1-minute rows." },
  { id: "pubsub-in", flow: "stream", name: "Cloud Pub/Sub", logo: GCP("pubsub"),
    does: "Receives every message from the edge and hands it to the pipelines; nothing is filtered here.",
    refinery: "Every historian tag as it arrives: tag, time, value, quality.",
    status: "next", demo: "Not in the demo: readings are loaded in batches." },
  { id: "context", flow: "both", name: "Data Format Transformation & Contextualization", logo: GCP("dataflow"),
    does: "Turns raw messages into one standard shape and attaches the metadata: which asset, which unit of measure, whether the reading is good.",
    refinery: "For example, tag TI-2041 becomes FCC › Main fractionator › Tray 18 temperature, °F, good.",
    status: "next", demo: "Not in the demo as a pipeline: the simulator's tags already carry names and units from the tag catalogue." },
];

/** Data Engine Storage, as drawn: Cloud Storage and BigTable on top, BigQuery, Cloud Pub/Sub. */
export const STORAGE: DataBox[] = [
  { id: "gcs", flow: "batch", name: "Cloud Storage", sub: "raw archive, long retention", logo: GCP("storage"),
    does: "Durable file storage for raw and high-frequency data and long retention.",
    refinery: "Every message as received, kept unchanged (bronze).",
    status: "today", demo: "Bronze Parquet and silver Iceberg files." },
  { id: "bigtable", flow: "stream", name: "BigTable", sub: "live store, millisecond reads", logo: GCP("bigtable"),
    does: "Low-latency store: the last weeks of readings, read in milliseconds.",
    refinery: "What each agent reads every minute to give advice.",
    status: "next", demo: "Not in the demo: the app reads BigQuery once and caches it." },
  { id: "bigquery", flow: "batch", name: "BigQuery", sub: "history: training & analytics", logo: GCP("bigquery"),
    does: "Feature-rich, highly scalable analytics store; keeps the full history the models train on.",
    refinery: "Every tag every minute for years, joined to lab results.",
    status: "today", demo: "Silver and gold tables, plus vector search over documents." },
  { id: "pubsub-out", flow: "stream", name: "Cloud Pub/Sub", sub: "real-time output stream to ML", logo: GCP("pubsub"),
    does: "Streams processed data straight to models that score live.",
    refinery: "Anomaly detection on the live stream.",
    status: "next", demo: "Not in the demo." },
];

/** Data Engine Services, as drawn: Configuration · Metadata · Data Access, exposed through one API. */
export const SERVICES_MDE: DataBox[] = [
  { id: "config", name: "Configuration", logo: CTX("gcp-service"),
    does: "Declares which tags to collect and how each message type is processed.",
    refinery: "The FCC tag list first; other units are added by configuration, not code.",
    status: "next", demo: "A config file in the app stands in for it today." },
  { id: "metadata", name: "Metadata", logo: CTX("gcp-service"),
    does: "Holds the asset hierarchy and tag dictionary used to contextualise every reading.",
    refinery: "Refinery › unit › equipment › tag, with units and operating limits.",
    status: "today", demo: "Tag catalogue behind the unit pages." },
  { id: "access", name: "Data Access", logo: CTX("gcp-service"),
    does: "One governed way for applications and agents to read the contextualised data.",
    refinery: "Each agent reads only its own unit's tags.",
    status: "next", demo: "Today the agent reads the lakehouse directly." },
  { id: "api", name: "API", logo: CTX("gcp-service"),
    does: "The interface the services expose to apps, agents and the edge configuration.",
    refinery: "The operator screen and the agents call it; the edge receives its configuration through it.",
    status: "next", demo: "Not in the demo." },
];

/** Under the Data Engine on the slide: the cloud side of Manufacturing Connect (config flow). */
export const MC_CLOUD: DataBox = {
  id: "mc", name: "Manufacturing Connect", sub: "Optional, by Litmus Automation", logo: CTX("manufacturing-connect"),
  does: "Manages the edge devices centrally: which plant systems they read, and how. Optional: data can also arrive over MQTT.",
  refinery: "Your OT team configures the edge from one console; nothing is configured from inside the DCS.",
  status: "next", demo: "Not in the demo.",
};

/** Right-hand column of the Cortex Framework box on the slide. */
export const APPS: DataBox[] = [
  { id: "reporting", flow: "batch", name: "Reporting Accelerators & Partner Solutions", sub: "Looker · Cortex KPI models",
    logo: CTX("cortex-framework"),
    does: "Ready-made semantic models, KPI dashboards and partner solutions on the same contextualised data.",
    refinery: "Unit KPIs and data-quality views for engineers and management.",
    status: "next", demo: "Not in the demo." },
  { id: "vertex-app", flow: "both", name: "Vertex AI, App Layer", sub: "live: model estimate every minute · batch: model training", logo: GCP("vertex-ai"),
    does: "Where the models are trained and served and where the applications run.",
    refinery: "One specialist agent per use case; Gemini answers the operator; one screen where a person decides.",
    status: "today", demo: "FCC agent, Gemini and this cockpit." },
];

/** Bottom of the Cortex Framework box: enterprise and outside data that joins through Cortex Data Foundation. */
export const PARTNER_SOURCES: { name: string; logo: string }[] = [
  { name: "ERP", logo: CTX("erp-sap") },
  { name: "CRM", logo: CTX("crm-salesforce") },
  { name: "Public", logo: CTX("public-weather") },
  { name: "Sustainability", logo: CTX("sustainability") },
  { name: "Partners", logo: CTX("partners") },
];

/** Four rules the presenter closes the view on. */
export const DATA_RULES: string[] = [
  "Read-only and one-way out of the plant; nothing is written to the DCS.",
  "Each kind of data takes the route that suits it: tags stream, tables load on a schedule.",
  "Contextualised once, at the door — every agent reads the same asset model.",
  "A new unit is added by configuration, not a new project.",
];
