#!/usr/bin/env python3
"""Generate WP3: 12 Work Order documents in knowledge/corpus/work_orders"""
import pathlib, json

CORPUS_ROOT = pathlib.Path(__file__).resolve().parent.parent / "corpus" / "work_orders"
CORPUS_ROOT.mkdir(parents=True, exist_ok=True)

def write_wo(doc_id, title, revision, effective_date, owner_role, tags, events, related, summary, sections):
    front = [
        "---",
        f"doc_id: {doc_id}",
        f"title: \"{title}\"",
        "doc_type: WO",
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

# WO-24031
write_wo(
    doc_id="WO-24031",
    title="Overhead condenser fouling: bundle cleaning",
    revision=1,
    effective_date="2024-03-12",
    owner_role="Reliability engineer",
    tags=["dist_condenser_eff", "P5_frac_psia", "MV_cw_flow"],
    events=[],
    related=["IOW-HX-03"],
    summary="Maintenance record documenting offline hydroblasting and tube-side descaling of main fractionator overhead condenser bundle following thermal efficiency decline.",
    sections=[
        ("1", "Request", "Operations requested scheduled cleaning of the main fractionator overhead condenser bank due to persistent decline in heat transfer performance."),
        ("2", "Symptoms and detection", "Over a 14-day operating window, indicated condenser efficiency dist_condenser_eff degraded progressively from nominal 0.900 to 0.855. Overhead column pressure P5_frac_psia rose from 24.9 psia to 26.3 psia despite cooling water flow MV_cw_flow increasing to 330 lb/s."),
        ("3", "Diagnosis", "Inspection confirmed biological and mineral scale fouling on the cooling water tube-side, resulting in heat transfer coefficient reduction below limits in [IOW-HX-03 r1 §3.1]."),
        ("4", "Work performed", "Mechanical maintenance crew isolated the condenser train, unbolted channel heads, and performed high-pressure hydrojetting at 10,000 psi across all 1,240 tubes. Total mechanical execution duration was 16 hours."),
        ("5", "Return to service and verification", "Condenser bundle reassembled with new spiral-wound gaskets and hydrotested at 150 psig. Upon return to service, dist_condenser_eff recovered to 0.908 at design cooling water flow."),
        ("6", "Lessons and follow-ups", "Establish bi-weekly biocidal shock dosing in the cooling tower supply circuit to mitigate accelerated biological fouling.")
    ]
)

# WO-24058
write_wo(
    doc_id="WO-24058",
    title="Tray-13 thermocouple drift: replacement",
    revision=1,
    effective_date="2024-05-27",
    owner_role="Instrument technician",
    tags=["T_tray13_F", "LCO_T98_F"],
    events=[],
    related=["IOW-FRAC-01"],
    summary="Work order covering corrective replacement and calibration of the dual-element thermocouple on fractionator LCO draw tray 13 following sensor drift.",
    sections=[
        ("1", "Request", "Fractionation engineer flagged an inconsistent temperature offset between tray 13 draw temperature and product distillation laboratory assays."),
        ("2", "Symptoms and detection", "Indicated temperature T_tray13_F read 4.2 °F higher than redundant computational tray estimates, causing premature throttling of pumparound duty. Soft-sensor health degraded to AMBER trust as model residual errors expanded."),
        ("3", "Diagnosis", "Field transmitter diagnostics revealed wire resistance degradation in the primary Type-K thermocouple junction inside the thermowell, exceeding limits in [IOW-FRAC-01 r2 §3.3]."),
        ("4", "Work performed", "Instrument technician Ravi Menon extracted the degraded thermocouple assembly, cleaned the thermowell interior, and installed a certified replacement dual-element sensor. Total job duration was 4 hours."),
        ("5", "Return to service and verification", "Transmitter loop calibrated from 0 °F to 600 °F with certified dry-block calibrator. Verified T_tray13_F aligned with redundant measurements within 0.3 °F; soft-sensor trust restored to GREEN."),
        ("6", "Lessons and follow-ups", "Implement thermowell purges during future turnaround cycles to prevent atmospheric moisture accumulation.")
    ]
)

# WO-24102
write_wo(
    doc_id="WO-24102",
    title="Pumparound PA2 pump mechanical seal leak",
    revision=1,
    effective_date="2024-08-19",
    owner_role="Maintenance planner",
    tags=["MV_PA2", "T_tray13_F"],
    events=[],
    related=["IOW-HX-03"],
    summary="Repair record for replacement of inboard mechanical seal and bearing flush on fractionator intermediate pumparound pump P-102A.",
    sections=[
        ("1", "Request", "Outside operator reported hydrocarbon vapor leakage and seal pot buffer fluid pressurization on intermediate pumparound pump P-102A."),
        ("2", "Symptoms and detection", "Buffer fluid reservoir level decreased rapidly; pumparound duty MV_PA2 exhibited transient fluctuations between 216.5 and 195.0. Draw temperature T_tray13_F rose 3.5 °F as circulation duty dipped."),
        ("3", "Diagnosis", "Disassembly revealed face heat checking on the stationary silicon carbide seal ring due to particulate ingestion from strainer failure, breaching [IOW-HX-03 r1 §3.3] stability requirements."),
        ("4", "Work performed", "Maintenance crew under Victor Petrov switched service to spare pump P-102B, isolated P-102A, and installed a new Plan 53B dual mechanical seal assembly and suction strainer basket over 12 hours."),
        ("5", "Return to service and verification", "Pump re-aligned with laser alignment tool to within 0.001 inch runout. Following run-in, MV_PA2 circulation stabilized at design duty 216.5 with zero barrier fluid leakage."),
        ("6", "Lessons and follow-ups", "Include suction strainer differential pressure transmitter in quarterly preventive maintenance rounds.")
    ]
)

# WO-24133
write_wo(
    doc_id="WO-24133",
    title="Main air blower (CAB) inlet valve passing",
    revision=1,
    effective_date="2024-10-30",
    owner_role="Reliability engineer",
    tags=["power_CAB", "F_air_x29", "fluegas_O2_pct"],
    events=[],
    related=["IOW-FCC-02"],
    summary="Corrective maintenance and pneumatic actuator overhaul of the main combustion air blower inlet guide vane assembly.",
    sections=[
        ("1", "Request", "Operations observed sluggish response and air leakage through the main air blower inlet guide vane mechanism during regenerator air trimming."),
        ("2", "Symptoms and detection", "Main air blower power consumption power_CAB remained elevated at partial loads. Air flow tag F_air_x29 failed to track set point cleanly, resulting in erratic flue gas oxygen swings on fluegas_O2_pct outside [IOW-FCC-02 r2 §3.3]."),
        ("3", "Diagnosis", "Pneumatic positioner pilot valve linkage worn with 6% mechanical deadband; guide vane mechanical stop bolts drifted from factory datum."),
        ("4", "Work performed", "Mechanical team overhauled the pneumatic rotary actuator, replaced feedback cam linkage, and lubricated internal pinion bushings. Work executed during unit throughput reduction over 8 hours."),
        ("5", "Return to service and verification", "Stroke testing confirmed guide vane response linearity from 15% to 95% stroke with zero hunting. Flue gas oxygen stabilized cleanly at 1.8%."),
        ("6", "Lessons and follow-ups", "Establish quarterly actuator dynamic stroking and linkage calibration in the maintenance schedule.")
    ]
)

# WO-25007
write_wo(
    doc_id="WO-25007",
    title="Reactor-to-fractionator differential pressure increase: investigation",
    revision=1,
    effective_date="2025-01-14",
    owner_role="Process engineer (fractionation)",
    tags=["P5_frac_psia", "conversion_pct"],
    events=[],
    related=["IOW-FRAC-01"],
    summary="Engineering investigation and line clearing of vapor transfer line pressure tap bridging between the reactor stripper and main fractionator.",
    sections=[
        ("1", "Request", "Operations requested engineering evaluation of an anomalous rising differential pressure indication across the reactor overhead vapor line."),
        ("2", "Symptoms and detection", "Indicated differential pressure between reactor overhead and fractionator inlet P5_frac_psia expanded by 1.8 psi over three weeks. Overall cracking conversion conversion_pct appeared artificially biased."),
        ("3", "Diagnosis", "Impulse line purge rotameter fouled with catalyst fines, causing partial plugging of the fractionator inlet pressure transmitter tap per [IOW-FRAC-01 r2 §3.4]."),
        ("4", "Work performed", "Instrument technician Ravi Menon isolated the high-pressure impulse leg, executed a controlled nitrogen back-purge, and replaced the continuous purge check valve assembly over 3 hours."),
        ("5", "Return to service and verification", "Impulse lines re-commissioned with continuous nitrogen purge set at 1.5 scfh. Indicated differential pressure returned to true baseline reading of 0.4 psi."),
        ("6", "Lessons and follow-ups", "Upgrade purge rotameters to differential-pressure-regulated constant flow purge blocks.")
    ]
)

# WO-25041
write_wo(
    doc_id="WO-25041",
    title="Feed/effluent heat exchanger fouling (UA decrease): cleaning",
    revision=1,
    effective_date="2025-03-03",
    owner_role="Reliability engineer",
    tags=["dist_T_feed_in_F", "feed_flow_lb_s"],
    events=[],
    related=["IOW-FCC-02"],
    summary="Turnaround maintenance record for chemical cleaning and tube descaling of the fresh feed preheat exchanger train.",
    sections=[
        ("1", "Request", "Operations reported inability to sustain target fresh feed preheat temperature without exceeding furnace firing limits."),
        ("2", "Symptoms and detection", "Feed preheat temperature dist_T_feed_in_F degraded by 16 °F below design at constant feed rate feed_flow_lb_s, indicating a 22% reduction in overall heat transfer coefficient UA breaching [IOW-FCC-02 r2 §3.4]."),
        ("3", "Diagnosis", "Heavy asphaltene and particulate deposition on the heavy slurry shell-side passes of exchanger train E-101A/B."),
        ("4", "Work performed", "Isolated exchanger train and circulated warm chemical solvent followed by high-pressure automated lance tube hydroblasting over 24 hours under Owen Hartley."),
        ("5", "Return to service and verification", "Exchanger recommissioned; feed inlet temperature restored from 444.9 °F back to design baseline 460.9 °F with furnace firing trimmed by 12%."),
        ("6", "Lessons and follow-ups", "Evaluate antifoulant chemical injection upstream of the slurry exchange train.")
    ]
)

# WO-25066
write_wo(
    doc_id="WO-25066",
    title="Fresh-feed flow meter drift: recalibration",
    revision=1,
    effective_date="2025-04-22",
    owner_role="Instrument technician",
    tags=["feed_flow_lb_s", "Tr_riser_F"],
    events=[],
    related=["IOW-FCC-02"],
    summary="Calibration and zero-point recalibration of the primary Coriolis mass flow transmitter on the fresh feed charge line.",
    sections=[
        ("1", "Request", "Routine mass balance reconciliation indicated a 2.1% negative discrepancy between unit feed charge and product sum."),
        ("2", "Symptoms and detection", "Fresh feed flow tag feed_flow_lb_s read 161.5 lb/s while upstream storage tank depletion calculations indicated 165.0 lb/s. Riser outlet temperature Tr_riser_F showed unexplained sensitivity to minor feed trims outside [IOW-FCC-02 r2 §3.1]."),
        ("3", "Diagnosis", "Zero-point calibration shift on the primary Coriolis mass flowmeter caused by mechanical pipe strain following thermal cycling."),
        ("4", "Work performed", "Instrument technician Ravi Menon performed zero-point calibration under zero-flow blocked-in conditions, relaxed pipe flange tension, and verified drive gain metrics over 5 hours."),
        ("5", "Return to service and verification", "Flowmeter zero confirmed within ±0.02 lb/s. Unit mass balance error closed to within 0.3% upon resumption of steady feed flow."),
        ("6", "Lessons and follow-ups", "Install spring hangers on adjacent pipe spools to eliminate external mechanical bending moments.")
    ]
)

# WO-25090
write_wo(
    doc_id="WO-25090",
    title="LCO sample point: line flushing and sample cooler repair",
    revision=1,
    effective_date="2025-06-16",
    owner_role="Maintenance planner",
    tags=["lab_sample", "LCO_T98_F"],
    events=[],
    related=["LAB-SMP-03"],
    summary="Corrective maintenance on sample station SP-LCO-01 including sample cooler coil replacement and fast-loop bypass line descaling.",
    sections=[
        ("1", "Request", "Laboratory reported cloudy, discolored LCO samples with erratic flash points collected from station SP-LCO-01."),
        ("2", "Symptoms and detection", "Sample collection took over 8 minutes due to restricted flow; sample effluent temperature exceeded 110 °F, causing light-end boiling off and corrupting LCO_T98_F lab results. Soft-sensor trust dropped to AMBER due to lab reconciliation discrepancies."),
        ("3", "Diagnosis", "Helical cooling coil in cooler CW-SC-101 was cracked on the cooling water jacket side, allowing water ingress into sample lines per [LAB-SMP-03 r1 §3.1]."),
        ("4", "Work performed", "Mechanical team under Victor Petrov isolated station SP-LCO-01, replaced the stainless steel cooling coil assembly, and steam-flushed the fast-loop bypass manifold over 6 hours."),
        ("5", "Return to service and verification", "Cooler hydrotested at 225 psig; sample effluent temperature confirmed at 72 °F with crystal-clear liquid appearance. Laboratory validation restored to ACCEPT status."),
        ("6", "Lessons and follow-ups", "Establish quarterly hydrostatic testing of all unit sample coolers.")
    ]
)

# WO-25118
write_wo(
    doc_id="WO-25118",
    title="Fractionator pressure transmitter (P5) calibration",
    revision=1,
    effective_date="2025-08-05",
    owner_role="Instrument technician",
    tags=["P5_frac_psia", "T_tray01_F"],
    events=[],
    related=["IOW-FRAC-01"],
    summary="Five-point calibration and diaphragm seal inspection of the main fractionator overhead pressure transmitter.",
    sections=[
        ("1", "Request", "Operations noted minor discrepancy between board indication P5_frac_psia and redundant transmitter P5_dup during wet gas compressor load changes."),
        ("2", "Symptoms and detection", "Indicated overhead pressure drifted 0.6 psi lower than redundant sensor, resulting in minor fluctuations in top tray vapor temperature T_tray01_F outside limits in [IOW-FRAC-01 r2 §3.4]."),
        ("3", "Diagnosis", "Slight zero-shift and capillary fill fluid micro-leakage in remote diaphragm seal assembly."),
        ("4", "Work performed", "Ravi Menon isolated transmitter block valves, installed a replacement pre-filled capillary diaphragm seal assembly, and completed a 5-point calibration using a certified deadweight tester over 4 hours."),
        ("5", "Return to service and verification", "Transmitter tracking verified across 0 to 50 psia range; output aligned with redundant transmitter within 0.05 psi."),
        ("6", "Lessons and follow-ups", "Add capillary armor inspection to semi-annual instrument walkdown rounds.")
    ]
)

# WO-25152
write_wo(
    doc_id="WO-25152",
    title="Lab distillation analyser maintenance (8 h lab outage)",
    revision=1,
    effective_date="2025-10-27",
    owner_role="Lab supervisor",
    tags=["lab_sample"],
    events=[],
    related=["LAB-D86-01"],
    summary="Scheduled maintenance and optical sensor overhaul on the primary automated atmospheric distillation analyzer, causing an 8-hour laboratory testing outage.",
    sections=[
        ("1", "Request", "Laboratory supervisor scheduled preventive maintenance and optical receiver calibration on automated distillation unit D-101."),
        ("2", "Symptoms and detection", "Optical receiver meniscus tracking exhibited minor hunting during 90% to 98% recovery stages. Scheduled 8-hour outage flagged in the plant logbook; tag lab_sample suspended during the outage window."),
        ("3", "Diagnosis", "Normal mechanical wear on optical carriage lead screw and residue accumulation on receiver viewing prism, requiring procedure under [LAB-D86-01 r2 §4.1]."),
        ("4", "Work performed", "Lab supervisor Grace Mwangi stripped optical carriage, replaced drive belt, cleaned receiver optics with optical-grade solvent, and replaced temperature sensor probe over 8 hours."),
        ("5", "Return to service and verification", "Ran three certified calibration reference standards; repeatability confirmed within r = 3.5 °F. Analyzer released back to operations."),
        ("6", "Lessons and follow-ups", "Pre-notify operations 24 hours prior to scheduled analyzer servicing to optimize operational cut-point holds.")
    ]
)

# WO-26012
write_wo(
    doc_id="WO-26012",
    title="Condenser cooling-water valve positioner replacement",
    revision=1,
    effective_date="2026-01-19",
    owner_role="Instrument technician",
    tags=["MV_cw_flow", "dist_condenser_eff"],
    events=[],
    related=["IOW-HX-03"],
    summary="Replacement and smart digital tuning of the electro-pneumatic valve positioner on fractionator overhead cooling water control valve.",
    sections=[
        ("1", "Request", "Board operator reported persistent control hunting on cooling water flow tag MV_cw_flow during ambient temperature shifts."),
        ("2", "Symptoms and detection", "Cooling water valve oscillated ±8% stroke continuously, causing minor cycling in overhead condenser efficiency dist_condenser_eff between 0.890 and 0.910 per [IOW-HX-03 r1 §3.2]."),
        ("3", "Diagnosis", "Moisture ingress into pneumatic positioner housing caused corrosion on flapper nozzle assembly and intermittent signal distortion."),
        ("4", "Work performed", "Instrument technician Ravi Menon replaced the positioner with a hermetically sealed digital positioner, installed an inline instrument air desiccant filter, and executed auto-tuning over 3 hours."),
        ("5", "Return to service and verification", "Valve stroked smoothly across full range with step response damping under 2 seconds; flow hunting eliminated entirely."),
        ("6", "Lessons and follow-ups", "Inspect instrument air header trap drains across the condenser battery weekly.")
    ]
)

# WO-26049
write_wo(
    doc_id="WO-26049",
    title="Pumparound PA3 control valve sticking",
    revision=1,
    effective_date="2026-04-08",
    owner_role="Instrument technician",
    tags=["MV_PA3", "T_tray06_F"],
    events=[],
    related=["IOW-HX-03"],
    summary="Field servicing and packing adjustment of the pumparound PA3 flow control valve following mechanical stem friction.",
    sections=[
        ("1", "Request", "Operations noted that pumparound PA3 circulation failed to respond to minor controller trims."),
        ("2", "Symptoms and detection", "Flow tag MV_PA3 remained stationary until controller output stepped by >5%, then jumped abruptly. Column tray temperature T_tray06_F exhibited minor secondary perturbations breaching [IOW-HX-03 r1 §3.4]. The soft-sensor cockpit detected the mechanical restriction and issued an advisory alert, taking no automated control action."),
        ("3", "Diagnosis", "Over-tightened graphite packing gland caused excessive stem friction and 7% mechanical hysteresis."),
        ("4", "Work performed", "Technician Ravi Menon loosened packing gland nuts, injected silicone-based stem lubricant, and re-torqued gland bolts to manufacturer specification over 2 hours."),
        ("5", "Return to service and verification", "Valve tested under dynamic operational conditions; valve stem stroke response showed linearity with deadband reduced to <0.8%."),
        ("6", "Lessons and follow-ups", "Ensure instrument technicians adhere strictly to calibrated torque wrenches during valve packing adjustments.")
    ]
)

print("WP3 generation complete.")
