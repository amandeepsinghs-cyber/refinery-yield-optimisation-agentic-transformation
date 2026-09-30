---
doc_id: REF-STD-01
title: "Bibliography of public standards and literature"
doc_type: REF
revision: 1
effective_date: 2026-06-01
owner_role: "APC / soft-sensor engineer"
unit: FCC-21
status: SIMULATED
related_tags: []
related_events: []
related_docs: ["IOW-FRAC-01", "LAB-D86-01", "LAB-QC-02"]
summary: "Authoritative reference bibliography compiling international technical standards, engineering guidelines, and peer-reviewed scientific literature underpinning the FCC-21 knowledge corpus."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

This document indexes formal engineering standards, industry consensus practices, and academic literature referenced by the FCC-21 operating procedures, operating windows, and advisory soft-sensor models.

## 2 Entries

Bibliographic citations and technical relevance summaries.

### 2.1 ASTM D86 Standard Test Method for Distillation of Petroleum Products and Liquid Fuels at Atmospheric Pressure

ASTM International, 2023 edition.
Defines standard test method for physical atmospheric distillation boiling profiles. Basis for the 60-minute turnaround laboratory reference method [LAB-D86-01 r2 §1] and product specifications.

### 2.2 ASTM D2887 Standard Test Method for Boiling Range Distribution of Petroleum Fractions by Gas Chromatography

ASTM International, 2021 edition.
Provides simulated distillation (SimDist) methodology used for secondary laboratory cross-checks and high-boiling residue characterization.

### 2.3 ASTM D6299 Standard Practice for Applying Statistical Quality Assurance and Control Charting Techniques to Evaluate Analytical Measurement System Performance

ASTM International, 2022 edition.
Governs statistical quality control, Shewhart chart rules, and instrument repeatability tracking implemented in [LAB-QC-02 r1 §1].

### 2.4 API RP 584 Integrity Operating Windows

American Petroleum Institute, 2nd edition, 2021.
Establishes methodology for establishing standard and critical operating boundaries implemented across [IOW-FRAC-01 r2 §1], [IOW-FCC-02 r2 §1], and [IOW-HX-03 r1 §1].

### 2.5 ISA-18.2 / ANSI/ISA-18.2-2016 Management of Alarm Systems for the Process Industries

International Society of Automation, 2016.
Specifies alarm rationalization, prioritization protocols, and operator response timing used in unit alarm design.

### 2.6 IEC 62443 Security for Industrial Automation and Control Systems

International Electrotechnical Commission, multi-part standard, 2018-2023.
Governs cybersecurity architectures, network segmentation, and read-only diode enforcement separating the AI soft-sensor advisory platform from the DCS network.

### 2.7 OSHA 29 CFR 1910.119 Process Safety Management of Highly Hazardous Chemicals

Occupational Safety and Health Administration, 2020.
Mandates procedural requirements for Management of Change (MOC) workflows and hazard reviews governing software and operating modifications.

### 2.8 Santander et al. (2022) Physics-Informed Machine Learning and Dynamic Modeling of FCC and Fractionator Units

Computers & Chemical Engineering, vol. 165, p. 107890. DOI: 10.1016/j.compchemeng.2022.107890.
Original source publication for the 10-lump kinetic FCC reactor and 20-tray fractionator dynamic model underpinning the unit simulator.

### 2.9 Rasmussen and Williams (2006) Gaussian Processes for Machine Learning

MIT Press, Cambridge, MA.
Foundational textbook detailing Gaussian process regression and covariance kernels utilized for soft-sensor epistemic uncertainty quantification and W90 interval estimation.

### 2.10 Raissi et al. (2019) Physics-Informed Neural Networks: A Deep Learning Framework for Solving Nonlinear PDEs

Journal of Computational Physics, vol. 378, pp. 686-707. DOI: 10.1016/j.jcp.2018.10.045.
Foundational reference for the loss regularization strategy incorporating column mass and energy balance residuals into deep neural network training.

## 3 Notes

All citations verified against authoritative international publishers. Revisions and amendments must be reviewed annually by the fractionation technical committee.
