/**
 * "How it works" content (owner, 2 Oct 2026 14:31–14:33): one page that explains the tool — what each part does, the
 * question it answers, every decision it helps with, and how each ties back to the IOCL use-case list
 * (refinery_optimisation_use_cases.md, "High-value use cases by value area", rows 1–11; feedstock evaluation is not on
 * IOCL's list and is not shown). Decision ids, levers and use-case ids match api/app/engines/decisions.py and scripted.py.
 *
 * Honesty: every part, decision and use case carries a status. "Scripted" = the owner's 13:56 decision to keep the real
 * simulator inputs and script the outputs (1.5 months of simulated data cannot honestly train the classifier and the
 * per-crude response models). No value figures anywhere (owner, 10:16).
 */

export type Status = "real" | "scripted" | "partly" | "watch" | "absent";

export const STATUS_LABEL: Record<Status, string> = {
  real: "Real",
  scripted: "Scripted outcome",
  partly: "Partly",
  watch: "Watch only",
  absent: "Not in this build",
};

export type PartId = "watch" | "crude" | "estimators" | "response" | "checks" | "optimiser" | "gemini";

export interface Part {
  id: PartId;
  n: number;
  name: string;
  question: string;
  kind: string;
  input: string;
  output: string;
  where: string;
  status: Status;
  statusNote: string;
  members?: [string, string][];
}

export const PARTS: Part[] = [
  {
    id: "watch", n: 1, name: "Anomaly detection", question: "Is something off, and since when?",
    kind: "Statistical monitoring, not AI. For every sensor it keeps the value expected for this feed and flags a gap that is large (outside ±3σ) or that keeps building (CUSUM).",
    input: "Every sensor tag, each minute, and the expected value for the feed now running.",
    output: "A drift event: which tag, since when, how big, and the likely driver.",
    where: "Unit page step ② · the “What went wrong” line on the home page · “This shift on the unit”.",
    status: "real", statusNote: "Runs on the simulator data as it is.",
  },
  {
    id: "crude", n: 2, name: "Feed model", question: "Is the feed changing, what are its properties, and has the model seen a feed like it?",
    kind: "A feed-property soft sensor plus change detection. It reads the unit’s behaviour (riser ΔT, conversion, coke per feed, regenerator temperature, column ΔT) and estimates the feed’s API gravity every minute; a change is flagged when the estimate leaves its baseline and confirmed once it settles. A novelty score says when the feed is unlike anything trained. The FCC is fed heavy gas oil, so it estimates what the feed will do, not which crude it came from.",
    input: "Those behaviour signals, plus the feed API the schedule declares.",
    output: "Feed changing or settled (and how far through), estimated API ± band, novelty, and a feed class derived from the estimate. The soft sensor resets its lab bias when a new feed settles; every downstream decision says which feed it was sized for and is held while the feed changes or is unfamiliar. It does not set the model weights.",
    where: "Unit page step ② · “Feed arriving” block · “For this feed …” under each decision.",
    status: "real", statusNote: "Feed-API estimate within about 0.2 API on held-out runs; every held-out feed change caught. The simulator records API only — on site also Conradson carbon, K-factor, nitrogen and metals.",
  },
  {
    id: "estimators", n: 3, name: "Quality estimators (soft sensor)", question: "What is the product quality right now, between lab samples?",
    kind: "Four models of different kinds; three are blended, weighted by their accuracy against recent lab results (or held-out runs), and Bayesian ridge is kept as a reference. Where they agree the estimate is trusted; where they split, it is not.",
    input: "Tray temperatures, flows, pumparounds and the feed.",
    output: "The quality now ± its spread, and the chance it is on spec.",
    where: "Unit page step ② · the four bell curves and “estimate between lab samples”.",
    status: "real", statusNote: "Trained on the simulator runs; used for D1, D2 and D9.",
    members: [
      ["Bayesian ridge", "statistical regression; simple and stable"],
      ["Hybrid delta", "physics model plus a data-driven correction"],
      ["PINN ensemble", "neural networks held to the column's boiling-point physics"],
      ["GPR", "Gaussian process; says how unsure it is"],
    ],
  },
  {
    id: "response", n: 4, name: "Response models", question: "If I move this lever, how much does the result move?",
    kind: "A regression for each feed type and lever: the gain from a set point to the result it controls.",
    input: "The lever (set point) and the feed.",
    output: "The gain, e.g. LCO T98 moves 1 : 1 with its set point; cyclone ΔT moves 0.4 °F per 0.01 lb/s of air.",
    where: "Unit page step ③ (the “Try another move” slider) and step ④ (the “Model” line).",
    status: "scripted", statusNote: "Real for the cut point (D1). Scripted for D3, D5, D6, D7.",
  },
  {
    id: "checks", n: 5, name: "Trust checks", question: "Is it safe to advise, or should we wait for the lab?",
    kind: "Fixed rules, not a model: the spread is inside its limit, the models agree, the inputs are inside the training range, and the move stays inside the lever’s window and the SOP step.",
    input: "The estimators’ spread and the proposed move.",
    output: "Pass → the advice is shown. Fail → “Not yet” with the reason, or “pull an extra lab sample”.",
    where: "Unit page step ④ · “Checks before advising”.",
    status: "real", statusNote: "On run s144 they hold the advice back because the models disagree.",
  },
  {
    id: "optimiser", n: 6, name: "Optimiser (set-point search)", question: "How far should we move?",
    kind: "A search for the set-point move that brings the quality to its target (LCO T98 755.3 °F, HN T98 530.3 °F), never below 95 % chance on spec, in 0.5 °F steps of at most 5 °F per SOP step.",
    input: "The estimate, the response model and the limits.",
    output: "The move (from → to), the chance on spec before and after, and which limit set the size of the move.",
    where: "Unit page step ③ (the decision) and step ④ (“What sets the size of the move”).",
    status: "real", statusNote: "Real search; on D3 and D5–D7 it uses the scripted response models.",
  },
  {
    id: "gemini", n: 7, name: "Gemini", question: "Why this move, and what happens if I hold?",
    kind: "A language model that reads the screen you are on and the SOPs. It is read-only and never invents a set point.",
    input: "The decision, its checks, the SOP and the lab history.",
    output: "A plain answer in English, Hinglish or Hindi.",
    where: "“Ask Gemini” on every page.",
    status: "real", statusNote: "Read-only.",
  },
];

