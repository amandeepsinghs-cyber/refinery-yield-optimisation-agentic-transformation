/**
 * "How do we know it worked?" (owner, 3 Oct 2026, 04:24: "how will we actually know if a particular parameter will
 * actually maximise the yield? … they will ask probing questions").
 *
 * The evidence we can show today, kept in one place so it is updated when a check finishes. Plain words, no value
 * figures. `status` is the honest state of each check; nothing here is a claim about IOCL's plant.
 */

export type ProofStatus = "running" | "inside" | "outside" | "inconclusive";

export interface ProofCheck {
  id: string;
  title: string;
  /** what was predicted, in plain words */
  predicted: string;
  /** what the simulator showed (null while running) */
  observed: string | null;
  status: ProofStatus;
  /** when / how it was run */
  how: string;
}

/** Recipe fed back through the simulator (Lever Fit Engineer, task 5; runs launched 3 Oct 03:27 UTC). */
export const RECIPE_CHECK: ProofCheck = {
  id: "recipe_check_v1",
  title: "Recipe fed back through the simulator",
  predicted: "Riser outlet temperature +3.5 °F with the LCO and heavy-naphtha cut points trimmed: conversion up about 0.4 % (0.12 % per °F)",
  observed:
    "Conversion +0.44 % after 1 hour (+0.53 % on average over hours 1–3) against +0.42 % predicted — inside the band. Cut points: with their controllers in manual the riser move pushed both up (LCO at least +19 °F, heavy naphtha +48 °F); once the controllers went back to auto both returned to within 0.2 °F of the run without the recipe. The −1 / +1 °F trims are too small to see against the ±8 °F spread, and with the LCO cut held back part of the conversion gain went back to LCO — so this part is not yet proven.",
  status: "inconclusive",
  how: "Same run (s144) replayed twice from 10:00 — once with the recipe, once without — so any difference is the recipe. Checked 3 Oct 2026: conversion at 13:20 UTC, cut points at 15:40 UTC.",
};

/** Lever test moves measured in the simulator data (gap fit, 3 Oct). */
export const LEVER_FIT: ProofCheck = {
  id: "lever_gap_fit",
  title: "Lever test moves measured in the data",
  predicted: "Each lever moves its target in the direction plant practice expects",
  observed: "Feed preheat: response matches the model. Regenerator: the test moves changed its temperature target, not the air. Condenser: no basis in the simulator yet.",
  status: "inconclusive",
  how: "About 285 designed lever moves across 52 simulated runs, 22–30 usable per lever, checked on held-out runs.",
};

export const PROOF_STATUS_LABEL: Record<ProofStatus, string> = {
  running: "running",
  inside: "inside the predicted band",
  outside: "outside the predicted band",
  inconclusive: "partly confirmed",
};

/** The pilot line (owner ask 4): what turns "shown on simulated data" into "proven on your plant". */
export const PILOT_LINE =
  "On your plant, a short pilot proves each lever before its advice goes live: small step tests inside your operating procedure, measured by your lab, so every gain the cockpit uses is your plant's own.";
