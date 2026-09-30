#!/usr/bin/env python3
"""Generate WP1: 8 SOP documents in knowledge/corpus/sop/"""
import pathlib, json

CORPUS_ROOT = pathlib.Path(__file__).resolve().parent.parent / "corpus" / "sop"
CORPUS_ROOT.mkdir(parents=True, exist_ok=True)

def write_sop(doc_id, title, revision, effective_date, owner_role, tags, events, related, summary, sections):
    front = [
        "---",
        f"doc_id: {doc_id}",
        f"title: \"{title}\"",
        "doc_type: SOP",
        f"revision: {revision}",
        f"effective_date: {effective_date}",
        f"owner_role: \"{owner_role}\"",
        "unit: FCC-21",
        "status: SIMULATED",
        f"related_tags: {json.dumps(tags)}",
        f"related_events: {json.dumps(events)}",
        f"related_docs: {json.dumps(related)}",
        f"summary: \"{summary}\"",
        "---",
        "",
        "> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.",
        ""
    ]
    body = []
    for s_num, s_title, s_text in sections:
        level = "##" if s_num.count(".") == 0 else "###"
        body.append(f"{level} {s_num} {s_title}")
        body.append("")
        body.append(s_text.strip())
        body.append("")

    full_txt = "\n".join(front) + "\n".join(body)
    out_path = CORPUS_ROOT / f"{doc_id}.md"
    out_path.write_text(full_txt, encoding="utf-8")
    print(f"Wrote {out_path}")