export type DecisionId = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9";

export interface DecisionInfo {
  id: DecisionId;
  unit: string;
  unitHref: string | null;
  question: string;
  lever: string;
  parts: PartId[];
  ucs: string[];
  problem: string[];
  status: Status;
  note: string;
}

const U = (id: string) => `/twin/unit/${id}`;

export const DECISIONS: DecisionInfo[] = [
  { id: "D1", unit: "Main fractionator", unitHref: U("unit_4_fractionator"), question: "Move the LCO cut point to its target now, or wait for the lab?",
    lever: "LCO T98 set point (SP_LCO_T98)", parts: ["watch", "crude", "estimators", "response", "checks", "optimiser", "gemini"],
    ucs: ["UC-01", "UC-11"], problem: ["P1"], status: "real", note: "The full chain, end to end." },
  { id: "D2", unit: "Main fractionator", unitHref: U("unit_4_fractionator"), question: "Can the estimate be trusted right now?",
    lever: "None. It decides whether advice is shown at all.", parts: ["estimators", "checks"],
    ucs: ["UC-11", "UC-01"], problem: ["P4"], status: "real", note: "Shows “Not yet” when the models disagree (run s144)." },
  { id: "D9", unit: "Main fractionator", unitHref: U("unit_4_fractionator"), question: "Pull an extra lab sample now?",
    lever: "Lab sampling (no set point)", parts: ["estimators", "checks"],
    ucs: ["UC-11"], problem: ["P1", "P4"], status: "real", note: "Asks for a sample when the estimate is least certain." },
  { id: "D4", unit: "Whole FCC", unitHref: null, question: "Is the feed changing, and what are its properties?",
    lever: "None. Every other decision says which feed it was sized for, and waits while it changes.", parts: ["crude"],
    ucs: ["UC-01", "UC-11"], problem: ["P2"], status: "scripted", note: "Shown in step ② of every unit page, not as a card." },
  { id: "D3", unit: "Main fractionator + riser", unitHref: U("unit_4_fractionator"), question: "Which set points, together, for the new feed?",
    lever: "Riser outlet temperature, LCO and HN T98 set points", parts: ["crude", "estimators", "response", "checks", "optimiser"],
    ucs: ["UC-01", "UC-06"], problem: ["P2", "P3"], status: "scripted", note: "Held back while D2 says the estimate is too uncertain." },
  { id: "D5", unit: "Regenerator", unitHref: U("unit_3_regenerator"), question: "Rebalance regenerator air against riser severity?",
    lever: "Regenerator air — excess O₂ / afterburn (Fair)", parts: ["watch", "crude", "response", "checks", "optimiser"],
    ucs: ["UC-04"], problem: ["P3"], status: "scripted", note: "The afterburn drift event is real; the size of the move is scripted." },
  { id: "D6", unit: "Feed furnace", unitHref: U("unit_1_furnace"), question: "Trim the feed preheat for the new feed (catalyst-to-oil follows)?",
    lever: "Feed preheat — sets catalyst-to-oil and regenerator temperature (SP_T_preheat_F)", parts: ["watch", "crude", "response", "checks", "optimiser"],
    ucs: ["UC-05", "UC-10"], problem: ["P2", "P3"], status: "scripted", note: "Excess O₂ is not a lever in the simulator, so it is not advised." },
  { id: "D7", unit: "Gas plant", unitHref: U("unit_5_condenser"), question: "Move the overhead temperature target to keep the condenser inside its cooling duty?",
    lever: "Overhead temperature target (SP_T_overhead); cooling water stays at fixed duty", parts: ["watch", "crude", "response", "checks", "optimiser"],
    ucs: ["UC-02", "UC-03", "UC-07"], problem: ["P3"], status: "scripted", note: "Cooling-water demand above expected is the fouling signal; cooling water itself is never recommended (fixed duty)." },
  { id: "D8", unit: "Riser (and downstream)", unitHref: U("unit_2_riser"), question: "Act on the riser now, before it reaches the regenerator?",
    lever: "None. Watch with the downstream consequence.", parts: ["watch", "gemini"],
    ucs: ["UC-06", "UC-08", "UC-09"], problem: ["P3"], status: "watch", note: "Traces the knock-on effect; proposes no move." },
];

export const PROBLEMS: Record<string, string> = {
  P1: "Product quality is known only every 8 h from the lab, so the unit runs blind in between.",
  P2: "The crude slate changes every 12–48 h, so the VGO feed changes too; yesterday’s models drift and the right set points for the new feed are unknown.",
  P3: "A move in one unit shows up hours later in another; optimising one section at a time misses the consequence.",
  P4: "An AI that always answers is dangerous; it must say when it does not know and wait for the sample.",
};

