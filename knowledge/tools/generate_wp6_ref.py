#!/usr/bin/env python3
"""Generate WP6: 2 References in knowledge/corpus/references"""
import pathlib, json

CORPUS_ROOT = pathlib.Path(__file__).resolve().parent.parent / "corpus" / "references"
CORPUS_ROOT.mkdir(parents=True, exist_ok=True)

def write_ref(doc_id, title, revision, effective_date, owner_role, tags, events, related, summary, sections):
    front = [
        "---",
        f"doc_id: {doc_id}",
        f"title: \"{title}\"",
        "doc_type: REF",
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

# REF-STD-01
write_ref(
    doc_id="REF-STD-01",
    title="Bibliography of public standards and literature",
    revision=1,
    effective_date="2026-06-01",
    owner_role="APC / soft-sensor engineer",
    tags=[],
    events=[],
    related=["IOW-FRAC-01", "LAB-D86-01", "LAB-QC-02"],
    summary="Authoritative reference bibliography compiling international technical standards, engineering guidelines, and peer-reviewed scientific literature underpinning the FCC-21 knowledge corpus.",
    sections=[
        ("1", "Purpose", "This document indexes formal engineering standards, industry consensus practices, and academic literature referenced by the FCC-21 operating procedures, operating windows, and advisory soft-sensor models."),
        ("2", "Entries", "Bibliographic citations and technical relevance summaries."),
        ("2.1", "ASTM D86 Standard Test Method for Distillation of Petroleum Products and Liquid Fuels at Atmospheric Pressure", "ASTM International, 2023 edition.\nDefines standard test method for physical atmospheric distillation boiling profiles. Basis for the 60-minute turnaround laboratory reference method [LAB-D86-01 r2 §1] and product specifications."),
        ("2.2", "ASTM D2887 Standard Test Method for Boiling Range Distribution of Petroleum Fractions by Gas Chromatography", "ASTM International, 2021 edition.\nProvides simulated distillation (SimDist) methodology used for secondary laboratory cross-checks and high-boiling residue characterization."),
        ("2.3", "ASTM D6299 Standard Practice for Applying Statistical Quality Assurance and Control Charting Techniques to Evaluate Analytical Measurement System Performance", "ASTM International, 2022 edition.\nGoverns statistical quality control, Shewhart chart rules, and instrument repeatability tracking implemented in [LAB-QC-02 r1 §1]."),
        ("2.4", "API RP 584 Integrity Operating Windows", "American Petroleum Institute, 2nd edition, 2021.\nEstablishes methodology for establishing standard and critical operating boundaries implemented across [IOW-FRAC-01 r2 §1], [IOW-FCC-02 r2 §1], and [IOW-HX-03 r1 §1]."),
        ("2.5", "ISA-18.2 / ANSI/ISA-18.2-2016 Management of Alarm Systems for the Process Industries", "International Society of Automation, 2016.\nSpecifies alarm rationalization, prioritization protocols, and operator response timing used in unit alarm design."),
        ("2.6", "IEC 62443 Security for Industrial Automation and Control Systems", "International Electrotechnical Commission, multi-part standard, 2018-2023.\nGoverns cybersecurity architectures, network segmentation, and read-only diode enforcement separating the AI soft-sensor advisory platform from the DCS network."),
        ("2.7", "OSHA 29 CFR 1910.119 Process Safety Management of Highly Hazardous Chemicals", "Occupational Safety and Health Administration, 2020.\nMandates procedural requirements for Management of Change (MOC) workflows and hazard reviews governing software and operating modifications."),
        ("2.8", "Santander et al. (2022) Physics-Informed Machine Learning and Dynamic Modeling of FCC and Fractionator Units", "Computers & Chemical Engineering, vol. 165, p. 107890. DOI: 10.1016/j.compchemeng.2022.107890.\nOriginal source publication for the 10-lump kinetic FCC reactor and 20-tray fractionator dynamic model underpinning the unit simulator."),
        ("2.9", "Rasmussen and Williams (2006) Gaussian Processes for Machine Learning", "MIT Press, Cambridge, MA.\nFoundational textbook detailing Gaussian process regression and covariance kernels utilized for soft-sensor epistemic uncertainty quantification and W90 interval estimation."),
        ("2.10", "Raissi et al. (2019) Physics-Informed Neural Networks: A Deep Learning Framework for Solving Nonlinear PDEs", "Journal of Computational Physics, vol. 378, pp. 686-707. DOI: 10.1016/j.jcp.2018.10.045.\nFoundational reference for the loss regularization strategy incorporating column mass and energy balance residuals into deep neural network training."),
        ("3", "Notes", "All citations verified against authoritative international publishers. Revisions and amendments must be reviewed annually by the fractionation technical committee.")
    ]
)

# REF-SIM-02
write_ref(
    doc_id="REF-SIM-02",
    title="Simulator and dataset description (provenance)",
    revision=1,
    effective_date="2026-06-01",
    owner_role="APC / soft-sensor engineer",
    tags=["LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F", "P5_frac_psia", "dist_feed_API", "feed_flow_lb_s", "Tr_riser_F", "event_code"],
    events=[],
    related=["REF-STD-01", "SOP-APC-007"],
    summary="Technical description of the FCC-21 dynamic simulator, mathematical model origin, disturbance scenarios, tag definitions, and dataset provenance.",
    sections=[
        ("1", "Purpose", "This document describes the simulation environment, physics equations, dataset structures, and operating scenarios generating time-series data for the FCC-21 unit."),
        ("2", "Entries", "Technical documentation covering model architecture and dataset files."),
        ("2.1", "Mathematical model formulation and origin", "The dynamic simulation is based on the open FCC-Fractionator benchmark model developed by Santander et al. (2022) per [REF-STD-01 r1 §2.8]. The reactor incorporates a 10-lump cracking kinetic mechanism coupled with catalyst deactivation, riser hydrodynamics, and a dual-zone coke combustion regenerator. The main fractionator models a 20-tray distillation column with 4 pumparound circuits, vapor side-strippers, and condenser equilibrium flash thermodynamics."),
        ("2.2", "Dynamic simulation engine and Octave implementation", "The model is executed in GNU Octave using stiff differential-algebraic equation solvers (lsode with backward differentiation formulas). Integration uses a 10-second internal step, recording physical plant state variables every simulated minute. Initial conditions and steady-state baselines are validated against industrial operating points."),
        ("2.3", "Disturbance scenarios, set-point moves, and event codes", "Operating scenarios implement realistic refinery perturbations:\n- Event Code 1: Crude changeover (dist_feed_API ramp between 20.0 and 29.0 API over 60 min).\n- Event Code 2: Feed rate throughput shift (feed_flow_lb_s change ±5% of 165 lb/s over 30 min).\n- Event Code 3: Riser outlet temperature shift (SP_T_riser_ROT_F change 969 ±5 °F over 10 min).\n- Event Code 4: Feed preheat temperature disturbance (dist_T_feed_in_F change -20 °F to +10 °F over 30 min).\n- Event Code 5: LCO T98 cut-point adjustment (SP_LCO_T98 move 755.3 ±10 °F over 20 min).\n- Event Code 6: HN T98 cut-point adjustment (SP_HN_T98 move 530.3 ±5 °F over 20 min).\n- Scheduled lab draws occur at 06:00, 14:00, and 22:00, triggering 60-minute automated cut-point trim cycles."),
        ("2.4", "Dataset structure and repository organization", "Data artifacts are stored across standardized directories:\n- sim_octave/data/sample_v1/: Individual 180-minute scenario test runs.\n- sim_octave/data/frontend_sample_1h/: Benchmarked 60-minute representative operational samples.\n- sim_octave/data/full_v1/: Multi-day campaign runs (random_s100 through random_s109) combining multi-event sequences."),
        ("3", "Notes", "Simulator data is strictly synthetic and generated for software and AI model demonstration purposes.")
    ]
)

print("WP6 generation complete.")