# SOP-FRAC-001
write_sop(
    doc_id="SOP-FRAC-001",
    title="Fractionator normal operation and monitoring",
    revision=3,
    effective_date="2025-09-15",
    owner_role="Process engineer (fractionation)",
    tags=["P5_frac_psia", "T_tray01_F", "T_tray06_F", "T_tray13_F", "T_tray20_F", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4", "MV_reflux_ratio", "MV_cw_flow", "LCO_T98_F", "HN_T98_F"],
    events=[],
    related=["IOW-FRAC-01", "IOW-HX-03", "SOP-APC-007", "SOP-LAB-008", "LAB-QC-02"],
    summary="Standard operating procedure for routine main fractionator monitoring, hydraulic stability, pumparound heat extraction, and product cut-point surveillance on FCC-21.",
    sections=[
        ("1", "Purpose", "This procedure defines operational requirements for continuous monitoring of the FCC-21 main fractionator to ensure hydraulic stability, sharp product fractionation, and equipment integrity."),
        ("2", "Scope", "Applies to board operators and fractionation engineers supervising column pressure, tray temperatures, pumparound circuits, and distillation cuts."),
        ("3", "Safety and prerequisites", "Confirm all operating parameters are within integrity windows [IOW-FRAC-01 r2 §3.1] and [IOW-HX-03 r1 §3.2]. The soft-sensor cockpit must indicate GREEN or AMBER trust before adjusting baseline controller set points."),
        ("4", "Procedure", "Execute the following continuous monitoring and verification sequence on each 8-hour shift."),
        ("4.1", "Monitor main fractionator pressure and overhead temperature", "4.1.1 Verify fractionator overhead pressure P5_frac_psia remains stable at nominal 24.9 psia within ±0.5 psia.\n4.1.2 Check overhead vapor temperature T_tray01_F at nominal 310.7 °F; ensure deviations do not exceed 3 °F over 15 min.\n4.1.3 Inspect wet gas compressor suction pressure to verify stable column differential pressure."),
        ("4.2", "Supervise pumparound duty distribution", "4.2.1 Verify heat extraction across circuits MV_PA1, MV_PA2, MV_PA3, and MV_PA4 meets standard enthalpy balance profiles.\n4.2.2 Ensure top pumparound MV_PA1 maintains column top internal reflux without inducing tray weeping.\n4.2.3 Confirm mid-column pumparound MV_PA2 maintains LCO section thermal gradient within ±2 °F of target."),
        ("4.3", "Track bottom slurry circulation and column differential pressure", "4.3.1 Maintain bottoms quench circulation to prevent thermal coking in the bottom sump and grid trays.\n4.3.2 Monitor column total differential pressure across bottom tray 20 T_tray20_F and tray 1 to detect incipient entrainment."),
        ("4.4", "Oversee stripping steam injection rates", "4.4.1 Ensure side-stripper superheated steam rates to the LCO and HN strippers meet minimum mass flow ratios.\n4.4.2 Confirm stripper bottom liquid seals are intact to prevent vapor blow-through."),
        ("4.5", "Log product draw temperatures and hydraulic loading", "4.5.1 Log heavy naphtha draw tray temperature T_tray06_F at nominal 363.4 °F.\n4.5.2 Log light cycle oil draw tray temperature T_tray13_F at nominal 476.4 °F.\n4.5.3 Verify product draw control valves operate in their linear throttling band (30% to 75% opening)."),
        ("4.6", "Cross-check board indications against field transmitter pairs", "4.6.1 Compare DCS indicated tray temperatures against redundant field thermocouples.\n4.6.2 Investigate any sensor pair divergence exceeding 2.0 °F immediately to prevent unobserved cut-point drift."),
        ("5", "Verification and lab confirmation", "Routine lab samples must be drawn per [SOP-LAB-008 r3 §4.1] at scheduled shift intervals (06:00, 14:00, 22:00). Laboratory distillation results are reconciled via [LAB-QC-02 r1 §4.2]. If the difference between lab D86 T98 and the soft-sensor prediction exceeds reproducibility R = 7 °F, flag potential sensor drift."),
        ("6", "Abnormal conditions and escalation", "If soft-sensor trust degrades to RED, or if the spread gate displays 'Distribution spread too wide — no recommendation issued', hold all advisory moves. If lab discrepancy exceeds R = 7 °F, switch cut-point controllers to manual and notify the fractionation engineer Dr. Leila Haddad. During active crude changeovers, suspend non-essential set-point adjustments."),
        ("7", "References", "Fractionator Operating Windows [IOW-FRAC-01 r2 §1] and Soft-Sensor Guidance [SOP-APC-007 r1 §1]."),
        ("8", "Revision history", "Revision 3 approved 2025-09-15 by Dr. Leila Haddad; incorporated refined pumparound balance criteria and advisory cockpit integration.")
    ]
)

# SOP-FRAC-002
write_sop(
    doc_id="SOP-FRAC-002",
    title="Crude changeover on the FCC and fractionator (event 1)",
    revision=5,
    effective_date="2025-06-02",
    owner_role="Operations superintendent",
    tags=["dist_feed_API", "crude_id", "LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F", "SP_LCO_T98", "SP_HN_T98", "MV_PA2"],
    events=[1],
    related=["IOW-FRAC-01", "SOP-FRAC-003", "SOP-LAB-008", "MOC-0124"],
    summary="Standard procedure governing operational adjustments and fractionator stabilization during FCC fresh feed crude switches and API gravity ramps.",
    sections=[
        ("1", "Purpose", "Specifies operational protocols for transitioning the FCC-21 unit between fresh feed crude slates, managing distillation cut impacts and preventing off-spec excursions."),
        ("2", "Scope", "Covers board operators and shift supervisors managing feed API gravity transitions and intermediate pumparound adjustments."),
        ("3", "Safety and prerequisites", "Ensure column operating parameters comply with [IOW-FRAC-01 r2 §3.2]. Verify crude tank alignment and analytical lab readiness in accordance with [MOC-0124 r1 §1]."),
        ("4", "Procedure", "Follow this sequence when executing a planned crude changeover (Event Code 1)."),
        ("4.1", "Pre-changeover verification and feedstock alignment", "4.1.1 Confirm target crude assay API gravity (between 20 and 29 API).\n4.1.2 Verify tank farm suction alignment and upstream booster pump head.\n4.1.3 Record baseline feed API on tag dist_feed_API and note current crude_id."),
        ("4.2", "Initiate feed API ramp and crude identification index increment", "4.2.1 Initiate the scheduled 60-minute feed API transition ramp.\n4.2.2 Verify tag dist_feed_API moves toward the target slate at steady rate.\n4.2.3 Observe increment in crude_id to index the new feed slate in unit automation."),
        ("4.3", "Adjust column heat removal and intermediate pumparound duties", "4.3.1 For heavy crude shifts (lower API), anticipate heavier gas oil loading; increase MV_PA2 duty proactively.\n4.3.2 For light crude shifts (higher API), monitor top column vapor velocity and increase MV_PA1 duty.\n4.3.3 Track tray 13 temperature T_tray13_F to counter transient thermal distortion within 20 min."),
        ("4.4", "Stabilize heavy naphtha and light cycle oil draw rates", "4.4.1 Maintain draw rates in proportion to altered cut yields.\n4.4.2 Ensure stripper level controllers remain within 40% to 65% throttling range."),
        ("4.5", "Enforce hold on product cut-point adjustments during crude transition", "4.5.1 Freeze cut-point set points SP_LCO_T98 and SP_HN_T98 throughout the transition.\n4.5.2 Do not attempt manual cut-point optimization until the 60-minute ramp is complete and column hydraulics restabilize."),
        ("4.6", "Complete transition verification and log post-switch operating state", "4.6.1 Confirm dist_feed_API has settled at the new steady target value.\n4.6.2 Log completion time, final pumparound duties, and stable tray temperature profile."),
        ("5", "Verification and lab confirmation", "Request an expedited verification sample per [SOP-LAB-008 r3 §4.1] 60 minutes after ramp completion. Cut-point adjustments under [SOP-FRAC-003 r4 §4.1] must remain held until the first post-change lab distillation confirms product quality or the soft sensor establishes steady GREEN trust."),
        ("6", "Abnormal conditions and escalation", "If tray flooding or severe vapor carryover occurs, refer to [IOW-FRAC-01 r2 §4] and trim fresh feed rate. If product endpoints exceed standard operating windows, notify Operations superintendent Nadia Khan."),
        ("7", "References", "Fractionator Limits [IOW-FRAC-01 r2 §1] and Lab Frequency Protocol [MOC-0124 r1 §1]."),
        ("8", "Revision history", "Revision 5 approved 2025-06-02 by Nadia Khan; updated mandatory 60-min hold rule following crude transition analysis.")
    ]
)

# SOP-FRAC-003
write_sop(
    doc_id="SOP-FRAC-003",
    title="LCO cut-point (T98) adjustment (event 5)",
    revision=4,
    effective_date="2026-02-10",
    owner_role="Process engineer (fractionation)",
    tags=["LCO_T98_F", "SP_LCO_T98", "T_tray13_F", "MV_PA2", "prod_LCO", "cutpoint_auto"],
    events=[5],
    related=["IOW-FRAC-01", "SOP-APC-007", "SOP-LAB-008", "MOC-0118", "MOC-0131"],
    summary="Operating procedure for adjusting the Light Cycle Oil T98 distillation cut-point set point, enforcing move step limits and advisory spread gates.",
    sections=[
        ("1", "Purpose", "Governs the procedure for making controlled adjustments to the Light Cycle Oil (LCO) T98 distillation cut-point, utilizing advisory soft-sensor recommendations."),
        ("2", "Scope", "Applies to board operators and process control engineers modifying LCO product specification targets on FCC-21."),
        ("3", "Safety and prerequisites", "Verify current LCO T98 is within [IOW-FRAC-01 r2 §3.2]. Soft-sensor advisory deployment must comply with governance mandates in [MOC-0118 r1 §1] and spread criteria in [MOC-0131 r1 §1]."),
        ("4", "Procedure", "Execute the following steps when adjusting LCO cut-point set point SP_LCO_T98 (Event Code 5)."),
        ("4.1", "Evaluate current LCO cut-point and cockpit advisory recommendations", "4.1.1 Review current LCO_T98_F against target specification.\n4.1.2 Inspect the soft-sensor advisory recommendation displayed in the cockpit interface.\n4.1.3 Acknowledge that cockpit recommendations are advisory only; 'Accept' records the human decision and does not write to DCS."),
        ("4.2", "Confirm advisory spread-gate status and model agreement", "4.2.1 Check the 90% confidence interval width W90; if W90 > 14 °F, the spread gate is active.\n4.2.2 If the cockpit displays 'Distribution spread too wide — no recommendation issued', no cut-point move is permitted.\n4.2.3 Ensure the multi-model mixture is unimodal with consistent model agreement."),
        ("4.3", "Apply incremental set-point adjustment to SP_LCO_T98", "4.3.1 Adjust SP_LCO_T98 by no more than 5.0 °F per single step move.\n4.3.2 Wait a minimum spacing of 30 minutes between consecutive set-point steps to allow column settling.\n4.3.3 Implement the move via the board operator station with a standard 20-minute ramp."),
        ("4.4", "Trim tray 13 draw temperature and pumparound PA2 flow", "4.4.1 Monitor LCO draw tray temperature T_tray13_F; expect a response of 3 °F to 6 °F within 20 min.\n4.4.2 Modulate pumparound circuit MV_PA2 as required to support the new section heat balance."),
        ("4.5", "Monitor column separation profile and downstream product yield", "4.5.1 Track product yield tag prod_LCO and check for secondary shifts in heavy naphtha endpoint.\n4.5.2 Confirm cutpoint_auto status transitions appropriately during automated trim cycles."),
        ("4.6", "Document set-point move and lock advisory record in logbook", "4.6.1 Record initial SP, step magnitude, and final SP in the console handover log.\n4.6.2 Log operator acceptance timestamp and soft-sensor confidence metrics."),
        ("5", "Verification and lab confirmation", "Obtain confirmation lab distillation per [SOP-LAB-008 r3 §4.1]. Soft-sensor tracking is verified against laboratory measurements per [SOP-APC-007 r1 §4.2]. If laboratory D86 T98 disagrees by more than R = 7 °F, recalibration protocols are triggered."),
        ("6", "Abnormal conditions and escalation", "If LCO T98 exceeds 760 °F, initiate immediate downward trim. If T98 reaches critical high 765 °F, refer to [IOW-FRAC-01 r2 §4] for emergency cooling and rate reduction. Escalate persistent off-spec states to Dr. Leila Haddad."),
        ("7", "References", "Fractionator IOW [IOW-FRAC-01 r2 §1] and Soft-Sensor Operating Rules [SOP-APC-007 r1 §1]."),
        ("8", "Revision history", "Revision 4 approved 2026-02-10 by Dr. Leila Haddad; added advisory spread-gate 14 °F gating logic.")
    ]
)

# SOP-FRAC-004
write_sop(
    doc_id="SOP-FRAC-004",
    title="Heavy naphtha cut-point (T98) adjustment (event 6)",
    revision=2,
    effective_date="2025-11-20",
    owner_role="Process engineer (fractionation)",
    tags=["HN_T98_F", "SP_HN_T98", "T_tray06_F", "MV_PA1", "prod_HN", "cutpoint_auto"],
    events=[6],
    related=["IOW-FRAC-01", "SOP-APC-007", "SOP-LAB-008"],
    summary="Operating procedure for adjusting Heavy Naphtha T98 distillation endpoint, defining step limits and cockpit advisory interaction.",
    sections=[
        ("1", "Purpose", "Specifies the procedure for making controlled adjustments to the Heavy Naphtha (HN) T98 distillation endpoint on the main fractionator."),
        ("2", "Scope", "Covers console operators adjusting HN cut-points to meet reformer feed specifications."),
        ("3", "Safety and prerequisites", "Confirm operating status complies with [IOW-FRAC-01 r2 §3.1]. Ensure soft-sensor trust is GREEN or AMBER prior to initiating moves."),
        ("4", "Procedure", "Follow this sequence when executing HN cut-point moves (Event Code 6)."),
        ("4.1", "Review current heavy naphtha endpoint and quality targets", "4.1.1 Inspect current indicated HN_T98_F against the target specification (nominal 530.3 °F).\n4.1.2 Verify downstream reformer feed requirements and intermediate tankage ullage."),
        ("4.2", "Validate cockpit advisory confidence and spread gate", "4.2.1 Check cockpit status to verify spread gate is open and trust score is acceptable.\n4.2.2 If the spread gate displays WITHHELD status, suspend set-point adjustment until uncertainty narrows."),
        ("4.3", "Implement step changes on SP_HN_T98", "4.3.1 Apply set-point adjustment to SP_HN_T98 with a maximum step size of 3.0 °F.\n4.3.2 Enforce a mandatory wait interval of at least 30 minutes between moves.\n4.3.3 Ramp the set-point move over a standard 20-minute period."),
        ("4.4", "Adjust tray 6 draw temperature and top reflux duty", "4.4.1 Observe heavy naphtha draw tray temperature T_tray06_F; verify response within 15 min.\n4.4.2 Trim top pumparound MV_PA1 and top reflux ratio MV_reflux_ratio to maintain separation sharpness."),
        ("4.5", "Monitor gasoline yield and downstream reformer feed specs", "4.5.1 Track prod_HN yield tag and inspect wet gas compressor suction pressure.\n4.5.2 Verify that cutpoint_auto mode functions smoothly when active."),
        ("4.6", "Record set-point modification and operator rationale", "4.6.1 Document time, initial SP, final SP, and cockpit confidence index in the electronic logbook."),
        ("5", "Verification and lab confirmation", "Verify adjustment via scheduled lab distillation per [SOP-LAB-008 r3 §4.1]. Check soft-sensor model tracking per [SOP-APC-007 r1 §4.2]; discrepancy must remain within R = 7 °F."),
        ("6", "Abnormal conditions and escalation", "If HN T98 exceeds standard high limit 535 °F, trim set point down immediately. If temperature approaches critical high limit 540 °F, execute escalation steps in [IOW-FRAC-01 r2 §4]."),
        ("7", "References", "Fractionator IOWs [IOW-FRAC-01 r2 §1] and Cockpit SOP [SOP-APC-007 r1 §1]."),
        ("8", "Revision history", "Revision 2 approved 2025-11-20 by Dr. Leila Haddad; tightened single-step move size from 5 °F to 3 °F.")
    ]
)

# SOP-FCC-005
write_sop(
    doc_id="SOP-FCC-005",
    title="Riser outlet temperature and feed-rate changes (events 2, 3)",
    revision=3,
    effective_date="2025-03-18",
    owner_role="Operations superintendent",
    tags=["Tr_riser_F", "SP_T_riser_ROT_F", "feed_flow_lb_s", "Treg_F", "fluegas_O2_pct", "conversion_pct"],
    events=[2, 3],
    related=["IOW-FCC-02", "SOP-FRAC-001"],
    summary="Standard operating procedure for executing controlled changes to reactor riser outlet temperature and fresh feed throughput on FCC-21.",
    sections=[
        ("1", "Purpose", "Defines the operating procedure for modifying reactor riser outlet temperature (ROT) and unit fresh feed rate while preserving heat balance and catalyst circulation stability."),
        ("2", "Scope", "Applies to operations supervisors and board operators manipulating reactor severity and throughput on FCC-21."),
        ("3", "Safety and prerequisites", "Verify reactor and regenerator parameters reside within windows specified in [IOW-FCC-02 r2 §3.1]. Ensure air blower capacity and wet gas compressor margins are verified."),
        ("4", "Procedure", "Follow these sequential steps when adjusting throughput (Event 2) or ROT (Event 3)."),
        ("4.1", "Verify reactor inventory and regenerator thermal balance", "4.1.1 Verify regenerator dense bed temperature Treg_F is stable at nominal 1250 °F.\n4.1.2 Confirm flue gas oxygen fluegas_O2_pct is between 1.0% and 2.5%.\n4.1.3 Check catalyst standpipe differential pressure and slide valve positions."),
        ("4.2", "Implement fresh feed flow rate ramp", "4.2.1 Execute feed rate changes on tag feed_flow_lb_s within ±5% of nominal 165 lb/s.\n4.2.2 Apply a linear 30-minute ramp rate to prevent hydraulic surges in the fractionator.\n4.2.3 Coordinate with preheat furnace firing to preserve feed inlet temperature."),
        ("4.3", "Adjust riser outlet temperature set point", "4.3.1 Adjust SP_T_riser_ROT_F within nominal 969 °F ±5 °F.\n4.3.2 Implement adjustments using a 10-minute linear ramp.\n4.3.3 Observe riser top thermocouple Tr_riser_F tracking the set point smoothly."),
        ("4.4", "Coordinate combustion air and catalyst slide valve positioning", "4.4.1 Modulate catalyst slide valve to sustain target catalyst-to-oil ratio.\n4.4.2 Trim main combustion air blower to balance carbon burn rate and prevent afterburning."),
        ("4.5", "Compensate fractionator heat balance and pumparound extraction", "4.5.1 Pre-adjust fractionator pumparounds per [SOP-FRAC-001 r3 §4.1] in anticipation of vapor rate shifts.\n4.5.2 Counteract transient endpoint drift caused by altered crack conversion conversion_pct."),
        ("4.6", "Document reactor severity shift and verify steady state conversion", "4.6.1 Log final feed rate, ROT set point, regenerator bed temperature, and conversion index."),
        ("5", "Verification and lab confirmation", "Verify fractionator profile stability under [SOP-FRAC-001 r3 §4.1] following any ROT or throughput change."),
        ("6", "Abnormal conditions and escalation", "If regenerator temperature exceeds 1300 °F or air blower reaches surge limit, reverse moves per [IOW-FCC-02 r2 §4] and notify Nadia Khan."),
        ("7", "References", "Reactor/Regenerator IOW [IOW-FCC-02 r2 §1]."),
        ("8", "Revision history", "Revision 3 approved 2025-03-18 by Nadia Khan; refined ramp rates and slide valve throttling constraints.")
    ]
)

# SOP-FCC-006
write_sop(
    doc_id="SOP-FCC-006",
    title="Feed preheat temperature upsets (event 4)",
    revision=2,
    effective_date="2024-12-05",
    owner_role="Process engineer (fractionation)",
    tags=["dist_T_feed_in_F", "Tr_riser_F", "Treg_F", "feed_flow_lb_s", "valve_V8"],
    events=[4],
    related=["IOW-FCC-02", "IOW-HX-03"],
    summary="Mitigation procedure for managing upstream feed preheat temperature excursions and restoring reactor thermal equilibrium.",
    sections=[
        ("1", "Purpose", "Provides actionable steps for identifying, mitigating, and stabilizing feed preheat temperature excursions on the FCC fresh feed train."),
        ("2", "Scope", "Covers operating personnel responding to feed temperature upsets (Event 4) affecting reactor heat balance."),
        ("3", "Safety and prerequisites", "Operating boundaries must adhere to [IOW-FCC-02 r2 §3.2] and preheat exchanger limits in [IOW-HX-03 r1 §3.1]."),
        ("4", "Procedure", "Execute the following mitigation protocol upon detecting feed preheat deviations."),
        ("4.1", "Identify feed preheat temperature deviations", "4.1.1 Detect deviations in tag dist_T_feed_in_F from nominal 460.9 °F (disturbances of -20 °F to +10 °F).\n4.1.2 Verify whether upset originated from upstream heat exchanger fouling or preheat furnace fuel gas pressure swings.\n4.1.3 Assess rate of temperature decline over a 30-minute ramp window."),
        ("4.2", "Adjust preheat furnace firing and convection bank dampers", "4.2.1 Trim fuel gas firing rate to restore convection pass inlet temperatures.\n4.2.2 Check stack draft and damper alignment to ensure complete combustion."),
        ("4.3", "Modulate regenerated catalyst slide valve to sustain riser outlet temperature", "4.3.1 As feed temperature drops, observe slide valve valve_V8 opening to increase hot catalyst circulation.\n4.3.2 Monitor Tr_riser_F to prevent sudden chilling of the reaction mix."),
        ("4.4", "Compensate regenerator dense bed temperature dynamics", "4.4.1 Monitor regenerator bed temperature Treg_F for secondary cooling due to increased catalyst withdrawal.\n4.4.2 Adjust combustion air flow to preserve catalyst regeneration kinetics."),
        ("4.5", "Rebalance fractionator bottom pumparound duty", "4.5.1 Reduce bottom pumparound heat removal if reactor effluent enthalpy drops.\n4.5.2 Maintain slurry circulating temperature above minimum dew point."),
        ("4.6", "Stabilize feed preheat loop at nominal 460.9 °F", "4.6.1 Confirm dist_T_feed_in_F stabilizes at 460.9 °F.\n4.6.2 Verify catalyst-to-oil ratio and slide valve differential pressure return to baseline."),
        ("5", "Verification and lab confirmation", "Verify reactor operating parameters return to compliant ranges in [IOW-FCC-02 r2 §3.1]."),
        ("6", "Abnormal conditions and escalation", "If feed temperature drops more than 30 °F or slide valve reaches 85% stroke, activate emergency feed heating protocols in [IOW-FCC-02 r2 §4]."),
        ("7", "References", "Reactor Windows [IOW-FCC-02 r2 §1] and Heat Exchanger Windows [IOW-HX-03 r1 §1]."),
        ("8", "Revision history", "Revision 2 approved 2024-12-05 by Dr. Leila Haddad; added detailed slide valve modulation guidelines.")
    ]
)

# SOP-APC-007
write_sop(
    doc_id="SOP-APC-007",
    title="Using soft-sensor estimates and cockpit recommendations",
    revision=1,
    effective_date="2026-05-04",
    owner_role="APC / soft-sensor engineer",
    tags=["LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98", "T_tray13_F", "T_tray06_F"],
    events=[],
    related=["MOC-0118", "MOC-0131", "LAB-QC-02", "IOW-FRAC-01"],
    summary="Standard procedure governing the operator interaction with the AI soft-sensor advisory cockpit, trust levels, and recommendation validation.",
    sections=[
        ("1", "Purpose", "Establishes operating rules and governance for using the real-time AI soft-sensor cockpit for fractionator cut-point optimization."),
        ("2", "Scope", "Applies to all FCC-21 console operators, APC engineers, and process supervisors interacting with the advisory cockpit."),
        ("3", "Safety and prerequisites", "Soft-sensor deployment operates strictly under advisory governance defined in [MOC-0118 r1 §1] and uncertainty boundaries in [MOC-0131 r1 §1]. No automated write commands are permitted to the DCS."),
        ("4", "Procedure", "Follow this sequence when reviewing and acting on cockpit recommendations."),
        ("4.1", "Interpret soft-sensor inferential distributions and P5 to P95 confidence intervals", "4.1.1 Inspect the estimated distillation curve for LCO_T98_F and HN_T98_F on the main cockpit dashboard.\n4.1.2 Review the 90% confidence interval defined by the 5th percentile (P5) and 95th percentile (P95) boundaries.\n4.1.3 Compute the interval width W90 = P95 - P5."),
        ("4.2", "Evaluate trust classification levels", "4.2.1 GREEN Trust: All input sensors healthy, models concordant, W90 ≤ 10 °F. Recommendations fully active.\n4.2.2 AMBER Trust: Minor sensor drift or moderate disagreement, 10 °F < W90 ≤ 14 °F. Operator must exercise increased surveillance.\n4.2.3 RED Trust: Sensor fault, severe collinearity breakdown, or W90 > 14 °F. Advisory output suspended."),
        ("4.3", "Validate spread-gate criterion and ensemble distribution width", "4.3.1 Enforce spread-gate limit W90 ≤ 14 °F (set at twice the lab reproducibility R = 7 °F).\n4.3.2 Check for multimodal or bimodal distributions indicating disagreement between PINN and Gaussian Process sub-models."),
        ("4.4", "Handle withheld recommendation status", "4.4.1 If W90 > 14 °F or bimodality is detected, verify the cockpit banner states: 'Distribution spread too wide — no recommendation issued'.\n4.4.2 In withheld state, operators are prohibited from making speculative cut-point adjustments.\n4.4.3 Promptly request an off-schedule lab sample to anchor model reconciliation."),
        ("4.5", "Execute operator recommendation review", "4.5.1 When a valid recommendation is displayed, review proposed set-point adjustment magnitude.\n4.5.2 Operator evaluates plant constraints and clicks 'Accept' or 'Decline'.\n4.5.3 Clicking 'Accept' logs the administrative decision; the operator then manually inputs the set-point move into DCS per [IOW-FRAC-01 r2 §3.2]."),
        ("4.6", "Review citation links and contextual operational evidence", "4.6.1 Inspect hyperlinked procedure steps and historical records provided with the card.\n4.6.2 Verify that contextual references support the proposed move before execution."),
        ("5", "Verification and lab confirmation", "Cross-check cockpit predictions against incoming laboratory results reconciled via [LAB-QC-02 r1 §4.2]. Any persistent deviation exceeding R = 7 °F triggers an APC model investigation."),
        ("6", "Abnormal conditions and escalation", "If trust drops to RED during transient operations, revert to manual cut-point guidance and inform APC engineer Marco Silva. For column instability, adhere to [IOW-FRAC-01 r2 §4]."),
        ("7", "References", "Advisory Governance [MOC-0118 r1 §1], Spread Gate Criteria [MOC-0131 r1 §1], and QA Protocol [LAB-QC-02 r1 §1]."),
        ("8", "Revision history", "Revision 1 approved 2026-05-04 by Marco Silva; initial baseline issue for advisory cockpit deployment.")
    ]
)

# SOP-LAB-008
write_sop(
    doc_id="SOP-LAB-008",
    title="Sampling LCO and HN for distillation testing",
    revision=3,
    effective_date="2025-08-11",
    owner_role="Lab supervisor",
    tags=["lab_sample", "LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F"],
    events=[],
    related=["LAB-D86-01", "LAB-QC-02", "LAB-SMP-03"],
    summary="Standard procedure for field sampling of Light Cycle Oil and Heavy Naphtha streams for routine laboratory distillation verification.",
    sections=[
        ("1", "Purpose", "Specifies mandatory steps for acquiring representative liquid samples of Light Cycle Oil and Heavy Naphtha for ASTM D86 physical distillation testing."),
        ("2", "Scope", "Applies to outside operators and laboratory technicians collecting stream samples from unit sample stations on FCC-21."),
        ("3", "Safety and prerequisites", "Wear full personal protective equipment including thermal and chemical gloves. Comply with sample point requirements in [LAB-SMP-03 r1 §3.1]."),
        ("4", "Procedure", "Follow this protocol during scheduled and on-demand sampling runs."),
        ("4.1", "Verify sample schedule", "4.1.1 Confirm scheduled shift sample draws at 06:00, 14:00, and 22:00.\n4.1.2 Verify whether operations requested an off-schedule draw due to a crude transition or soft-sensor spread-gate hold.\n4.1.3 Record sample draw flag on unit tag lab_sample."),
        ("4.2", "Inspect field sample station and sample cooler operational status", "4.2.1 Inspect sample coolers SP-LCO-01 and SP-HN-01; ensure cooling water flow is active.\n4.2.2 Check sample outlet temperature to ensure sample does not flash upon collection."),
        ("4.3", "Purge fast-loop sample lines to eliminate dead-leg volume", "4.3.1 Open sample bypass needle valve into closed slop header.\n4.3.2 Flush sample line for a minimum of 3 minutes (at least 3 line volumes) to clear stagnant product.\n4.3.3 Observe steady liquid flow and verify absence of entrained vapors."),
        ("4.4", "Collect representative product samples in certified containers", "4.4.1 Rinse certified amber glass sample bottle twice with stream fluid.\n4.4.2 Fill bottle to 85% volumetric capacity to permit thermal liquid expansion.\n4.4.3 Seal container tightly with PTFE-lined cap immediately."),
        ("4.5", "Log field process conditions and update sample chain of custody", "4.5.1 Note current draw tray temperatures T_tray13_F and T_tray06_F at the time of draw.\n4.5.2 Affix barcode label indicating stream, timestamp, sampler name, and unit tag status."),
        ("4.6", "Transport samples to laboratory and register analytical request", "4.6.1 Deliver samples to the analytical lab within 15 minutes of collection.\n4.6.2 Log receipt in the laboratory information management system."),
        ("5", "Verification and lab confirmation", "Laboratory technicians test samples in accordance with [LAB-D86-01 r2 §3.1] and validate results via [LAB-QC-02 r1 §4.1]. Analytical results are returned to operations within approximately 60 minutes."),
        ("6", "Abnormal conditions and escalation", "If sample cooler leaks or fast-loop valve binds, notify maintenance planner Victor Petrov and refer to [LAB-SMP-03 r1 §4] for alternative draw protocols."),
        ("7", "References", "D86 Method [LAB-D86-01 r2 §1], Quality Protocol [LAB-QC-02 r1 §1], and Sample Point Register [LAB-SMP-03 r1 §1]."),
        ("8", "Revision history", "Revision 3 approved 2025-08-11 by Grace Mwangi; formalized 3-line volume purge mandate.")
    ]
)

print("WP1 generation complete.")