export type StageId = "furnace" | "riser" | "regenerator" | "fractionator" | "gasplant" | "stabiliser" | "whole";

export const STAGES: { id: StageId; name: string; href: string | null; role: string }[] = [
  { id: "furnace", name: "Feed furnace", href: "/twin/unit/unit_1_furnace", role: "heats the feed before it meets the catalyst" },
  { id: "riser", name: "Riser reactor", href: "/twin/unit/unit_2_riser", role: "cracks the feed on hot catalyst" },
  { id: "regenerator", name: "Regenerator", href: "/twin/unit/unit_3_regenerator", role: "burns coke off the catalyst with air" },
  { id: "fractionator", name: "Main fractionator", href: "/twin/unit/unit_4_fractionator", role: "splits the cracked vapour into naphtha, LCO and slurry" },
  { id: "gasplant", name: "Gas plant", href: "/twin/unit/unit_5_condenser", role: "condenses the overhead vapour" },
  { id: "stabiliser", name: "Stabiliser", href: "/twin/unit/unit_6_stabiliser", role: "separates LPG from light naphtha" },
  { id: "whole", name: "Across the whole FCC", href: null, role: "problems that span units" },
];

export interface UseCase {
  id: string;
  row: string;
  where: string;
  iocl: string;
  stage: StageId;
  problem: string;
  here: string;
  decisions: DecisionId[];
  status: Status;
}

/** IOCL wording from refinery_optimisation_use_cases.md (unit / process · analytics use case), value column omitted.
 *  "problem" = what goes wrong today at that stage; "here" = how this build addresses it. */
export const USE_CASES: UseCase[] = [
  { id: "UC-05", row: "#5", where: "Fired heaters / furnaces", iocl: "CO and O₂ combustion modelling; flag poor-combustion episodes", stage: "furnace",
    problem: "Combustion is judged by eye on the board. A poor-combustion episode (CO rising while O₂ looks normal) is found late, and after a crude change the preheat is set by habit.",
    here: "The flue-gas CO pattern is flagged automatically, and the cockpit proposes the preheat move for the new feed, with its effect on the riser. Excess O₂ is not a lever in the simulator, so it is not advised.",
    decisions: ["D6"], status: "scripted" },
  { id: "UC-10", row: "#10", where: "Crude-unit furnaces", iocl: "Coke build-up and hydraulic-constraint prediction; anomaly detection", stage: "furnace",
    problem: "Coke builds up slowly. It shows as outlet temperature drifting against fired duty, and nobody tracks that against what is expected for the crude.",
    here: "Partly: the furnace outlet is watched against its expected value for this feed, and a lasting drift is flagged. There is no coke model.",
    decisions: ["D6"], status: "partly" },
  { id: "UC-08", row: "#8", where: "Filtration systems", iocl: "Filter / coalescer breakthrough prediction", stage: "riser",
    problem: "Hydraulic and filter problems build slowly and are noticed only when a limit is hit.",
    here: "Watch only: hydraulic drift in the riser is flagged, with what it will do downstream and when. Not modelled.",
    decisions: ["D8"], status: "watch" },
  { id: "UC-04", row: "#4", where: "Reactor regeneration (CCR / hydroprocessing)", iocl: "Regeneration-cycle tracking and event-based root-cause analysis", stage: "regenerator",
    problem: "Afterburn is noticed when the cyclone temperatures alarm. Whether the air or the riser severity caused it after a crude change is worked out after the event.",
    here: "Cyclone ΔT is tracked against expected; each drift event is logged with its likely cause; an air move is proposed before the limit is reached.",
    decisions: ["D5"], status: "scripted" },
  { id: "UC-01", row: "#1", where: "FCC / RFCC / INDMAX", iocl: "Product-quality inferential (e.g. HGO sulphur soft sensor) to run closer to plan", stage: "fractionator",
    problem: "The LCO and naphtha cut points are known only from the lab, every 8 h. After a crude change the column runs blind for hours, so operators either give away product to stay safe or go off spec.",
    here: "Estimates both cut points every minute, with the chance of being on spec, and advises the cut-point move now or says to wait for the lab. The simulator has no sulphur, so the cut point stands in for it.",
    decisions: ["D1", "D2", "D9", "D3"], status: "real" },
  { id: "UC-11", row: "#11", where: "Product soft sensors", iocl: "Online property prediction between lab samples", stage: "fractionator",
    problem: "Between labs there is no number at all. A single soft sensor gives one value and never says when it should not be trusted.",
    here: "Four estimators of different kinds give a value every minute between labs. When they disagree, the cockpit says “Not yet” and asks for an extra sample instead of guessing.",
    decisions: ["D1", "D2", "D9"], status: "real" },
  { id: "UC-07", row: "#7", where: "Preheat trains / heat exchangers", iocl: "UA-based fouling health signal with degradation tracking", stage: "gasplant",
    problem: "Condenser fouling shows as more cooling water needed for the same load. It is spotted only when the overhead temperature hits its limit on a warm afternoon.",
    here: "Partly: cooling-water demand above expected for the load is flagged as the fouling signal, and the overhead move is proposed. No cleaning planner.",
    decisions: ["D7"], status: "partly" },
  { id: "UC-02", row: "#2", where: "Catalytic reformer", iocl: "Stabiliser-tower overhead optimisation to maximise C5 recovery", stage: "stabiliser",
    problem: "C5 lost into the LPG is found in the next lab, and the overhead temperature is corrected after the fact.",
    here: "The same pattern on the FCC gas plant and stabiliser: the overhead temperature set point is advised against C5 lost to LPG. The reformer itself is not in this build.",
    decisions: ["D7"], status: "scripted" },
  { id: "UC-03", row: "#3", where: "LPG / LSR naphtha system", iocl: "LPG balance and distillation-split optimisation (C4/C5 split)", stage: "stabiliser",
    problem: "The LPG / light-naphtha split is run by experience, and the effect of a move shows up hours later.",
    here: "The split is moved through the same overhead set point, with the expected result shown before you act.",
    decisions: ["D7"], status: "scripted" },
  { id: "UC-06", row: "#6", where: "Multi-unit utilities", iocl: "Energy-management across units", stage: "whole",
    problem: "Each console optimises its own unit. A move in one shows up hours later in another, and no one sees the whole chain.",
    here: "Partly: the D3 recipe sets riser outlet temperature for the new feed (scripted) alongside the D1 cut-point advice, and D8 traces what one unit’s drift does downstream. No energy dashboard.",
    decisions: ["D3", "D8"], status: "partly" },
  { id: "UC-09", row: "#9", where: "Rotating equipment", iocl: "Asset-health monitoring and predictive maintenance", stage: "whole",
    problem: "Compressor and air-blower load rise as a consequence of upstream moves. It is seen on the machine, not traced back to the cause.",
    here: "Watch only: wet-gas compressor and air-blower load appear as consequences in D8. Not modelled.",
    decisions: ["D8"], status: "watch" },
];

