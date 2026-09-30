#!/usr/bin/env python3
"""Generate WP2: 3 IOW and 3 LAB documents in knowledge/corpus/iow and knowledge/corpus/lab"""
import pathlib, json

CORPUS_ROOT = pathlib.Path(__file__).resolve().parent.parent / "corpus"
(CORPUS_ROOT / "iow").mkdir(parents=True, exist_ok=True)
(CORPUS_ROOT / "lab").mkdir(parents=True, exist_ok=True)

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

# IOW-FRAC-01
write_doc(
    folder="iow",
    doc_id="IOW-FRAC-01",
    doc_type="IOW",
    title="Fractionator integrity operating windows",
    revision=2,
    effective_date="2025-10-01",
    owner_role="Process engineer (fractionation)",
    tags=["LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F", "P5_frac_psia"],
    events=[],
    related=["IOW-HX-03", "SOP-FRAC-001", "REF-STD-01"],
    summary="Integrity operating windows and safe design envelopes for main fractionator column pressure, temperatures, and product distillation cut limits on FCC-21.",
    sections=[
        ("1", "Scope", "Defines standard and critical operating boundaries for the FCC-21 main fractionator to prevent column weeping, tray flooding, downcomer backup, and product off-specification events."),
        ("2", "Definitions", "Standard High/Low (Level 1): Operating range within which normal closed-loop and operator control is maintained.\nCritical High/Low (Level 2): Safety or mechanical limit requiring immediate operator intervention to prevent asset damage or rapid off-spec product generation."),
        ("3", "Operating windows", "The following integrity operating windows apply under steady and transient operations. All numeric parameters are designated as demo placeholders."),
        ("3.1", "Heavy naphtha distillation cut window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| HN_T98_F | HN 98% cut point (°F) | 510.0 | 520.0 | 530.3 | 535.0 | 540.0 | 15 min | Trim top reflux ratio and adjust draw rate |\n| T_tray06_F | HN draw tray temp (°F) | 345.0 | 355.0 | 363.4 | 372.0 | 380.0 | 15 min | Modulate MV_PA1 duty |"),
        ("3.2", "Light cycle oil distillation cut window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| LCO_T98_F | LCO 98% cut point (°F) | 730.0 | 740.0 | 755.3 | 760.0 | 765.0 | 20 min | Increase MV_PA2 duty and lower draw rate |\n| T_tray13_F | LCO draw tray temp (°F) | 455.0 | 465.0 | 476.4 | 485.0 | 495.0 | 20 min | Trim PA2 cooling water |"),
        ("3.3", "Fractionator intermediate tray temperature windows", "Maintains tray internal thermal profile to preserve stage separation efficiency across trays 7 through 12."),
        ("3.4", "Column overhead operating pressure window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| P5_frac_psia | Overhead pressure (psia) | 22.0 | 23.5 | 24.9 | 26.0 | 27.5 | 5 min | Check wet gas compressor bypass valve |"),
        ("3.5", "Tower differential pressure and flooding margins", "Monitors total column differential pressure across bottoms and overhead to detect incipient jet flooding or tray weeping."),
        ("4", "Response to exceedance", "Upon Level 1 exceedance, board operators must trim set points within 15 minutes. Upon Level 2 critical exceedance, operators must immediately reduce unit throughput, maximize quench duties, and notify Dr. Leila Haddad."),
        ("5", "References", "Standard Fractionator Operation [SOP-FRAC-001 r3 §1], Heat Transfer IOW [IOW-HX-03 r1 §1], and API RP 584 [REF-STD-01 r1 §2.4]."),
        ("6", "Revision history", "Revision 2 approved 2025-10-01 by Dr. Leila Haddad; harmonized critical high thresholds with downstream reformer and hydrotreater limits.")
    ]
)

