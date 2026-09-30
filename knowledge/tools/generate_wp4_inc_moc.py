#!/usr/bin/env python3
"""Generate WP4: 4 Incidents and 4 MOCs in knowledge/corpus/incidents and knowledge/corpus/moc"""
import pathlib, json

CORPUS_ROOT = pathlib.Path(__file__).resolve().parent.parent / "corpus"
(CORPUS_ROOT / "incidents").mkdir(parents=True, exist_ok=True)
(CORPUS_ROOT / "moc").mkdir(parents=True, exist_ok=True)

def write_doc(folder, doc_id, doc_type, title, revision, effective_date, owner_role, tags, events, related, summary, sections):
    front = [
        "---",
        f"doc_id: {doc_id}",
        f"title: \"{title}\"",
        f"doc_type: {doc_type}",
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
    out_path = CORPUS_ROOT / folder / f"{doc_id}.md"
    out_path.write_text(full_txt, encoding="utf-8")
    print(f"Wrote {out_path}")

# INC-0419
write_doc(
    folder="incidents",
    doc_id="INC-0419",
    doc_type="INC",
    title="LCO T98 off-spec after heavy-crude changeover",
    revision=1,
    effective_date="2025-04-09",
    owner_role="Operations superintendent",
    tags=["dist_feed_API", "LCO_T98_F", "T_tray13_F", "SP_LCO_T98", "MV_PA2"],
    events=[1],
    related=["SOP-FRAC-002", "IOW-FRAC-01", "MOC-0124", "MOC-0118"],
    summary="Incident report detailing unobserved distillation cut excursion on Light Cycle Oil following a heavy crude transition on FCC-21.",
    sections=[
        ("1", "Summary", "On 2025-04-09, following a planned transition from baseline API 25.0 crude to heavier API 21.0 crude, LCO distillation endpoint LCO_T98_F exceeded the critical high specification of 765 °F, peaking at 771.2 °F for 3.5 hours before corrective manual intervention."),
        ("2", "Timeline", "- 04:00 Feed changeover initiated per [SOP-FRAC-002 r5 §4.2]; feed API tag dist_feed_API ramped from 25.0 to 21.0 over 60 minutes.\n- 05:30 Column heat balance shifted; tray 13 draw temperature T_tray13_F climbed from 476.4 °F to 488.1 °F.\n- 06:00 Routine morning lab draw collected; sample delivery delayed by 45 minutes.\n- 07:15 LCO_T98_F breached critical threshold of 765 °F, reaching peak 771.2 °F.\n- 10:45 Laboratory analysis results received; board operator immediately raised MV_PA2 duty and trimmed cut point.\n- 14:15 Product distillation re-established within specification at 756.0 °F."),
        ("3", "Process data", "| Timestamp | dist_feed_API | T_tray13_F | LCO_T98_F | SP_LCO_T98 | MV_PA2 |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| 04:00 | 25.0 | 476.4 | 755.2 | 755.3 | 216.5 |\n| 06:00 | 21.0 | 483.5 | 763.8 | 755.3 | 216.5 |\n| 07:15 | 21.0 | 488.1 | 771.2 | 755.3 | 224.0 |\n| 10:45 | 21.0 | 480.2 | 766.5 | 750.0 | 235.0 |\n| 14:15 | 21.0 | 474.8 | 756.0 | 750.0 | 232.0 |"),
        ("4", "Root cause", "5-Whys Analysis:\n1. Why did LCO T98 exceed 765 °F? Heavier feed slate produced higher boiling fractionator bottoms vapor.\n2. Why was heat removal inadequate? Intermediate pumparound duty was held at static baseline settings.\n3. Why did operators not trim pumparound earlier? Operators depended on delayed laboratory confirmation.\n4. Why was the lab result delayed? 12-hour sampling cycle and sample transport latency created a 5-hour blindspot.\n5. Why was there no real-time inferential tracking? Unit lacked verified online soft-sensor inferentials."),
        ("5", "Contributing factors", "Absence of automated advisory inferentials and inadequate fast-loop pumparound compensation during feed transition."),
        ("6", "Corrective and preventive actions", "1. Increase routine lab sampling frequency from 12 h to 8 h via [MOC-0124 r1 §1] (Owner: Grace Mwangi, Due: 2025-11-10).\n2. Mandate proactive pumparound advance ramping in [SOP-FRAC-002 r5 §4.2] (Owner: Dr. Leila Haddad, Due: 2025-06-02).\n3. Accelerate deployment of AI soft-sensor advisory cockpit under [MOC-0118 r1 §1] (Owner: Marco Silva, Due: 2026-04-20)."),
        ("7", "References", "Crude Changeover SOP [SOP-FRAC-002 r5 §1] and Operating Windows [IOW-FRAC-01 r2 §1].")
    ]
)

# INC-0507
write_doc(
    folder="incidents",
    doc_id="INC-0507",
    doc_type="INC",
    title="HN endpoint excursion during ROT increase",
    revision=1,
    effective_date="2025-07-02",
    owner_role="Process engineer (fractionation)",
    tags=["HN_T98_F", "SP_HN_T98", "Tr_riser_F", "SP_T_riser_ROT_F", "T_tray06_F"],
    events=[3, 6],
    related=["SOP-FCC-005", "SOP-FRAC-004", "IOW-FRAC-01"],
    summary="Incident investigation of Heavy Naphtha distillation endpoint excursion following a rapid reactor riser outlet temperature increase.",
    sections=[
        ("1", "Summary", "On 2025-07-02, during an operational change raising riser outlet temperature by 5 °F, Heavy Naphtha endpoint HN_T98_F exceeded standard high limit 535 °F, reaching 541.8 °F for 1.8 hours."),
        ("2", "Timeline", "- 09:15 Board operator initiated ROT increase on SP_T_riser_ROT_F from 969 °F to 974 °F per [SOP-FCC-005 r3 §4.2].\n- 09:30 Tr_riser_F reached 974 °F; cracked vapor volume increased fractionator vapor velocity.\n- 09:45 Heavy naphtha draw tray temperature T_tray06_F rose sharply from 363.4 °F to 374.5 °F.\n- 10:10 HN_T98_F peaked at 541.8 °F, exceeding critical high limit 540 °F in [IOW-FRAC-01 r2 §3.1].\n- 10:30 Operator increased top reflux ratio MV_reflux_ratio and trimmed SP_HN_T98 per [SOP-FRAC-004 r2 §4.2].\n- 11:45 HN_T98_F restored to 531.0 °F."),
        ("3", "Process data", "| Timestamp | SP_T_riser_ROT_F | Tr_riser_F | T_tray06_F | HN_T98_F | SP_HN_T98 |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| 09:15 | 969.0 | 969.1 | 363.4 | 530.2 | 530.3 |\n| 09:30 | 974.0 | 974.0 | 368.0 | 534.5 | 530.3 |\n| 10:10 | 974.0 | 974.2 | 374.5 | 541.8 | 530.3 |\n| 10:45 | 974.0 | 973.9 | 367.2 | 536.0 | 528.0 |\n| 11:45 | 974.0 | 974.0 | 363.8 | 531.0 | 528.0 |"),
        ("4", "Root cause", "5-Whys Analysis:\n1. Why did HN T98 exceed 540 °F? Excess heavy vapor carried over past tray 6 into naphtha section.\n2. Why was there excess vapor? Reactor crack conversion increased abruptly without column re-cooling.\n3. Why was re-cooling delayed? Pumparound PA1 was not adjusted concurrently with riser temperature increase.\n4. Why was PA1 not adjusted? Procedure did not specify mandatory concurrent top reflux biasing.\n5. Why was procedural link absent? Interaction dynamics between riser kinetics and fractionator upper trays were under-modeled."),
        ("5", "Contributing factors", "Manual decoupled control between reactor board position and fractionator console."),
        ("6", "Corrective and preventive actions", "1. Update [SOP-FCC-005 r3 §4.2] to mandate top reflux pre-biasing during severity increases (Owner: Dr. Leila Haddad, Due: 2025-08-15).\n2. Incorporate upper column vapor velocity alarms into alarm management system (Owner: Ravi Menon, Due: 2025-09-01)."),
        ("7", "References", "Throughput/ROT SOP [SOP-FCC-005 r3 §1], HN Cut SOP [SOP-FRAC-004 r2 §1], and Column Windows [IOW-FRAC-01 r2 §1].")
    ]
)

# INC-0612
write_doc(
    folder="incidents",
    doc_id="INC-0612",
    doc_type="INC",
    title="Delayed lab result led to a conservative cut-point hold",
    revision=1,
    effective_date="2025-10-28",
    owner_role="Process engineer (fractionation)",
    tags=["LCO_T98_F", "SP_LCO_T98", "lab_sample", "prod_LCO"],
    events=[5],
    related=["WO-25152", "SOP-FRAC-003", "LAB-D86-01"],
    summary="Operational incident report analyzing product yield penalty resulting from conservative cut-point holds during an 8-hour laboratory testing outage.",
    sections=[
        ("1", "Summary", "On 2025-10-28, during a scheduled 8-hour laboratory distillation analyzer maintenance outage under [WO-25152 r1 §1], board operators held the LCO cut-point set point 8.0 °F conservative for 14 hours, resulting in a 0.6% yield shift from distillate to slurry."),
        ("2", "Timeline", "- 08:00 Laboratory analyzer D-101 taken offline for maintenance per [WO-25152 r1 §1]; tag lab_sample suspended.\n- 09:30 Operators, lacking verified distillation data, lowered SP_LCO_T98 from 755.3 °F to 747.3 °F to avoid risk of exceeding the critical high specification.\n- 16:00 Analyzer maintenance completed; calibration verification delayed.\n- 22:30 First post-outage lab result authorized under [LAB-D86-01 r2 §4.1], confirming LCO_T98_F at 746.8 °F.\n- 23:15 Operators restored SP_LCO_T98 back to 755.3 °F per [SOP-FRAC-003 r4 §4.1]."),
        ("3", "Process data", "| Timestamp | SP_LCO_T98 | LCO_T98_F | prod_LCO | lab_sample | Operational Mode |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| 08:00 | 755.3 | 755.1 | 163.6 | 0 | Normal baseline |\n| 10:00 | 747.3 | 748.2 | 160.2 | 0 | Conservative cut hold |\n| 16:00 | 747.3 | 747.0 | 160.1 | 0 | Lab maintenance complete |\n| 22:30 | 747.3 | 746.8 | 160.0 | 1 | Lab result confirmed |\n| 23:45 | 755.3 | 754.9 | 163.5 | 0 | Re-optimized cut |"),
        ("4", "Root cause", "5-Whys Analysis:\n1. Why did the unit experience a 0.6% yield degradation? Cut-point was set 8 °F below optimal plan target.\n2. Why did operators lower the cut-point? Fear of exceeding 765 °F critical threshold without measurement visibility.\n3. Why was there no measurement visibility? Laboratory analyzer was offline for 8 hours.\n4. Why was secondary backup unavailable? Unit had no secondary physical distillation analyzer.\n5. Why was there no virtual measurement? Soft-sensor advisory system had not yet completed validation."),
        ("5", "Contributing factors", "Conservative operational posture induced by lack of real-time inferential measurement redundancy."),
        ("6", "Corrective and preventive actions", "1. Expedite implementation of advisory soft-sensor cockpit to provide continuous virtual distillation estimates during laboratory outages (Owner: Marco Silva, Due: 2026-04-20).\n2. Establish specific contingency operating margins for scheduled analyzer outages (Owner: Dr. Leila Haddad, Due: 2025-12-01)."),
        ("7", "References", "Analyzer Maintenance WO [WO-25152 r1 §1], LCO Cut SOP [SOP-FRAC-003 r4 §1], and D86 Method [LAB-D86-01 r2 §1].")
    ]
)

# INC-0733
write_doc(
    folder="incidents",
    doc_id="INC-0733",
    doc_type="INC",
    title="Tray-13 thermocouple drift masked LCO cut-point drift",
    revision=1,
    effective_date="2026-03-17",
    owner_role="Reliability engineer",
    tags=["T_tray13_F", "LCO_T98_F", "SP_LCO_T98"],
    events=[5],
    related=["WO-24058", "SOP-FRAC-003", "IOW-FRAC-01"],
    summary="Investigation of subtle sensor drift on tray 13 thermocouple masking actual distillation cut changes, leading to enhancement of soft-sensor sensor-health diagnostics.",
    sections=[
        ("1", "Summary", "On 2026-03-17, recurring thermocouple calibration drift on LCO draw tray 13 (analogous to [WO-24058 r1 §1]) masked a progressive 6.5 °F rise in actual LCO distillation endpoint, evading single-point alarm detection."),
        ("2", "Timeline", "- 02:00 Thermocouple T_tray13_F developed a gradual negative 3.8 °F measurement bias.\n- 04:30 Automated trim controller added heat to raise indicated tray temperature back to target.\n- 08:00 True column temperature rose silently; actual LCO_T98_F drifted from 755.3 °F to 762.8 °F.\n- 14:00 Shift lab sample analyzed; lab D86 reported 763.5 °F, revealing a 7.5 °F disagreement with controller indication.\n- 14:30 Controller switched to manual; cut-point trimmed down per [SOP-FRAC-003 r4 §4.3].\n- 16:00 Field instrumentation verified thermocouple resistance drift."),
        ("3", "Process data", "| Timestamp | Indicated T_tray13_F | True Tray Temp | LCO_T98_F | SP_LCO_T98 | Sensor State |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| 02:00 | 476.4 | 476.4 | 755.3 | 755.3 | Healthy baseline |\n| 06:00 | 476.4 | 479.8 | 759.0 | 755.3 | Unobserved drift |\n| 10:00 | 476.4 | 482.5 | 761.5 | 755.3 | Drift expanding |\n| 14:00 | 476.4 | 483.8 | 762.8 | 755.3 | Lab detected |\n| 15:30 | 473.0 | 476.8 | 755.8 | 750.0 | Corrected manual |"),
        ("4", "Root cause", "5-Whys Analysis:\n1. Why did actual LCO T98 drift high? Controller increased tray heating based on falsely low temperature readings.\n2. Why was the temperature reading low? Type-K thermocouple junction suffered metallurgical embrittlement.\n3. Why did the single-sensor alarm fail to trip? Sensor drifted within allowable operating bounds without open-circuit failure.\n4. Why was analytical cross-check delayed? 8-hour lab testing turnaround permitted 6 hours of unobserved drift.\n5. How could this be prevented? Multivariate sensor-health scoring in the AI soft sensor can flag collinearity breakdowns immediately."),
        ("5", "Contributing factors", "Single-transmitter control architecture without online multivariate sensor validation."),
        ("6", "Corrective and preventive actions", "1. Incorporate dedicated sensor-health PCA validation into soft-sensor trust algorithm (Owner: Marco Silva, Due: 2026-04-20).\n2. Mandate redundant thermocouple cross-checks during shift turnovers per [IOW-FRAC-01 r2 §3.3] (Owner: Ravi Menon, Due: 2026-04-01)."),
        ("7", "References", "Prior Thermocouple WO [WO-24058 r1 §1], LCO Adjustment SOP [SOP-FRAC-003 r4 §1], and Column Windows [IOW-FRAC-01 r2 §1].")
    ]
)

# MOC-0112
write_doc(
    folder="moc",
    doc_id="MOC-0112",
    doc_type="MOC",
    title="Pumparound PA2 duty range change for LCO cut control",
    revision=1,
    effective_date="2024-09-09",
    owner_role="Process engineer (fractionation)",
    tags=["MV_PA2", "T_tray13_F", "LCO_T98_F"],
    events=[5],
    related=["IOW-HX-03", "SOP-FRAC-001"],
    summary="Management of Change documentation authorizing expansion of intermediate pumparound PA2 operational duty range to improve cut-point dynamic control.",
    sections=[
        ("1", "Description of change", "Authorizes re-tuning and expansion of the allowable heat removal envelope on intermediate pumparound PA2 (tag MV_PA2) from 190.0–225.0 to 180.0–250.0 duty units on FCC-21 main fractionator."),
        ("2", "Technical basis", "Fractionator dynamic simulation demonstrated that expanding PA2 duty enables faster compensation of tray 13 thermal disturbances, improving distillation separation sharpness between HN and LCO."),
        ("3", "Hazard review", "What-If Analysis confirmed that expanded duty will not induce column hydraulic flooding or sub-cooling of draw trays when operating within [IOW-HX-03 r1 §3.3]."),
        ("4", "Procedures and training affected", "Operating limits in [SOP-FRAC-001 r3 §4.2] updated to incorporate the revised duty bands. Board operators completed console simulation training."),
        ("5", "Approval and implementation", "Approved by Operations superintendent Nadia Khan on 2024-09-09. DCS controller output clamp limits updated on 2024-09-12."),
        ("6", "Post-implementation review", "Reviewed on 2024-12-10; demonstrated a 15% reduction in LCO cut-point settling time during feed rate disturbances.")
    ]
)

# MOC-0118
write_doc(
    folder="moc",
    doc_id="MOC-0118",
    doc_type="MOC",
    title="Introduce soft-sensor estimates as advisory (cockpit)",
    revision=1,
    effective_date="2026-04-20",
    owner_role="APC / soft-sensor engineer",
    tags=["LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98"],
    events=[],
    related=["SOP-APC-007", "INC-0419"],
    summary="Management of Change approving implementation and deployment of AI soft-sensor advisory cockpit for real-time cut-point recommendation.",
    sections=[
        ("1", "Description of change", "Deployment of the AI-driven inferential soft-sensor cockpit providing continuous real-time estimations of LCO_T98_F and HN_T98_F with decision recommendations on FCC-21."),
        ("2", "Technical basis", "Following unobserved cut-point excursions documented in [INC-0419 r1 §1], machine learning inferentials combining physics-informed neural networks and Gaussian process regression provide virtual distillation tracking with P5–P95 confidence bands."),
        ("3", "Hazard review", "Strict governance enforced: The system is ADVISORY ONLY. No automated write commands or closed-loop write paths to the DCS or MPC exist. All moves require explicit operator review and manual entry."),
        ("4", "Procedures and training affected", "Created new operating procedure [SOP-APC-007 r1 §1]. Conducted mandatory simulator training for all four operating crews (A, B, C, D)."),
        ("5", "Approval and implementation", "Approved by Nadia Khan and Marco Silva on 2026-04-20. Cockpit interface deployed to control console on 2026-05-01."),
        ("6", "Post-implementation review", "Quarterly audit scheduled to evaluate operator acceptance rates, prediction fidelity against lab tests, and adherence to advisory rules.")
    ]
)

# MOC-0124
write_doc(
    folder="moc",
    doc_id="MOC-0124",
    doc_type="MOC",
    title="Lab sampling frequency from 12 h to 8 h",
    revision=1,
    effective_date="2025-11-10",
    owner_role="Lab supervisor",
    tags=["lab_sample", "LCO_T98_F", "HN_T98_F"],
    events=[],
    related=["INC-0419", "SOP-LAB-008"],
    summary="Procedural change establishing an 8-hour laboratory sampling frequency for FCC-21 product streams to enhance analytical coverage.",
    sections=[
        ("1", "Description of change", "Increases routine laboratory physical distillation sampling frequency for LCO and HN streams from once every 12 hours (06:00, 18:00) to once every 8 hours (06:00, 14:00, 22:00)."),
        ("2", "Technical basis", "Corrective action resulting from [INC-0419 r1 §1], in which a 12-hour sampling interval allowed an off-spec cut excursion to persist unobserved for several hours."),
        ("3", "Hazard review", "No process safety hazards identified. Lab operational assessment confirmed automated distillation units possess adequate testing throughput capacity."),
        ("4", "Procedures and training affected", "Updated sampling runbook [SOP-LAB-008 r3 §4.1]. Shift technician rosters aligned with new 8-hour sample intake schedule."),
        ("5", "Approval and implementation", "Approved by Lab supervisor Grace Mwangi and Operations superintendent Nadia Khan on 2025-11-10; effective immediately."),
        ("6", "Post-implementation review", "Confirmed zero analytical delays and verified 33% reduction in time-to-detection for off-spec product shifts.")
    ]
)

# MOC-0131
write_doc(
    folder="moc",
    doc_id="MOC-0131",
    doc_type="MOC",
    title="Spread-gate limit W90 = 14 °F for advisory recommendations",
    revision=1,
    effective_date="2026-05-04",
    owner_role="APC / soft-sensor engineer",
    tags=["LCO_T98_F", "HN_T98_F", "SP_LCO_T98"],
    events=[],
    related=["SOP-APC-007", "MOC-0118", "LAB-D86-01"],
    summary="Specification and formal technical justification of the 14 °F spread-gate uncertainty limit governing soft-sensor recommendation issuance.",
    sections=[
        ("1", "Description of change", "Establishes a mandatory spread-gate criterion in the AI soft-sensor advisory engine: If the 90% confidence interval width W90 = P95 - P5 exceeds 14.0 °F, or if sub-models disagree bimodally, recommendations must be withheld."),
        ("2", "Technical basis", "Laboratory distillation test method [LAB-D86-01 r2 §5.1] establishes a reproducibility of R = 7.0 °F. Setting the maximum allowable model uncertainty band to W90 = 2R = 14.0 °F ensures that recommendations are only presented when inferential precision matches or exceeds laboratory inter-laboratory reproducibility."),
        ("3", "Hazard review", "Prevents console operators from receiving speculative or low-confidence guidance during severe unmeasured feed disturbances or sensor failures."),
        ("4", "Procedures and training affected", "Operating procedure [SOP-APC-007 r1 §4.3] updated to codify the 'Distribution spread too wide — no recommendation issued' operator response protocol."),
        ("5", "Approval and implementation", "Approved by APC engineer Marco Silva and Operations superintendent Nadia Khan on 2026-05-04."),
        ("6", "Post-implementation review", "Validated across held-out campaign simulation runs; confirmed that the spread gate withheld recommendations during 100% of severe unmeasured crude transition transients.")
    ]
)

print("WP4 generation complete.")