export const GLOSSARY: [string, string][] = [
  ["Feed", "What the FCC is being fed: changing or settled, its estimated API and feed class. Used for the bias reset and to hold advice while the feed changes. The crude slate is context only."],
  ["Expected", "What a tag should read for this feed and these settings, from the models."],
  ["σ (sigma)", "The usual noise of a tag. 3σ away from expected is unusual."],
  ["CUSUM", "A running sum of small gaps. It catches a slow drift before any single reading looks bad."],
  ["Spread (W90)", "How far apart the four estimators are. Too wide → the cockpit says “Not yet”."],
  ["Chance on spec", "The probability that the product is inside its spec, from the estimators’ combined bell curve."],
  ["SOP step", "The largest move one step may make under the plant’s operating procedure."],
  ["Plan", "The target the unit is meant to run at."],
  ["Scripted outcome", "An output written to show what the finished tool does. The inputs are real simulator data."],
];

/* ---------------------------------------------------------------- FP-1 front page: the refinery (SDD §14.6E)
 * Owner, 6 Oct 2026 06:51: "a front overview page … details about the refinery, what happens on the top level with
 * sufficient details, and then mention where their use cases fit and then, on that, which we have built."
 * Pins sit where IOCL named the use case; statuses are read from USE_CASES, never copied. No value figures (U3). */

export interface RefineryStep {
  id: string;
  name: string;
  /** One line on screen: what happens at this step. */
  what: string;
  /** Stream arriving from the crude unit, shown on the arrow. */
  stream?: string;
  /** Parts of IOCL's list at this step that this build does not claim. */
  notClaimed?: string;
  fcc?: boolean;
}

export const REFINERY_STEPS: RefineryStep[] = [
  { id: "crude", name: "Crude & tankage",
    what: "Crude arrives by ship or pipeline and is blended; the crude slate changes every 1–2 days." },
  { id: "cdu", name: "Crude unit (CDU / VDU)",
    what: "Preheat train and furnace heat the crude; the column splits it by boiling range into gas, naphtha, kerosene, diesel; the vacuum unit gives heavy gas oil and residue.",
    notClaimed: "CDU / VDU optimisation" },
  { id: "reformer", name: "Reformer", stream: "naphtha",
    what: "Upgrades naphtha to high-octane petrol; its stabiliser recovers C5 from the LPG; CCR regenerates the catalyst." },
  { id: "hydrotreaters", name: "Hydrotreaters", stream: "kerosene · diesel",
    what: "Remove sulphur from kerosene, diesel and FCC feed." },
  { id: "fcc", name: "FCC", stream: "heavy gas oil", fcc: true,
    what: "Cracks heavy gas oil on hot catalyst into petrol, diesel (LCO) and LPG — six units: furnace, riser, regenerator, fractionator, gas plant, stabiliser." },
  { id: "coker", name: "Coker", stream: "residue",
    what: "Turns the heaviest residue into lighter products and coke.", notClaimed: "Coker" },
  { id: "lpg", name: "LPG & alkylation", stream: "LPG · light naphtha",
    what: "Splits LPG and light naphtha (C4 / C5); alkylation makes high-octane blendstock.", notClaimed: "Alkylation" },
  { id: "utilities", name: "Utilities & flare",
    what: "Steam, power, cooling water, fuel gas and the flare, shared by every unit.", notClaimed: "Utilities & flare" },
  { id: "blending", name: "Blending & dispatch",
    what: "Streams are blended to spec and sent out as petrol, diesel and LPG by pipeline, rail and road.", notClaimed: "Pipelines" },
];

export interface UcPin {
  uc: string;
  step: string;
  /** Where the work can be seen in the cockpit. */
  shownOn: string;
  href: string;
  /** IOCL named something outside the FCC; the same problem is shown on the FCC. */
  fccEquivalent: boolean;
}

const UNIT = (id: string) => `/twin/unit/${id}`;