# IOW-FCC-02
write_doc(
    folder="iow",
    doc_id="IOW-FCC-02",
    doc_type="IOW",
    title="Reactor and regenerator operating windows",
    revision=2,
    effective_date="2025-07-14",
    owner_role="Operations superintendent",
    tags=["Tr_riser_F", "SP_T_riser_ROT_F", "Treg_F", "fluegas_O2_pct", "feed_flow_lb_s"],
    events=[],
    related=["IOW-FRAC-01", "SOP-FCC-005", "REF-STD-01"],
    summary="Integrity operating windows for FCC-21 reactor riser cracking severity, regenerator dense bed temperature, and catalyst circulation hydraulics.",
    sections=[
        ("1", "Scope", "Defines the operating envelope for the reactor and regenerator sections of FCC-21 to safeguard metallurgical limits and maintain stable combustion kinetics."),
        ("2", "Definitions", "Defines Level 1 target and standard boundaries, and Level 2 critical thresholds for catalyst thermal degradation and vessel refractory limits."),
        ("3", "Operating windows", "Operating limit tables for reactor severity and regenerator heat balance. All parameters are demo placeholders."),
        ("3.1", "Riser outlet temperature and cracking severity window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| Tr_riser_F | Riser outlet temp (°F) | 945.0 | 960.0 | 969.0 | 975.0 | 985.0 | 5 min | Adjust catalyst slide valve position |\n| feed_flow_lb_s | Fresh feed rate (lb/s) | 140.0 | 155.0 | 165.0 | 175.0 | 185.0 | 10 min | Modulate charge pump speed |"),
        ("3.2", "Feed preheat and reactor inlet enthalpy window", "Monitors combined feed preheat temperature dist_T_feed_in_F at nominal 460.9 °F to balance riser vaporization duty."),
        ("3.3", "Regenerator dense bed temperature and combustion window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| Treg_F | Regenerator bed temp (°F) | 1200.0 | 1230.0 | 1250.0 | 1280.0 | 1320.0 | 5 min | Trim torch oil and main air blower rate |"),
        ("3.4", "Flue gas oxygen and afterburn protection window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| fluegas_O2_pct | Flue gas oxygen (%) | 0.5 | 1.0 | 1.8 | 2.5 | 3.5 | 2 min | Adjust air rate to prevent dilute-phase afterburn |"),
        ("3.5", "Catalyst circulation and slide valve differential pressure window", "Maintains differential pressure across regenerated and spent catalyst slide valves above minimum fluidization margins."),
        ("4", "Response to exceedance", "Immediate actions include cutting feed rate, activating emergency quench steam, and adjusting combustion air blower vanes. Escalate to Operations superintendent Nadia Khan."),
        ("5", "References", "Throughput/ROT SOP [SOP-FCC-005 r3 §1] and API RP 584 [REF-STD-01 r1 §2.4]."),
        ("6", "Revision history", "Revision 2 approved 2025-07-14 by Nadia Khan; tightened flue gas oxygen margins to prevent afterburn excursions.")
    ]
)

