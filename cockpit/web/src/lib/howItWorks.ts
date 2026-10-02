/**
 * "How it works" content (owner, 2 Oct 2026 14:31–14:33): one page that explains the tool — what each part does, the
 * question it answers, every decision it helps with, and how each ties back to the IOCL use-case list
 * (refinery_optimisation_use_cases.md, "High-value use cases by value area", rows 1–11, plus "Feedstock evaluation"
 * from the catalogue). Decision ids, levers and use-case ids match api/app/engines/decisions.py and scripted.py.
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
    id: "watch", n: 1, name: "Drift-watch agent", question: "Is something off, and since when?",
    kind: "A monitoring agent. For every sensor it keeps the value expected for this crude and flags a gap that is large (outside ±3σ) or that keeps building (CUSUM).",
    input: "Every sensor tag, each minute, and the expected value for the crude now running.",
    output: "A drift event: which tag, since when, how big, and the likely driver.",
    where: "Unit page step ② · the “What went wrong” line on the home page · “This shift on the unit”.",
    status: "real", statusNote: "Runs on the simulator data as it is.",
  },
  {
    id: "crude", n: 2, name: "Crude classifier", question: "Which crude is running, and has the switch finished?",
    kind: "A classification model. It reads the unit’s behaviour (riser ΔT, conversion, coke per feed, regenerator temperature, column ΔT) and names the crude type, with a confidence.",
    input: "Those behaviour signals, plus the crude the schedule declares.",
    output: "Crude R1–R4 with a % confidence and the time the switch was confirmed. Every model below uses this to pick its weights.",
    where: "Unit page step ② · “Which crude is running” block.",
    status: "scripted", statusNote: "Agrees with the lab assay at 93 %, confirmed 12 min after the switch ends.",
  },
  {
    id: "estimators", n: 3, name: "Quality estimators (soft sensor)", question: "What is the product quality right now, between lab samples?",
    kind: "Four models of different kinds, weighted for the crude now running. Where they agree the estimate is trusted; where they split, it is not.",
    input: "Tray temperatures, flows, pumparounds and the crude.",
    output: "The quality now ± its spread, and the chance it is on spec.",
    where: "Unit page step ② · the four bell curves and “estimate between lab samples”.",
    status: "real", statusNote: "Trained on the simulator runs; used for D1, D2 and D9.",
    members: [
      ["Bayesian ridge", "statistical regression; simple and stable"],
      ["Hybrid delta", "physics model plus a data-driven correction"],
      ["PINN ensemble", "neural networks held to the physics (mass and energy balance)"],
      ["GPR", "Gaussian process; says how unsure it is"],
    ],
  },
  {
    id: "response", n: 4, name: "Response models", question: "If I move this lever, how much does the result move?",
    kind: "A regression for each crude and lever: the gain from a set point to the result it controls.",
    input: "The lever (set point) and the crude.",
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
    kind: "A search for the smallest move that lifts the chance of being on spec to 95 % or more, inside the SOP step and the lever’s allowed range.",
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
  { id: "D1", unit: "Main fractionator", unitHref: U("unit_4_fractionator"), question: "Lower the LCO cut point now, or wait for the lab?",
    lever: "LCO T98 set point (SP_LCO_T98)", parts: ["watch", "crude", "estimators", "response", "checks", "optimiser", "gemini"],
    ucs: ["UC-01", "UC-11"], problem: ["P1"], status: "real", note: "The full chain, end to end." },
  { id: "D2", unit: "Main fractionator", unitHref: U("unit_4_fractionator"), question: "Can the estimate be trusted right now?",
    lever: "None. It decides whether advice is shown at all.", parts: ["estimators", "checks"],
    ucs: ["UC-11", "UC-01"], problem: ["P4"], status: "real", note: "Shows “Not yet” when the models disagree (run s144)." },
  { id: "D9", unit: "Main fractionator", unitHref: U("unit_4_fractionator"), question: "Pull an extra lab sample now?",
    lever: "Lab sampling (no set point)", parts: ["estimators", "checks"],
    ucs: ["UC-11"], problem: ["P1", "P4"], status: "real", note: "Asks for a sample when the estimate is least certain." },
  { id: "D4", unit: "Whole FCC", unitHref: null, question: "Which crude is in the unit, and has the switch finished?",
    lever: "None. Every other model uses the answer.", parts: ["crude"],
    ucs: ["FEED"], problem: ["P2"], status: "scripted", note: "Shown in step ② of every unit page, not as a card." },
  { id: "D3", unit: "Main fractionator + riser", unitHref: U("unit_4_fractionator"), question: "Which set points, together, for the new crude?",
    lever: "Riser outlet temperature, LCO and HN T98 set points", parts: ["crude", "estimators", "response", "checks", "optimiser"],
    ucs: ["UC-01", "UC-06"], problem: ["P2", "P3"], status: "scripted", note: "Held back while D2 says the estimate is too uncertain." },
  { id: "D5", unit: "Regenerator", unitHref: U("unit_3_regenerator"), question: "Rebalance regenerator air against riser severity?",
    lever: "Regenerator air (Fair)", parts: ["watch", "crude", "response", "checks", "optimiser"],
    ucs: ["UC-04"], problem: ["P3"], status: "scripted", note: "The afterburn drift event is real; the size of the move is scripted." },
  { id: "D6", unit: "Feed furnace", unitHref: U("unit_1_furnace"), question: "Trim the furnace preheat for the new crude?",
    lever: "Feed preheat set point (SP_T_preheat_F)", parts: ["watch", "crude", "response", "checks", "optimiser"],
    ucs: ["UC-05", "UC-10"], problem: ["P2", "P3"], status: "scripted", note: "Excess O₂ is not a lever in the simulator, so it is not advised." },
  { id: "D7", unit: "Gas plant", unitHref: U("unit_5_condenser"), question: "Raise the overhead temperature or the cooling water?",
    lever: "Overhead temperature set point (SP_T_overhead)", parts: ["watch", "crude", "response", "checks", "optimiser"],
    ucs: ["UC-02", "UC-03", "UC-07"], problem: ["P3"], status: "scripted", note: "Cooling-water demand above expected is the fouling signal." },
  { id: "D8", unit: "Riser (and downstream)", unitHref: U("unit_2_riser"), question: "Act on the riser now, before it reaches the regenerator?",
    lever: "None. Watch with the downstream consequence.", parts: ["watch", "gemini"],
    ucs: ["UC-06", "UC-08", "UC-09"], problem: ["P3"], status: "watch", note: "Traces the knock-on effect; proposes no move." },
];

export const PROBLEMS: Record<string, string> = {
  P1: "Product quality is known only every 8 h from the lab, so the unit runs blind in between.",
  P2: "Crude changes every 12–48 h; yesterday’s models drift and the right set points for the new crude are unknown.",
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
    here: "The flue-gas CO pattern is flagged automatically, and the cockpit proposes the preheat move for the new crude, with its effect on the riser. Excess O₂ is not a lever in the simulator, so it is not advised.",
    decisions: ["D6"], status: "scripted" },
  { id: "UC-10", row: "#10", where: "Crude-unit furnaces", iocl: "Coke build-up and hydraulic-constraint prediction; anomaly detection", stage: "furnace",
    problem: "Coke builds up slowly. It shows as outlet temperature drifting against fired duty, and nobody tracks that against what is expected for the crude.",
    here: "Partly: the furnace outlet is watched against its expected value for this crude, and a lasting drift is flagged. There is no coke model.",
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
  { id: "FEED", row: "Catalogue", where: "Scheduling and planning", iocl: "Feedstock evaluation", stage: "whole",
    problem: "The schedule says which crude is coming, but not when it really reaches the unit or whether it behaves as assayed. Every model tuned on yesterday’s crude is now wrong.",
    here: "The crude classifier names the crude from the unit’s own behaviour and confirms when the switch is done; every model then re-weights for it.",
    decisions: ["D4"], status: "scripted" },
  { id: "UC-06", row: "#6", where: "Multi-unit utilities", iocl: "Energy-management across units", stage: "whole",
    problem: "Each console optimises its own unit. A move in one shows up hours later in another, and no one sees the whole chain.",
    here: "Partly: the D3 recipe moves several set points together, and D8 traces what one unit’s drift does downstream. No energy dashboard.",
    decisions: ["D3", "D8"], status: "partly" },
  { id: "UC-09", row: "#9", where: "Rotating equipment", iocl: "Asset-health monitoring and predictive maintenance", stage: "whole",
    problem: "Compressor and air-blower load rise as a consequence of upstream moves. It is seen on the machine, not traced back to the cause.",
    here: "Watch only: wet-gas compressor and air-blower load appear as consequences in D8. Not modelled.",
    decisions: ["D8"], status: "watch" },
];

export const GLOSSARY: [string, string][] = [
  ["Crude / regime", "The crude type now in the unit (R1 Heavy … R4 Light). Models are weighted for it."],
  ["Expected", "What a tag should read for this crude and these settings, from the models."],
  ["σ (sigma)", "The usual noise of a tag. 3σ away from expected is unusual."],
  ["CUSUM", "A running sum of small gaps. It catches a slow drift before any single reading looks bad."],
  ["Spread (W90)", "How far apart the four estimators are. Too wide → the cockpit says “Not yet”."],
  ["Chance on spec", "The probability that the product is inside its spec, from the estimators’ combined bell curve."],
  ["SOP step", "The largest move one step may make under the plant’s operating procedure."],
  ["Plan", "The target the unit is meant to run at."],
  ["Scripted outcome", "An output written to show what the finished tool does. The inputs are real simulator data."],
];

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
    inputs: ["Tray temperatures and LCO / HN draw temperatures, every minute", "Pumparound duties (PA1–PA4) and feed rate", "The crude now running (part 2)", "The lab LCO T98, every 8 h"],
    outputs: ["LCO T98 now ± its spread, and the chance it is on spec", "The cut-point move (LCO T98 set point, from → to), or “wait for the lab”, or “pull an extra sample”"],
    decides: "The optimiser finds the smallest cut-point move that lifts the chance of being on spec to 95 % or more, inside the 5 °F SOP step. It is shown only if all trust checks pass; otherwise the cockpit says wait, or asks for a sample.",
    value: "Run the cut point close to its spec instead of with a safety margin: more product kept in the right stream, fewer off-spec hours after a crude change, fewer re-runs.",
    valueArea: "Yield & quality",
  },
  "UC-11": {
    parts: ["crude", "estimators", "checks"],
    inputs: ["The same column signals, every minute", "The crude now running", "Every lab result, to keep the estimators honest"],
    outputs: ["A quality value every minute between labs, with its spread", "“Not yet” when the estimators disagree, and an extra-sample request"],
    decides: "If the four estimators’ spread is wider than 14 °F or they split into two answers, no advice is given; the cockpit asks for a lab sample instead.",
    value: "Off-spec is seen hours before the lab reports it; lab samples are taken when they add most; less reprocessing.",
    valueArea: "Yield & quality",
  },
  "UC-05": {
    inputs: ["Flue-gas CO and O₂", "Fired duty and preheat outlet temperature", "Feed rate and the crude now running"],
    outputs: ["A poor-combustion flag (CO rising while O₂ looks normal)", "The preheat set-point move, with its effect on the riser"],
    decides: "The smallest preheat move that brings the outlet temperature back into its band (≥ 95 % chance), inside 5 °F per step and 20 min between steps.",
    value: "Less fuel per barrel and fewer CO episodes, with lower CO₂ and NOₓ.",
    valueArea: "Energy",
  },
  "UC-10": {
    parts: ["watch", "crude", "checks"],
    inputs: ["Preheat outlet temperature against fired duty", "The value expected for this crude"],
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
    inputs: ["Cyclone ΔT (afterburn) and regenerator temperature", "Regenerator air and flue-gas O₂", "Riser severity and the crude now running"],
    outputs: ["A drift event with its likely cause, logged", "The regenerator-air move, from → to"],
    decides: "The smallest air move that brings cyclone ΔT back into its band (≥ 95 % chance), inside 3 % per step and 15 min between steps.",
    value: "Fewer and shorter afterburn episodes; cyclones and catalyst protected; the cause of each event is on record.",
    valueArea: "Yield & quality",
  },
  "UC-07": {
    inputs: ["Condenser cooling-water flow", "Overhead temperature and the load on the condenser"],
    outputs: ["A fouling signal (more cooling water than expected for this load)", "The overhead temperature move"],
    decides: "The smallest overhead-temperature move that brings cooling-water demand back into its band (≥ 95 % chance), inside 3 °F per step.",
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
    inputs: ["Stabiliser overhead and bottoms signals", "The crude now running"],
    outputs: ["The overhead move that holds the LPG / light-naphtha split"],
    decides: "The same overhead set point, chosen so both products stay on their split targets.",
    value: "LPG and naphtha stay on target after a crude change.",
    valueArea: "Yield & quality",
  },
  "FEED": {
    inputs: ["Riser ΔT, conversion, coke per feed, regenerator temperature, column ΔT", "The crude the schedule declares"],
    outputs: ["The crude now running (R1–R4) with a % confidence", "The time the switch is confirmed"],
    decides: "The switch is confirmed once one crude is clearly ahead and stays ahead; every other model then re-weights for it.",
    value: "Models switch to the new crude when it really arrives, not when the schedule says it should.",
    valueArea: "Scheduling & planning",
  },
  "UC-06": {
    inputs: ["Every unit’s drift and its levers", "The crude now running"],
    outputs: ["A recipe of several set points moved together", "The downstream trace of each drift (D8)"],
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