export const UC_PINS: UcPin[] = [
  { uc: "UC-07", step: "cdu", shownOn: "U5 Gas plant", href: UNIT("unit_5_condenser"), fccEquivalent: true },
  { uc: "UC-10", step: "cdu", shownOn: "U1 Furnace", href: UNIT("unit_1_furnace"), fccEquivalent: true },
  { uc: "UC-02", step: "reformer", shownOn: "U6 Stabiliser", href: UNIT("unit_6_stabiliser"), fccEquivalent: true },
  { uc: "UC-04", step: "reformer", shownOn: "U3 Regenerator", href: UNIT("unit_3_regenerator"), fccEquivalent: true },
  { uc: "UC-08", step: "hydrotreaters", shownOn: "U2 Riser", href: UNIT("unit_2_riser"), fccEquivalent: true },
  { uc: "UC-01", step: "fcc", shownOn: "U4 Fractionator", href: UNIT("unit_4_fractionator"), fccEquivalent: false },
  { uc: "UC-11", step: "fcc", shownOn: "U4 Fractionator", href: UNIT("unit_4_fractionator"), fccEquivalent: false },
  { uc: "UC-05", step: "fcc", shownOn: "U1 Furnace", href: UNIT("unit_1_furnace"), fccEquivalent: false },
  { uc: "UC-03", step: "lpg", shownOn: "U6 Stabiliser", href: UNIT("unit_6_stabiliser"), fccEquivalent: true },
  { uc: "UC-06", step: "utilities", shownOn: "FCC Complex", href: "/twin", fccEquivalent: false },
  { uc: "UC-09", step: "utilities", shownOn: "U2 Riser (consequence)", href: UNIT("unit_2_riser"), fccEquivalent: false },
];

/** "2 live · 5 scripted outcome · 3 partly · 2 watch only · rest not claimed", counted from USE_CASES. */
export function statusSummary(ucs: UseCase[] = USE_CASES): string {
  const n = (s: Status) => ucs.filter((u) => u.status === s).length;
  return `${n("real")} interactive · ${n("scripted")} scripted outcome · ${n("partly")} partly · ${n("watch")} watch only · rest not claimed`;
}

/* ---------------------------------------------------------------- FP-2 front page: decisions (SDD §14.6E SDD-FP-06..08)
 * Order follows the oil through the FCC. Text is verbatim from the SDD tables; status is read from DECISIONS. */

export const DECISION_ORDER: DecisionId[] = ["D4", "D6", "D8", "D5", "D1", "D2", "D9", "D3", "D7"];

export interface DecisionCard {
  /** The question as worded on the front page. */
  question: string;
  /** Short qualifier after the status, e.g. "gain measured". */
  statusNote?: string;
  pain: string;
  solve: string;
  dataIn: string;
  algorithms: string;
  checks: string;
  operatorGets: string;
  onYourPlant: string;
  needFromYou: string;
}