# IOW-HX-03
write_doc(
    folder="iow",
    doc_id="IOW-HX-03",
    doc_type="IOW",
    title="Overhead condenser and pumparound heat-transfer windows",
    revision=1,
    effective_date="2025-01-22",
    owner_role="Reliability engineer",
    tags=["dist_condenser_eff", "MV_cw_flow", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4"],
    events=[],
    related=["IOW-FRAC-01", "WO-24031", "REF-STD-01"],
    summary="Integrity operating windows for heat exchanger thermal efficiency, pumparound duty distribution, and condenser tube cooling water boundaries on FCC-21.",
    sections=[
        ("1", "Scope", "Defines heat transfer performance baselines and fouling monitoring thresholds for the overhead condensers and column pumparound circuits."),
        ("2", "Definitions", "Defines heat transfer coefficient degradation limits, minimum cooling water flow velocity, and thermal duty margins."),
        ("3", "Operating windows", "Operating limits for heat-transfer equipment. Values represent demo placeholders."),
        ("3.1", "Overhead condenser thermal efficiency window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| dist_condenser_eff | Condenser efficiency | 0.850 | 0.870 | 0.900 | 0.930 | 0.950 | 1 hour | Increase cooling water flow, check for tube fouling |"),
        ("3.2", "Condenser cooling water supply and return temperature window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| MV_cw_flow | Cooling water flow rate | 240.0 | 270.0 | 298.9 | 330.0 | 360.0 | 15 min | Open cooling water trim valve |"),
        ("3.3", "Mid-column pumparound PA2 heat extraction window", "| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n| MV_PA2 | PA2 pumparound duty | 180.0 | 200.0 | 216.5 | 235.0 | 250.0 | 20 min | Adjust PA2 circulation pump discharge |"),
        ("3.4", "Lower pumparound PA3 and slurry pumparound PA4 windows", "Maintains lower column heat extraction on MV_PA3 and MV_PA4 to control bottoms reboiling and quench duties."),
        ("3.5", "Exchanger tube velocity and fouling degradation margins", "Monitors overall heat transfer coefficient UA decline across shell-and-tube bundles to plan maintenance cleaning."),
        ("4", "Response to exceedance", "When condenser efficiency drops below 0.870, initiate cooling water backflushing. If efficiency reaches critical low 0.850, schedule bundle cleaning per [WO-24031 r1 §1] and notify Owen Hartley."),
        ("5", "References", "Fractionator IOW [IOW-FRAC-01 r2 §1] and Heat Exchanger Maintenance Record [WO-24031 r1 §1]."),
        ("6", "Revision history", "Revision 1 approved 2025-01-22 by Owen Hartley; initial baseline issue.")
    ]
)

# LAB-D86-01
write_doc(
    folder="lab",
    doc_id="LAB-D86-01",
    doc_type="LAB",
    title="LCO/HN distillation test method (D86-based)",
    revision=2,
    effective_date="2025-05-09",
    owner_role="Lab supervisor",
    tags=["lab_sample", "LCO_T98_F", "HN_T98_F"],
    events=[],
    related=["LAB-QC-02", "LAB-SMP-03", "REF-STD-01"],
    summary="Standard laboratory analytical test method for measuring distillation boiling profiles of light cycle oil and heavy naphtha streams using D86 procedures.",
    sections=[
        ("1", "Scope", "Specifies the atmospheric distillation test method for measuring the boiling range characteristics of FCC-21 Light Cycle Oil and Heavy Naphtha samples."),
        ("2", "Method summary", "A 100 mL sample is distilled under prescribed atmospheric conditions in an automated distillation apparatus. Temperatures are recorded at initial boiling point, percentage recovered volume marks, and 98% end recovery (T98)."),
        ("3", "Sampling and handling", "Samples must be received in sealed amber bottles in accordance with [LAB-SMP-03 r1 §3.1]. Maintain sample storage at 40 °F to 55 °F to prevent loss of volatile fractions."),
        ("3.1", "Sample intake inspection and temperature stabilization", "Verify container integrity, sample identification tags, and absence of free water before commencing test."),
        ("4", "Procedure", "Analytical testing execution sequence."),
        ("4.1", "Automated distillation analyzer operation", "4.1.1 Measure exactly 100 mL of sample using a calibrated graduated cylinder.\n4.1.2 Position thermometer sensor probe exactly at the neck vapor inlet line.\n4.1.3 Initiate programmed heating curve to maintain uniform distillation rate of 4.5 mL/min.\n4.1.4 Record vapor temperature when recovery reaches 98% (T98).\n4.1.5 Total analysis turnaround time from sample receipt to result authorization is approximately 60 minutes."),
        ("5", "Precision", "Measurement precision parameters. All values represent demo placeholders."),
        ("5.1", "Repeatability and reproducibility boundaries", "Repeatability r = 3.5 °F (difference between successive test results by the same operator on the same apparatus).\nReproducibility R = 7.0 °F (difference between independent results by different operators in different laboratories)."),
        ("6", "Result validation", "Validate all analytical runs against statistical quality control charts per [LAB-QC-02 r1 §4.1]. Any run with mass recovery below 97.5% is invalid and must be re-tested."),
        ("7", "References", "Quality Reconciliation Protocol [LAB-QC-02 r1 §1], Sampling Register [LAB-SMP-03 r1 §1], and ASTM D86 [REF-STD-01 r1 §2.1]."),
        ("8", "Revision history", "Revision 2 approved 2025-05-09 by Grace Mwangi; updated automated distillation receiver temperature standards.")
    ]
)

# LAB-QC-02
write_doc(
    folder="lab",
    doc_id="LAB-QC-02",
    doc_type="LAB",
    title="Lab result validation and reconciliation",
    revision=1,
    effective_date="2025-05-09",
    owner_role="Lab supervisor",
    tags=["lab_sample", "LCO_T98_F", "HN_T98_F"],
    events=[],
    related=["LAB-D86-01", "SOP-APC-007", "REF-STD-01"],
    summary="Quality assurance and statistical process control procedure for validating, reconciling, and screening laboratory distillation results on FCC-21.",
    sections=[
        ("1", "Scope", "Governs the statistical screening, validation, and authorization of laboratory distillation results before publishing to the refinery information system."),
        ("2", "Method summary", "Applies statistical control charts and comparison against process soft-sensor confidence intervals to classify results into ACCEPT, HOLD, or REJECT."),
        ("3", "Sampling and handling", "Requires continuous monitoring of standard control check samples run daily on each active distillation analyzer."),
        ("4", "Procedure", "Statistical validation sequence for laboratory distillation data."),
        ("4.1", "Outlier screening and control chart checks", "4.1.1 Compare daily control sample result against Shewhart control charts per ASTM D6299.\n4.1.2 Apply Grubbs statistical test to identify experimental outliers.\n4.1.3 Check for analyzer heating rate anomalies or thermocouple baseline drift."),
        ("4.2", "Reconciliation with soft-sensor inferential predictions", "4.2.1 Compare authorized lab D86 T98 value against soft-sensor P5–P95 interval from [SOP-APC-007 r1 §4.2].\n4.2.2 Result classification:\n- ACCEPT: Lab result falls within P5–P95 interval or within reproducibility R = 7.0 °F of median.\n- HOLD: Deviation between 7.0 °F and 10.0 °F; requires secondary instrument verification.\n- REJECT: Deviation > 10.0 °F or obvious analytical error; triggers immediate sample re-test."),
        ("5", "Precision", "Adheres to reproducibility R = 7.0 °F defined in [LAB-D86-01 r2 §5.1]."),
        ("6", "Result validation", "Authorized results are posted to the console DCS and cockpit database. Discrepant values trigger joint review with APC engineer Marco Silva."),
        ("7", "References", "Distillation Method [LAB-D86-01 r2 §1], Cockpit SOP [SOP-APC-007 r1 §1], and ASTM D6299 [REF-STD-01 r1 §2.3]."),
        ("8", "Revision history", "Revision 1 approved 2025-05-09 by Grace Mwangi; initial issue for closed-loop soft-sensor validation.")
    ]
)

# LAB-SMP-03
write_doc(
    folder="lab",
    doc_id="LAB-SMP-03",
    doc_type="LAB",
    title="Sample point register and chain of custody",
    revision=1,
    effective_date="2024-11-04",
    owner_role="Lab supervisor",
    tags=["lab_sample", "LCO_T98_F", "HN_T98_F"],
    events=[],
    related=["LAB-D86-01", "SOP-LAB-008", "WO-25090"],
    summary="Specification of physical sample points, sample cooler operating parameters, line purging requirements, and chain of custody tracking for FCC-21 streams.",
    sections=[
        ("1", "Scope", "Provides equipment design data, location coordinates, and operational protocols for online physical sample collection stations on FCC-21."),
        ("2", "Method summary", "Standardizes fast-loop sample piping configuration, double-block-and-bleed valve arrangements, and cooler maintenance."),
        ("3", "Sampling and handling", "Sample station specifications and purging parameters."),
        ("3.1", "Sample station register and technical specifications", "| Sample Point | Stream Description | Location | Cooler Tag | Fast-Loop Purge Volume | Design Pressure |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| SP-LCO-01 | Light Cycle Oil product | Tray 13 rundown | CW-SC-101 | 3.5 gallons (3 min) | 150 psig |\n| SP-HN-01 | Heavy Naphtha product | Tray 06 rundown | CW-SC-102 | 2.0 gallons (2 min) | 150 psig |"),
        ("4", "Procedure", "Execution of sample station maintenance and cooler inspection."),
        ("4.1", "Sample cooler operational verification", "Inspect cooling water supply to CW-SC-101 and CW-SC-102. Ensure sample effluent temperature remains below 85 °F to prevent light-end evaporation during collection."),
        ("4.2", "Chain of custody and tracking protocols", "Affix barcode to collection bottle; record sample origin, tag status lab_sample, timestamp, and field sampler initials."),
        ("5", "Precision", "Ensures collected samples faithfully represent column dynamic liquid hold-up without thermal decomposition."),
        ("6", "Result validation", "Samples exhibiting discoloration, particulate fouling, or water haze must be discarded and re-drawn following station flushing per [WO-25090 r1 §1]."),
        ("7", "References", "Distillation Method [LAB-D86-01 r2 §1], Field Sampling SOP [SOP-LAB-008 r3 §1], and Sample Cooler WO [WO-25090 r1 §1]."),
        ("8", "Revision history", "Revision 1 approved 2024-11-04 by Grace Mwangi; initial register issue.")
    ]
)

print("WP2 generation complete.")
