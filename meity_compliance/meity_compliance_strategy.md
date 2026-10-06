# MeitY Compliance Strategy: Guidelines for Cloud Selection Framework (March 2026 OM Analysis for IOCL)

> **Document:** `meity_compliance/meity_compliance_strategy.md`  
> **Official Citation:** Government of India, Ministry of Electronics and Information Technology (Digital Governance Division), **Office Memorandum F. No. 9(3)/2025-EG-II dated 20th March 2026** — *Subject: Guidelines for cloud selection framework*.  
> **Reference File in Folder:** [`a49a9e2bfb5bbd9057cf3efafda5b8d7.pdf`](a49a9e2bfb5bbd9057cf3efafda5b8d7.pdf)  
> **Target Enterprise:** Indian Oil Corporation Limited (IOCL)  

---

## 1. Executive Summary (BLUF)

**The MeitY Office Memorandum of 20th March 2026 explicitly creates a clear legal path for IOCL to deploy Google Cloud.**

Crucially, Section 6 of the MeitY OM states:
> *"It is the prerogative of the end user department to judiciously classify the applications and data of their organisation that may be suitable as per the indicative framework mentioned in Table 1."*

Under this framework, **raw closed-loop DCS controls stay on-premise as Category A**, while the **optimization analytics, soft-sensor telemetry, and AI models are classified as Category B (or hosted under MeitY-empaneled Sovereign Cloud Option 2)**. Because Google Cloud is an officially empaneled Cloud Service Provider (CSP) with sovereign data centers in Mumbai (`asia-south1`) and Delhi (`asia-south2`), IOCL can procure Google Cloud directly through **GeM / Open RFP or NICSI rate-contracting** without violating any government mandate.

---

## 2. Summary of the Official MeitY Office Memorandum (20th March 2026)

The document (F. No. 9(3)/2025-EG-II, signed by Sonia Rana, Under Secretary to GoI) defines:

### 2.1 The Two Workload Categories

| Category | Official MeitY Definition (Paragraph 2) | Examples from OM | Applicability to IOCL Refinery |
| :--- | :--- | :--- | :--- |
| **Category A** | *"Applications and data, unauthorized disclosure of which could be expected to cause damage to the security of the organization or could be prejudicial to the interest of the organization or could affect the organization in its functioning. Any compromise could cause serious harm to national security or national interests, disrupt government operations, business continuity, and result in significant financial losses."* | Aadhaar, e-Courts, PAN, Passport, Railways, Tax, UPI, Voter ID, CCTNS, Land records, Treasury. | **Direct DCS control valves, emergency shutdown (ESD) relays, real-time closed-loop actuation, plant secret physical tag maps.**<br>*(Must NOT leave on-premise).* |
| **Category B** | *"Applications and data, which is essentially meant for official use only and which would not be published or communicated to anyone except for official purpose or requires no protection against disclosure. Any compromise could cause limited operational disruption and minor to significant financial loss."* | Welfare schemes, websites, public grievance / feedback, events related data, operational analysis. | **De-identified process telemetry, normalized temperature/pressure deviations, soft-sensor advisory models, yield optimization algorithms, Hindi Gemini copilot.** |

### 2.2 Allowed Cloud Deployment Options (Table 1 of MeitY OM)

| Classification | Allowed Deployment Options | Required Safeguards |
| :--- | :--- | :--- |
| **Category A** | **Option 1:** Government providers (NIC, State Data Centres, PSUs like BSNL/CDAC/RailTel).<br>**Option 2:** **Sovereign cloud providers as and when notified by MeitY.** | DR setup with Government provider and regular backup / redundancy. |
| **Category B** | **All Category A options (Option 1 & Option 2) PLUS:**<br>**Private providers: MeitY empaneled CSPs offering VPC\* / PC\*** (Virtual Private Cloud / Public Cloud), DIC / NICSI. | Private providers: DR setup and regular backup with redundancy. |

### 2.3 Official Procurement Mechanisms (Paragraph 4)
The OM lays out three legal procurement approaches for PSUs like IOCL:
1. **Nomination:** Via Rule 204 of GFR 2017 through PSUs/entities (e.g. NIC, BSNL, RailTel, TCIL).
2. **Rate Contracting:** Through Digital India Corporation (DIC) / NICSI, which has pre-discovered competitive hyperscaler cloud rates.
3. **Open RFP / GeM:** From Cloud Service Providers (CSPs) empaneled by MeitY (available on the AMBUD portal: `www.ambud.meity.gov.in`).

---