export const DECISION_CARD: Record<DecisionId, DecisionCard> = {
  D4: { question: "Is the feed changing, and what are its properties?",
    pain: "The crude slate changes every 12–48 h, so the heavy gas oil the FCC sees changes too; how it cracks (API, carbon) sets every setting from the riser on, and the change does not arrive when the schedule says",
    solve: "Detects the feed change from the unit's own behaviour and how far through it is, estimates the feed's API with a band, flags a feed unlike any trained, and tells every downstream decision which feed it is sized for",
    dataIn: "Coke per feed, riser ΔT, fuel per feed, regenerator temperature, conversion, tray ΔT — every minute; the feed API the schedule declares",
    algorithms: "Feed-property soft sensor (feed API from the unit's behaviour, band from held-out error) → feed-change detection on the estimate → novelty score → feed class derived from the estimate",
    checks: "Feed changing or novelty ≥ 0.5 → riser, preheat, air, cut-point and overhead advice held; estimate far from declared → operator asked to sample the feed",
    operatorGets: "Feed changing / settled and how far through; estimated API ± band; novelty; feed class; the crude slate as context",
    onYourPlant: "Trained on your FCC feed lab history (API, Conradson carbon, K-factor, nitrogen, metals)",
    needFromYou: "Historian tags above, FCC feed lab results, crude schedule" },
  D6: { question: "What preheat for this feed?", statusNote: "gain measured · move on s107 10:00",
    pain: "A heavier feed shifts catalyst-to-oil and regenerator temperature; preheat is set by habit and corrected after the riser reacts",
    solve: "A sized preheat move for this feed, with its effect on riser and regenerator shown before anyone acts",
    dataIn: "Preheat set point and outlet, fired duty, flue-gas CO/O₂, feed rate, riser outlet and regenerator temperatures; the feed (D4)",
    algorithms: "Drift watch (expected value for this feed, ±3σ, CUSUM) → response model (preheat gain; 1.007 °F/°F from 52 simulator step tests) → move = drift ÷ measured gain, capped at the SOP step; chance band scripted → systems check of the effect on riser and regenerator",
    checks: "≤ 5 °F per step, ≥ 20 min between steps, feed-nozzle limit, inputs inside the training range",
    operatorGets: "Preheat from → to, with its effect on riser and regenerator; Accept / Hold / Decline",
    onYourPlant: "Gain refitted from your past preheat moves and a few planned step tests",
    needFromYou: "Furnace and riser tags, SOP step limits, log of past moves" },
  D8: { question: "Act on the riser now, before it reaches the regenerator?",
    pain: "A riser drift shows up hours later in the regenerator, compressor and air blower; each console sees only its own unit",
    solve: "Flags the drift with its downstream consequence and when it will land; no move proposed",
    dataIn: "Riser outlet temperature, conversion, hydraulic signals, catalyst loading; wet-gas compressor and air-blower load",
    algorithms: "Drift watch → cross-unit consequence trace (consequence check, with the time lag to each unit)",
    checks: "Flagged only on a ±3σ breach or a CUSUM that keeps building",
    operatorGets: "A watch item: what is drifting, what it will do downstream, and roughly when. No move",
    onYourPlant: "Time lags learned from your historian",
    needFromYou: "Riser and downstream machine tags" },
  D5: { question: "Rebalance regenerator air against afterburn?",
    pain: "Afterburn is found when the cyclone temperatures alarm; the cause is worked out after the event",
    solve: "Tracks cyclone ΔT against expected for this feed and proposes the air move before the limit, with the likely cause",
    dataIn: "Cyclone ΔT, regenerator bed temperature, air flow, flue-gas O₂/CO, riser severity; the feed (D4)",
    algorithms: "Drift watch on cyclone ΔT → event log with the likely cause (air or riser severity) → response model (≈ 0.4 °F ΔT per 0.01 lb/s air) → optimiser: smallest air move back into band with ≥ 95 % chance",
    checks: "≤ 3 % air per step, ≥ 15 min between steps",
    operatorGets: "Air from → to before the alarm limit; the cause on record",
    onYourPlant: "Gain fitted from your air moves and afterburn history",
    needFromYou: "Regenerator tags, afterburn alarm history, air SOP" },
  D1: { question: "Move the LCO cut point now, or wait for the lab?",
    pain: "Quality is known only from the lab every 8 h; the column runs blind after a crude change, so product is given away or goes off spec",
    solve: "A cut-point estimate every minute with the chance of being on spec, and the move now — or \"wait for the lab\"",
    dataIn: "Tray and draw temperatures, pumparound duties, feed rate — every minute; lab LCO T98 every 8 h, matched to the minute it was drawn; the feed (D4)",
    algorithms: "Three blended estimators (hybrid physics + data · physics-informed neural nets ×5 · Gaussian process; Bayesian ridge shown as a reference only) → combined estimate ± spread and chance on spec → response model (cut point assumed to move 1 : 1 with its set point — a default, as the history has no designed set-point moves) → optimiser: move toward the target T98 (LCO 755.3, HN 530.3 °F) in 0.5 °F steps, never below 95 % chance on spec, ≤ 5 °F per SOP step",
    checks: "Spread ≤ 14 °F, estimators agree, inputs inside the training range, move ≤ 5 °F SOP step; else \"Not yet\" or \"pull a sample\" (D2, D9)",
    operatorGets: "Move from → to, chance on spec before → after; Accept / Hold / Decline to the decision record; nothing written to the control system",
    onYourPlant: "Models retrain on your historian and LIMS history; each new lab re-anchors the estimate",
    needFromYou: "Column tags (1-min), LIMS T98 history, crude schedule, cut-point SOP limits" },
  D2: { question: "Can the estimate be trusted right now?",
    pain: "A single soft sensor always gives a number, even when it should not be trusted",
    solve: "Four different estimators; when they disagree the cockpit says \"Not yet\" and holds every move",
    dataIn: "The four estimators' outputs and their training ranges",
    algorithms: "Trust checks — fixed rules, not a model",
    checks: "Spread (W90) ≤ 14 °F, no split between estimators, inputs inside the training range",
    operatorGets: "Pass → advice shown; fail → \"Not yet\" with the reason, and every move on that product is held",
    onYourPlant: "Limits set with your process engineers",
    needFromYou: "Agreed spec limits and acceptable spread" },
  D9: { question: "Pull an extra lab sample now?",
    pain: "Lab samples follow a fixed round, not the moments of most doubt",
    solve: "Asks for an extra sample exactly when the estimate is least certain",
    dataIn: "Spread, trust state, time to the next scheduled lab",
    algorithms: "Uncertainty trigger",
    checks: "Raised when the spread is ≥ 90 % of its 14 °F limit (or trust is amber/red, or advice is held) and the next lab is ≥ 2 h away",
    operatorGets: "\"Pull a T98 sample now\", with the reason; the result re-anchors the estimate",
    onYourPlant: "Wired to your LIMS sample request",
    needFromYou: "LIMS schedule and sampling procedure" },
  D3: { question: "Which set points, together, for the new feed?",
    pain: "A new feed needs several set points moved together; consoles move one at a time, by trial",
    solve: "A riser outlet temperature move for the new feed, checked against limits, with the cut points left to D1 — held back while D2 says the estimate is too uncertain",
    dataIn: "Everything D1 uses, riser outlet temperature, the feed estimate (D4) and response models per feed type; asked only within 12 h of a confirmed feed change",
    algorithms: "Multi-lever recipe search (riser outlet temperature, LCO and HN T98 set points) → plausibility check of the predicted effects → yield ripple",
    checks: "Released only if D2 passes and the predicted effects are physically plausible; otherwise held with the reason",
    operatorGets: "A recipe of moves to make together, with the yield effect",
    onYourPlant: "Response models per feed type refitted from your data and step tests",
    needFromYou: "Operating history across feeds, FCC feed lab results, SOP limits for each lever" },
  D7: { question: "Move the overhead temperature target?",
    pain: "Condenser fouling and C5 lost to LPG are found late, after the limit is hit or the next lab",
    solve: "Flags cooling-water demand above expected for the load and proposes the overhead move; cooling water stays at fixed duty",
    dataIn: "Overhead temperature, condenser cooling-water flow against load, condenser duty; stabiliser C5 recovery and LPG / naphtha split (lab)",
    algorithms: "Drift watch (cooling water above expected for the load = fouling signal) → response model → optimiser: smallest overhead move that stays inside the fixed cooling duty and the C5 band with ≥ 95 % chance",
    checks: "≤ 3 °F per step; cooling water is never adjusted",
    operatorGets: "Overhead target from → to, with its effect on C5 recovery and the split",
    onYourPlant: "Fitted to your condenser and stabiliser history",
    needFromYou: "Gas-plant and stabiliser tags, LPG / C5 lab results" },
};

