# How to read: Architecture

> **In one line:** this page is the map of what we would build with IOCL: one store for all plant data at the bottom, one specialist agent per problem on top of it, Gemini as the single voice, and one screen where a person decides. View ① shows that stack; view ② shows how the plant's data gets into it.

## 1. What this page is for

This page shows the **target**: the full system we would build once IOCL's real data is connected. Other pages show the FCC working.

Every part carries a status chip, so nobody confuses the plan with the demo:

| Chip on screen | What it means |
|---|---|
| **In the demo** (green, filled dot) | Works in the app today, on data from a simulated FCC. |
| **Next** (hollow dot, dashed outline) | Part of the design. Built once IOCL's data foundation is in place. |

The title reads **One refinery, one data foundation, many specialist agents**. The paragraph under it promises that every agent is advisory: a person decides, and nothing is written to the control system.

Two buttons under the legend switch views: **① Platform & agents** (`?view=platform`) and **② How your data comes in** (`?view=data`).

## 2. The words you need first

The page is full of Google Cloud product names. Here they are in plain words.

| Name on screen | What it is | Everyday analogy |
|---|---|---|
| **Lakehouse** | One central store for all refinery data: raw files and clean tables together. | A warehouse with a receiving dock, a sorting area and shelves of ready goods. |
| **Bronze / Silver / Gold** | The lakehouse zones. Bronze = raw, as received. Silver = cleaned and checked. Gold = ready for agents and the screen. | Raw vegetables, washed and cut, the plated dish. |
| **Cloud Storage** | Google's file store, any size, kept as long as needed. | A huge, safe filing cabinet. |
| **Apache Iceberg** | An open table format: it makes a pile of files behave like one table any tool can read. | A standard label on every box, so any forklift finds what is inside. |
| **BigQuery** | Google's analytics database; answers questions over years of data in seconds. | A librarian who has read every book. |
| **Bigtable** | A very fast store for the last few weeks of readings. | The notepad on your desk, next to the archive. |
| **Pub/Sub** | A message conveyor from the plant to the cloud; drops nothing. | A sorting belt that never stops. |
| **Dataflow** | Workers on that conveyor: clean readings, flag bad ones, write 1-minute summaries. | Staff who open, check and file each parcel. |
| **Cloud Composer** | Runs jobs on a schedule, such as "load lab results every few minutes". | An alarm clock that also does the chore. |
| **Vertex AI** | Google's platform to train, version and run machine-learning models. | The workshop where each agent's tools are made and serviced. |
| **Gemini** | Google's AI model. Here the "orchestrator": it takes the operator's question, calls the right agents and answers in plain words. | A conductor, not a musician. |

Also on the page: **Cloud Run** runs the agents and the screen as online services. **Document AI** turns scanned pages into text. **Vertex AI embeddings** turn each document section into numbers so the right section is found by meaning; handing that section to Gemini is called **RAG**. **Dataplex** is the catalogue of every table, where it came from (**lineage**) and its quality rules. **Cloud IAM** gives each person and each agent its own identity with only the permissions it needs. **Identity-Aware Proxy (IAP)** is the guard at the door: every screen and call checks who you are. **Cloud KMS** is the key safe: data is encrypted with keys IOCL holds. **VPC Service Controls** is a fence round the data: nothing can be copied out. More terms: [glossary](/explainer/glossary).

## 3. View ①: Platform & agents, read bottom-up

Four stacked layers, screen on top, lakehouse at the base. Read them **bottom-up**, the way data flows. Labels with a ↓ arrow between layers say what passes between them.

### L1 · One refinery data lakehouse

Badge: **Lakehouse in the demo · streaming next**.

A small table (**Source · what the data is** / **How it gets in** / **Lands in**) has four rows:

| Source | How it gets in | Lands in |
|---|---|---|
| **Historian tags** | One-way gateway; raw readings streamed (Pub/Sub, Dataflow) | Bigtable live · bronze raw · silver 1-minute |
| **LIMS · crude assays · schedule** | Scheduled loads (Cloud Composer) | Bronze → silver |
| **SOPs & documents** | Text extracted, split into sections, embedded | Knowledge index |
| **Operator decisions** | Written straight in by the screen (L4) | Gold · decision record |

A **historian** is the plant's database of sensor readings. **LIMS** is the lab system. A **crude assay** is the lab profile of a crude oil. An **SOP** is a standard operating procedure.

