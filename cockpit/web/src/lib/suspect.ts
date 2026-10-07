/**
 * Simulator tags whose values sit outside the normal range of a real FCC and would mislead a refinery engineer
 * (review 2 Oct 2026). They stay on screen, marked "under review", until the simulator is re-checked and rescaled.
 */
export const SUSPECT: Record<string, string> = {
  fluegas_O2_pct: "Simulator value under review: a fired heater normally runs at about 2–3 % excess O₂.",
  fluegas_CO_ppm: "Simulator value under review: flue-gas CO is normally below about 100 ppm.",
  T_tray01_F: "Simulator value under review: unusually cold for a main-fractionator top tray.",
  eff_C3: "Simulator value under review: this reads like a different measure labelled as recovery.",
  eff_C4: "Simulator value under review: this reads like a different measure labelled as recovery.",
  eff_C5: "Simulator value under review: this reads like a different measure labelled as recovery.",
  F5_fuel: "Simulator scale: the number does not match a plant unit, so no unit or limit is shown.",
  power_CAB: "Simulator scale: the number does not match a plant unit, so no unit or limit is shown.",
  power_WGC: "Simulator scale: the number does not match a plant unit, so no unit or limit is shown.",
  dP_reactor_frac: "Simulator scale: the number does not match a plant unit, so no unit or limit is shown.",
  F_regen_cat: "Simulator scale: the number does not match a plant unit, so no unit or limit is shown.",
  F_coke: "Simulator scale: the number does not match a plant unit, so no unit or limit is shown.",
  conversion_pct: "Simulator value under review: conversion above about 85 % is high for an FCC.",
};
export const isSuspect = (tag?: string | null) => !!tag && tag in SUSPECT;