export const SCRIPTED_LINE =
  "In this demo the size of the move is scripted on real simulator inputs; on your plant it comes from the models in 2, refitted as in 5.";
export const WATCH_LINE = "Watch only — no move is proposed.";
export const FP2_FOOTER =
  "What we need from your plant: 1-minute historian tags · LIMS lab results · crude assays and schedule · SOP limits for each lever · the decision log. Nothing is written to the control system.";

/** D4 has no single unit page; it is shown in step ② of every unit page, so its link opens U4. */
export const decisionHref = (d: DecisionInfo): string => d.unitHref ?? U("unit_4_fractionator");

export const UC_TITLE: Record<string, string> = Object.fromEntries(USE_CASES.map((u) => [u.id, u.iocl]));
export const PART_NAME: Record<PartId, string> = Object.fromEntries(PARTS.map((p) => [p.id, p.name])) as Record<PartId, string>;

/** Per use case: what goes in, what comes out, how the decision is made, and the value in plant terms (IOCL value area
 *  from the same row of refinery_optimisation_use_cases.md; no value figures by design — owner, 10:16). */
export interface UseCaseDetail {
  inputs: string[];
  outputs: string[];
  decides: string;
  value: string;
  valueArea: string;
  /** Parts this use case actually uses, when narrower than its decisions' parts. */
  parts?: PartId[];
}

export const UC_DETAIL: Record<string, UseCaseDetail> = {
  "UC-01": {
    inputs: ["Tray temperatures and LCO / HN draw temperatures, every minute", "Pumparound duties (PA1–PA4) and feed rate", "The feed now running (part 2)", "The lab LCO T98, every 8 h"],
    outputs: ["LCO T98 now ± its spread, and the chance it is on spec", "The cut-point move (LCO T98 set point, from → to), or “wait for the lab”, or “pull an extra sample”"],
    decides: "The optimiser finds the cut-point move that brings the estimate closest to its target T98 while keeping at least 95 % chance on spec, inside the 5 °F SOP step. It is shown only if all trust checks pass; otherwise the cockpit says wait, or asks for a sample.",
    value: "Hold the cut point at its target between lab results instead of finding a drift 8 h later: fewer off-spec hours after a crude change, fewer re-runs.",
    valueArea: "Yield & quality",
  },
  "UC-11": {
    parts: ["crude", "estimators", "checks"],
    inputs: ["The same column signals, every minute", "The feed now running", "Every lab result, to keep the estimators honest"],
    outputs: ["A quality value every minute between labs, with its spread", "“Not yet” when the estimators disagree, and an extra-sample request"],
    decides: "If the four estimators’ spread is wider than 14 °F or they split into two answers, no advice is given; the cockpit asks for a lab sample instead.",
    value: "Off-spec is seen hours before the lab reports it; lab samples are taken when they add most; less reprocessing.",
    valueArea: "Yield & quality",
  },
  "UC-05": {
    inputs: ["Flue-gas CO and O₂", "Fired duty and preheat outlet temperature", "Feed rate and the feed now running"],
    outputs: ["A poor-combustion flag (CO rising while O₂ looks normal)", "The preheat set-point move, with its effect on the riser"],
    decides: "The smallest preheat move that puts the preheat at this feed's target — the catalyst-to-oil and regenerator temperature follow from it (≥ 95 % chance), inside 5 °F per step, 20 min between steps and the feed-nozzle limit.",
    value: "Less fuel per barrel and fewer CO episodes, with lower CO₂ and NOₓ.",
    valueArea: "Energy",
  },
  "UC-10": {
    parts: ["watch", "crude", "checks"],
    inputs: ["Preheat outlet temperature against fired duty", "The value expected for this feed"],
    outputs: ["A lasting-drift flag on the furnace"],
    decides: "A flag is raised only when the gap is beyond ±3σ or keeps building (CUSUM); no move is proposed from this alone.",
    value: "Coke build-up is seen as a trend, so cleaning can be planned rather than forced.",
    valueArea: "Reliability",
  },
  "UC-08": {
    parts: ["watch", "gemini"],
    inputs: ["Riser conversion and hydraulic signals against expected"],
    outputs: ["A watch item: what will happen downstream, and roughly when"],
    decides: "Watch only. A lasting drift is flagged with its consequence; no move is proposed.",
    value: "Warning before a limit forces a change-out.",
    valueArea: "Reliability",
  },
  "UC-04": {
    inputs: ["Cyclone ΔT (afterburn) and regenerator temperature", "Regenerator air and flue-gas O₂", "Riser severity and the feed now running"],
    outputs: ["A drift event with its likely cause, logged", "The regenerator-air move, from → to"],
    decides: "The smallest air move that brings cyclone ΔT back into its band (≥ 95 % chance), inside 3 % per step and 15 min between steps.",
    value: "Fewer and shorter afterburn episodes; cyclones and catalyst protected; the cause of each event is on record.",
    valueArea: "Yield & quality",
  },
  "UC-07": {
    inputs: ["Condenser cooling-water flow", "Overhead temperature and the load on the condenser"],
    outputs: ["A fouling signal (more cooling water than expected for this load)", "The overhead temperature move"],
    decides: "The smallest overhead-temperature move that brings the condenser back inside its fixed cooling duty (≥ 95 % chance), inside 3 °F per step. Cooling water is not adjusted.",
    value: "The condenser stays inside its limit on warm afternoons; cleaning based on condition, not the calendar.",
    valueArea: "Energy & reliability",
  },
  "UC-02": {
    inputs: ["Stabiliser C5 recovery", "Overhead temperature and cooling water"],
    outputs: ["The overhead temperature move, with its effect on C5 recovery"],
    decides: "Same search: the smallest overhead move that keeps C5 recovery in its band, inside the SOP step.",
    value: "More C5 kept in the gasoline instead of lost to LPG.",
    valueArea: "Yield & quality",
  },
  "UC-03": {
    inputs: ["Stabiliser overhead and bottoms signals", "The feed now running"],
    outputs: ["The overhead move that holds the LPG / light-naphtha split"],
    decides: "The same overhead set point, chosen so both products stay on their split targets.",
    value: "LPG and naphtha stay on target after a crude change.",
    valueArea: "Yield & quality",
  },
  "UC-06": {
    inputs: ["Every unit’s drift and its levers", "The feed now running"],
    outputs: ["A riser move for the new feed (cut points stay with D1)", "The downstream trace of each drift (D8)"],
    decides: "The recipe is released only when the cut-point estimate itself is trusted (D2 passes); otherwise it waits with the reason.",
    value: "Moves chosen for the whole FCC, not one console at a time.",
    valueArea: "Energy",
  },
  "UC-09": {
    parts: ["watch", "gemini"],
    inputs: ["Wet-gas compressor and air-blower load, as consequences of upstream drift"],
    outputs: ["A watch item that names the upstream cause"],
    decides: "Watch only; no move is proposed.",
    value: "Machine load is traced back to its cause upstream.",
    valueArea: "Reliability",
  },
};