On the right, the **Lakehouse** box shows four coloured tiles: **Bronze** (Parquet files), **Silver** (Apache Iceberg tables), **Gold** (BigQuery tables), **Knowledge** (BigQuery vector search, RAG). A dashed box, **Live store, beside the lakehouse**, holds Bigtable. Below, **Dataplex** "checks silver against its rules after every load". The link **See how your plant data comes in — Cortex Framework →** jumps to view ②.

The grey line at the bottom is the honest status: today every source is loaded in batches from a physics simulator; the 46 simulated documents are embedded and searched live; no live store yet.

### L2 · Specialist agents — one per use case

Badge: **Soft-sensor agent interactive in the demo**.

An **agent** is a small program that owns one problem on one part of the unit, with its own models, checks and one decision for the operator. Six cards show the agent, its IOCL use-case numbers and a chip:

- **Soft-sensor agent** (#1, #11): **In the demo · Interactive**. Estimates product quality every minute between lab results.
- **Furnace**, **Regenerator**, **Light-ends** and **Systems** agents: **In the demo**. Their advice comes from a response model (a model of how the plant answers a change in a setting).
- **Coker, CDU / VDU, alkylation, utilities & flare agents**: **Next**.

Below: Vertex AI (Next) and Cloud Run (in the demo). The grey line: today the agents run as separate modules inside one service.

### L3 · Gemini orchestrator

Badge: **In the demo**. Five tiles: **English · Hinglish · Hindi**, **Text or voice**, **Calls the right agents**, **Cites the SOP**, **Read-only**. Gemini does not compute advice; it asks the agents and combines their answers. The demo uses Gemini 2.5 Flash.

### L4 · One operator screen — a person decides

Badge: **In the demo**. Tiles: **Refinery & FCC view**, **One page per unit**, **Accept · Hold · Decline**, **Decision record**. Then: "Nothing is written to the control system."

### Right-hand column: Identity, access & governance

Titled **Identity, access & governance — on every layer**. It runs beside all four layers because security is built into each, so it has no status chip. Its cards: **Every agent has its own identity** (reads only its own unit's data; no path to the **DCS**, the plant's control system) · **Gemini has its own identity** (cannot change a set point, a model or the data; sees only what the asking person may see) · **People sign in with IOCL's own login** · **Keys stay with IOCL** · **One perimeter round the data** · **Agent registry** (every agent with owner and version; released or retired only with sign-off) · **Every action logged and monitored** · **Role-based access to agents** (**Board operator**, **Shift / process engineer**, **Management** read-only, **Platform admin**).

### Under the diagram

- **MeitY-compliant boundary** (red dashed bar): "Your data stays in India, under keys you hold. Control and safety systems stay on site, and nothing is written to them." **MeitY** is India's Ministry of Electronics and IT, which sets the rules for such data.
- **What each service does** (closed; click to open): every product with logo, purpose and status. Iceberg and **BigLake** (the part of BigQuery that reads Iceberg files as tables) appear after BigQuery.
- **Agent ↔ use case detail** (closed; click to open): **Agent**, **IOCL use cases**, **Decision it brings to the operator** (codes D1–D9), **Status**. The nine decisions are explained in [the quick tour](/explainer/tour).

## 4. View ②: How your data comes in

This view redraws Google Cloud's **Cortex Framework — Manufacturing Connect & Data Engine** reference picture, read for a refinery. **Cortex Framework** is Google's ready-made blueprint for business and plant data. Read it **left to right**: shop floor, private link out, one data engine in the cloud.

**Colours:** a **blue** line or top stripe = **Real-time stream** (every reading, within seconds). **Green** = **Batch** (scheduled loads, minutes to daily). Both stripes = carries both. Dashed = **Config flow** (settings, not data). A **filled green dot** = in the demo; a **hollow dot** with dashed border = Next.

### Factory shop floor (left box)

The plant drawn as five levels of the industry standard **ISA-95**. A coloured bar on the left of each level shows how its data leaves:

| Level | Chips | At a refinery | Route |
|---|---|---|---|
| **L4 Enterprise** | MQTT (optional), alternative | ERP, planning, crude assays | Green: batch |
| **L3 Operations Systems** | MES, MQTT (optional) | Historian, LIMS, blending | Blue: real-time |
| **L2 Supervisory Control** | HMI, SCADA, DCS | Operator consoles | Blue: real-time |
| **L1 Basic Control** | PLC's | DCS controllers, safety systems | Grey: not connected |
| **L0 Field I/O Devices** | Field device, Actuator, Sensor | Transmitters, valves | Grey: not connected |

**MQTT** is a lightweight messaging standard for machines; the other chips are plant control systems the client knows. The point: L1 and L0 are never touched; their readings reach the historian anyway, and "nothing is written back to any level".

Inside L3 sits **Manufacturing Connect Edge** (by Litmus Automation, Next). An **edge gateway** is a small box in the plant network: it reads plant systems, buffers if the link drops, and sends data out one way only.

### The link out

A vertical label, **VPN & Private service endpoints**, with a blue and a green arrow. A **VPN** is a private, encrypted tunnel; data never crosses the public internet.

### Cortex Framework (right box)

The **Manufacturing Data Engine** has three panels:

- **Data Engine Pipelines**: **Batch importer** (in the demo), **Transforms & Window aggregations** (1-minute summaries), **Cloud Pub/Sub**, **Data Format Transformation & Contextualization**. Contextualisation labels each reading: tag TI-2041 becomes "FCC › Main fractionator › Tray 18 temperature, °F, good".
- **Data Engine Storage**: **Cloud Storage** (raw archive, in the demo), **BigTable** (live store, Next), **BigQuery** (history, in the demo), **Cloud Pub/Sub** (live output to models, Next).
- **Data Engine Services**: **Configuration**, **Metadata** (in the demo: the tag catalogue), **Data Access**, **API**.

Below: **Manufacturing Connect** (optional), sending settings to the edge boxes ("config flow"). On the right: **Reporting Accelerators & Partner Solutions** (Next) and **Vertex AI, App Layer** (in the demo: the FCC agent, Gemini and this cockpit). Along the bottom, logos for outside data that can join: **ERP**, **CRM**, **Public**, **Sustainability**, **Partners**.

### The two path lines

- **Real-time stream**: historian & DCS tags → Edge → VPN → Pub/Sub → 1-minute windows → **BigTable + Pub/Sub** → soft-sensor agent → operator screen.
- **Batch**: LIMS, assays, ERP, history back-fills → batch importer → transformation → **Cloud Storage + BigQuery** → model training, lab reconciliation, reports.

### Factory shop floor, in detail

A wider panel repeats the five levels with full systems, how often data changes (e.g. "seconds · every 8 h for the lab"), the ISA-95 definition in light text and a route pill. A **read-only →** arrow points to **Leaves the plant**: the Edge, the VPN and **Scheduled table exports** (in the demo).

### The four rules

1. Read-only and one-way out of the plant; nothing is written to the DCS.
2. Each kind of data takes the route that suits it: tags stream, tables load on a schedule.
3. Contextualised once, at the door — every agent reads the same asset model.
4. A new unit is added by configuration, not a new project.

**Where it lands: the platform & agents →** returns to view ①.

## 5. What to click

- The two view buttons at the top.
- View ①: open **What each service does** and **Agent ↔ use case detail**. Hover a product box for its role.
- View ②: click **any box with a logo**. A card opens with **What it does**, **Carries**, **At your refinery** and **Today**. One card at a time; click again to close. Hover a shop-floor level for its definition.
- **See it on the FCC →** goes to the Whole unit screen ([guide](/explainer/whole-unit)).

## 6. What to say in the demo

1. "All your data lands once, in one lakehouse inside India, under keys you hold."
2. "On top sits one specialist agent per use case. The soft-sensor agent is the one you can try today."
3. "Gemini is the single voice. It calls the agents and cites your SOPs. It is read-only."
4. "Data leaves the plant one way only. We never write to the DCS. A person always decides."

## 7. Questions people ask

**Is all of this running today?** No. Only parts marked **In the demo** run, on data from a simulated FCC. Streaming, Bigtable, the edge and the VPN are **Next**.

**Can an agent or Gemini change a set point?** No. Agents have no credential or network path to the DCS; Gemini is read-only. Accept and Hold go to the Decision record only.

**Why both Bigtable and BigQuery?** Bigtable is the fast notepad for recent weeks, read every minute. BigQuery is the full archive for training models.

**Do we have to use Litmus?** No. Manufacturing Connect is optional; data can also arrive over MQTT.