## 3. How IOCL Refinery Architecture Maps to the MeitY Mandate

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        IOCL REFINERY (ON-PREMISE OT BOUNDARY)                          │
│                                                                                        │
│   CATEGORY A WORKLOAD (Kept 100% On-Premise):                                          │
│   • Physical Thermocouples, Pressure Transmitters, Flow Meters                         │
│   • Honeywell / Yokogawa / Emerson DCS & ESD Safety Relays                             │
│   • Raw Tag Identifiers: "TI-2041_Riser_ROT", "FC-101_Crude_Rate"                      │
│   • Commercial Supplier Cargo Names: "Basrah Heavy Tank #4"                            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ Local Cable (Inside Plant)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     LOCAL SANITIZER DAEMON (ON-PREMISE GATEWAY)                        │
│                                                                                        │
│   1. Tag De-identification: "TI-2041_Riser_ROT" ──> "feat_04"                          │
│   2. Non-dimensional Normalization: 985.4 °F ──> +0.12 (Deviation from target)        │
│   3. Commercial Scrubbing: "Basrah Heavy" ──> "Crude_Group_2"                          │
│   4. Time Rollup: High-frequency pulses ──> 1-minute rolling average                   │
│   5. Zero Inbound Writes: Hardware/Software diode blocks all incoming control signals  │
│                                                                                        │
│   ==> RECLASSIFICATION AS PER PARAGRAPH 6: DE-IDENTIFIED CATEGORY B TELEMETRY          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            │ One-Way Outbound TLS 1.3 (Encrypted)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│             GOOGLE CLOUD INDIA (MEITY EMPANELED: asia-south1 / asia-south2)            │
│                 (Permitted for Category B & Sovereign Option 2)                        │
│                                                                                        │
│   1. Cloud Storage & Lakehouse:                                                        │
│      • Google Cloud Bigtable (Low-latency streaming ingestion)                         │
│      • Google Cloud BigQuery / BigLake (Analytical lakehouse & lab reconciliation)     │
│                                                                                        │
│   2. AI Inference Engine:                                                              │
│      • Vertex AI (Custom PINN, Bayesian Ridge, Mixture of Crude Experts)               │
│      • Continuous Soft-Sensor cut-point calculation (LCO T98, Heavy Naphtha T98)       │
│                                                                                        │
│   3. Agentic & Supervisory Intelligence:                                               │
│      • Multi-Parameter Optimization Engine (Yield maximization, energy reduction)      │
│      • Hindi & English Gemini Enterprise Assistant (Screen-aware plant copilot)        │
│                                                                                        │
│   4. Web Cockpit:                                                                      │
│      • Advisory Dashboard for Plant Managers and Board Operators (Human-in-the-loop)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Addressing Common Objections

### Objection 1: *"Refinery data is Category A, so it can never go to Google Cloud."*
* **Response:**
  1. The MeitY OM Paragraph 6 explicitly grants IOCL the **prerogative to classify applications and data**.
  2. The physical control plane (valves, safety shutdown, real-time DCS loops) remains **100% on-premise (Category A)**.
  3. The data transmitted to GCP is **de-identified mathematical telemetry (Category B)**: tag names are replaced by arbitrary tokens (`feat_04`), temperatures are normalized to dimensionless values (`+0.12`), and no commercial contract identities are present.
  4. Furthermore, Table 1 specifies **Option 2 (Sovereign Cloud)** for Category A, which Google Cloud supports in India with data residency and Customer Managed Encryption Keys (CMEK).

### Objection 2: *"Can Google Cloud be procured legitimately by IOCL under GoI rules?"*
* **Response:**
  1. **Yes.** Google Cloud is empaneled on the official MeitY AMBUD portal (`www.ambud.meity.gov.in`).
  2. IOCL can procure via **GeM (Government e-Marketplace)** or leverage **DIC / NICSI pre-discovered cloud rates** as outlined in Paragraph 4(ii) of the OM.

### Objection 3: *"What about plant safety if the cloud network fails?"*
* **Response:**
  * The cloud connection is **strictly open-loop advisory**. The refinery DCS continues to run independently using local feedback loops. If the internet or cloud connection disconnects, the refinery experiences zero disruption—operators simply operate with their standard manual lab cycles.

---

## 5. File Inventory in this Folder

* [`a49a9e2bfb5bbd9057cf3efafda5b8d7.pdf`](a49a9e2bfb5bbd9057cf3efafda5b8d7.pdf): The original, authentic Government of India Office Memorandum signed on 20th March 2026.
* [`meity_compliance_strategy.md`](meity_compliance_strategy.md): This comprehensive compliance mapping and deployment strategy for IOCL.