/* ---------------------------------------------------------------- on-screen explainers (owner, 14:49)
 * "We have a product build and different screens; we need a how it works there, not as a separate dangler." The unit
 * page carries its own use cases (top) and a how-this-step-works strip under each step ①–④. Use cases always in IOCL
 * order (#1 … #11). */

const ioclRank = (row: string) => (row.startsWith("#") ? Number(row.slice(1)) : 99);
USE_CASES.sort((a, b) => ioclRank(a.row) - ioclRank(b.row));

/** IOCL use cases each unit page explains, in IOCL order. */
export const UNIT_UCS: Record<string, string[]> = {
  refinery: ["UC-06"],
  unit_1_furnace: ["UC-05", "UC-10"],
  unit_2_riser: ["UC-06", "UC-08", "UC-09"],
  unit_3_regenerator: ["UC-04"],
  unit_4_fractionator: ["UC-01", "UC-06", "UC-11"],
  unit_5_condenser: ["UC-02", "UC-03", "UC-07"],
  unit_6_stabiliser: ["UC-02", "UC-03"],
};

export type StepKey = "data" | "observe" | "decide" | "optimise";

export interface StepHow {
  q: string;
  by: string;
  parts: PartId[];
  io: [string, string];
  read: string;
}

export const STEP_HOW: Record<StepKey, StepHow> = {
  data: {
    q: "What is the unit reading right now, and how fresh is it?",
    by: "Plant historian (every minute) and the lab (every 8 h)", parts: [],
    io: ["Every sensor tag on this unit", "The numbers every later step stands on"],
    read: "The drawing shows each live reading where it is measured. The list shows every tag, its value and how old it is.",
  },
  observe: {
    q: "Is something off, has the feed changed, and what is the quality now?",
    by: "", parts: ["watch", "crude", "estimators"],
    io: ["The tags from step ①", "How far the unit has drifted and since when · the feed (changing or settled, estimated API) · the quality now ± its spread and the chance on spec"],
    read: "Top chart: measured against expected. When the two lines part, the unit has drifted. Second chart: the gap, with its ±3σ limits (dashed) and CUSUM (orange). Crossing a dashed line is a breach; a CUSUM that keeps climbing is a slow, lasting drift. Bell curves: what the models believe now, against plan and spec (four estimators on the fractionator, the crude model on other units). The more they overlap, the more the estimate can be trusted.",
  },
  decide: {
    q: "What should be moved, and by how much?",
    by: "", parts: ["response", "optimiser"],
    io: ["The estimate from step ② and the lever’s limits", "The move (from → to) and the chance on spec before → after. Accept / Hold / Decline goes to the decision record only."],
    read: "The slider tries another move and shows what it would do. On the cut points, slide the solid bell onto the dotted target bell; a green tick shows when they match. On other levers: solid bell = now, dashed bell = after the move. The bar under “Levers” shows where the lever sits in its allowed range.",
  },
  optimise: {
    q: "Why this move, and is it safe to advise?",
    by: "", parts: ["checks", "optimiser", "gemini"],
    io: ["The proposed move and the models’ spread", "Every check with its value and limit, and which limit set the size of the move"],
    read: "Green bars pass. If any check fails, the advice turns into “Not yet” with the reason. “What sets the size of the move” says whether the goal, the SOP step or the room to the limit decided it.",
  },
};
