# Validation Traceability Matrix

> **Generated:** 2026-08-13T20:29:25.827Z
> **Status:** Test results not provided — status shown as UNKNOWN  
> **Requirements covered:** 14 / 16  
> **Tagged test cases:** 39  

---

## Summary

| Metric | Value |
|---|---|
| Total regulatory requirements | 16 |
| Requirements with ≥1 test | 14 |
| Requirements with no test coverage | 2 |
| Total tagged test cases | 39 |

---

## Traceability Matrix

| Requirement ID | Strategic Pillar | Description | Test File | Line | Test Name | Suite | Status |
|---|---|---|---|---|---|---|---|
| `REQ-21CFR11-001` | `Reproducibility` | 21 CFR Part 11 – All electronic records must embed the application semantic version | `tests_e2e/audit-trail.spec.ts` | 176 | R script contains application semantic version | 21 CFR Part 11 – Audit Trail: generated code artifact provenance | ⬜ UNKNOWN |
| `REQ-21CFR11-001` | `Reproducibility` | 21 CFR Part 11 – All electronic records must embed the application semantic version | `tests_e2e/audit-trail.spec.ts` | 205 | Python script contains application semantic version |  | ⬜ UNKNOWN |
| `REQ-21CFR11-001` | `Reproducibility` | 21 CFR Part 11 – All electronic records must embed the application semantic version | `tests_e2e/audit-trail.spec.ts` | 234 | SAS script contains application semantic version |  | ⬜ UNKNOWN |
| `REQ-21CFR11-001` | `Reproducibility` | 21 CFR Part 11 – All electronic records must embed the application semantic version | `tests_e2e/audit-trail.spec.ts` | 263 | Stata script contains application semantic version |  | ⬜ UNKNOWN |
| `REQ-21CFR11-002` | `Reproducibility` | 21 CFR Part 11 – Electronic records must carry an ISO 8601 generation timestamp | `tests_e2e/audit-trail.spec.ts` | 182 | R script contains a valid ISO 8601 generated-at timestamp |  | ⬜ UNKNOWN |
| `REQ-21CFR11-002` | `Reproducibility` | 21 CFR Part 11 – Electronic records must carry an ISO 8601 generation timestamp | `tests_e2e/audit-trail.spec.ts` | 211 | Python script contains a valid ISO 8601 generated-at timestamp |  | ⬜ UNKNOWN |
| `REQ-21CFR11-002` | `Reproducibility` | 21 CFR Part 11 – Electronic records must carry an ISO 8601 generation timestamp | `tests_e2e/audit-trail.spec.ts` | 240 | SAS script contains a valid ISO 8601 generated-at timestamp |  | ⬜ UNKNOWN |
| `REQ-21CFR11-002` | `Reproducibility` | 21 CFR Part 11 – Electronic records must carry an ISO 8601 generation timestamp | `tests_e2e/audit-trail.spec.ts` | 269 | Stata script contains a valid ISO 8601 generated-at timestamp |  | ⬜ UNKNOWN |
| `REQ-21CFR11-003` | `Reproducibility` | 21 CFR Part 11 – The unique protocol identifier must appear in every generated artifact | `tests_e2e/audit-trail.spec.ts` | 188 | R script contains the trial protocol identifier |  | ⬜ UNKNOWN |
| `REQ-21CFR11-003` | `Reproducibility` | 21 CFR Part 11 – The unique protocol identifier must appear in every generated artifact | `tests_e2e/audit-trail.spec.ts` | 217 | Python script contains the trial protocol identifier |  | ⬜ UNKNOWN |
| `REQ-21CFR11-003` | `Reproducibility` | 21 CFR Part 11 – The unique protocol identifier must appear in every generated artifact | `tests_e2e/audit-trail.spec.ts` | 246 | SAS script contains the trial protocol identifier |  | ⬜ UNKNOWN |
| `REQ-21CFR11-003` | `Reproducibility` | 21 CFR Part 11 – The unique protocol identifier must appear in every generated artifact | `tests_e2e/audit-trail.spec.ts` | 275 | Stata script contains the trial protocol identifier |  | ⬜ UNKNOWN |
| `REQ-21CFR11-003` | `Reproducibility` | 21 CFR Part 11 – The unique protocol identifier must appear in every generated artifact | `tests_e2e/audit-trail.spec.ts` | 452 | results header displays the protocol identifier |  | ⬜ UNKNOWN |
| `REQ-21CFR11-004` | `Reproducibility` | 21 CFR Part 11 – Audit trail must record the exact PRNG seed used for schema generation | `tests_e2e/audit-trail.spec.ts` | 199 | R script contains the PRNG seed initialisation statement |  | ⬜ UNKNOWN |
| `REQ-21CFR11-004` | `Reproducibility` | 21 CFR Part 11 – Audit trail must record the exact PRNG seed used for schema generation | `tests_e2e/audit-trail.spec.ts` | 228 | Python script contains the PRNG seed initialisation statement |  | ⬜ UNKNOWN |
| `REQ-21CFR11-004` | `Reproducibility` | 21 CFR Part 11 – Audit trail must record the exact PRNG seed used for schema generation | `tests_e2e/audit-trail.spec.ts` | 257 | SAS script contains the PRNG seed initialisation statement |  | ⬜ UNKNOWN |
| `REQ-21CFR11-004` | `Reproducibility` | 21 CFR Part 11 – Audit trail must record the exact PRNG seed used for schema generation | `tests_e2e/audit-trail.spec.ts` | 286 | Stata script contains the PRNG seed initialisation statement |  | ⬜ UNKNOWN |
| `REQ-21CFR11-004` | `Reproducibility` | 21 CFR Part 11 – Audit trail must record the exact PRNG seed used for schema generation | `tests_e2e/audit-trail.spec.ts` | 444 | results header displays the randomization seed used for the schema | 21 CFR Part 11 – Audit Trail: results grid metadata stamping | ⬜ UNKNOWN |
| `REQ-21CFR11-005` | `Reproducibility` | 21 CFR Part 11 – PDF/XLSX exports must embed a SHA-256 audit hash for integrity verification | `scripts/verify_audit_hash.py` | 2 | Execute scripts/verify_audit_hash.py | Standalone Script | ⬜ UNKNOWN |
| `REQ-21CFR11-005` | `Reproducibility` | 21 CFR Part 11 – PDF/XLSX exports must embed a SHA-256 audit hash for integrity verification | `src/app/domain/randomization-engine/core/crypto-hash-parity.spec.ts` | 27 | should generate the exact same SHA-256 hash as the Python verification utility for the reference mock payload |  | ⬜ UNKNOWN |
| `REQ-21CFR11-005` | `Reproducibility` | 21 CFR Part 11 – PDF/XLSX exports must embed a SHA-256 audit hash for integrity verification | `src/app/domain/randomization-engine/core/crypto-hash-parity.spec.ts` | 66 | should successfully verify the audit hash for  |  | ⬜ UNKNOWN |
| `REQ-21CFR11-006` | `Reproducibility` | 21 CFR Part 11 – PDF audit artifact must embed version, timestamp, protocol ID and PRNG seed | `tests_e2e/audit-trail.spec.ts` | 409 | PDF export contains the application semantic version | 21 CFR Part 11 – Audit Trail: PDF export provenance | ⬜ UNKNOWN |
| `REQ-21CFR11-006` | `Reproducibility` | 21 CFR Part 11 – PDF audit artifact must embed version, timestamp, protocol ID and PRNG seed | `tests_e2e/audit-trail.spec.ts` | 415 | PDF export contains a valid ISO 8601 generated-at timestamp |  | ⬜ UNKNOWN |
| `REQ-21CFR11-006` | `Reproducibility` | 21 CFR Part 11 – PDF audit artifact must embed version, timestamp, protocol ID and PRNG seed | `tests_e2e/audit-trail.spec.ts` | 421 | PDF export contains the trial protocol identifier |  | ⬜ UNKNOWN |
| `REQ-21CFR11-006` | `Reproducibility` | 21 CFR Part 11 – PDF audit artifact must embed version, timestamp, protocol ID and PRNG seed | `tests_e2e/audit-trail.spec.ts` | 427 | PDF export contains the PRNG seed value |  | ⬜ UNKNOWN |
| `REQ-EXPORT-001` | `Reproducibility` | CSV/XLSX export filename must contain an 8-digit date component for per-generation traceability | `tests_e2e/audit-trail.spec.ts` | 460 | CSV download filename contains a date component for traceability |  | ⬜ UNKNOWN |
| `REQ-EXPORT-002` | `Reproducibility` | PDF export must trigger a file download containing a properly named randomization artifact | `tests_e2e/audit-trail.spec.ts` | 436 | PDF export filename matches the expected pattern |  | ⬜ UNKNOWN |
| `REQ-EXPORT-002` | `Reproducibility` | PDF export must trigger a file download containing a properly named randomization artifact | `tests_e2e/results-operations.spec.ts` | 126 | should trigger a PDF download when the PDF button is clicked |  | ⬜ UNKNOWN |
| `REQ-EXPORT-003` | `Reproducibility` | Excel export must produce a two-sheet workbook (Schema + Audit & Configuration) | — | — | *(no tests tagged)* | — | ⚠️ NO COVERAGE |
| `REQ-ICH-E6-001` | `Scientific Validity` | GCP – Subject IDs must be unique and fully traceable to site and block (ICH E6 §4.9) | `src/app/domain/randomization-engine/core/randomization-algorithm.spec.ts` | 657 | {RND:n} produces no duplicate subject IDs across the schema |  | ⬜ UNKNOWN |
| `REQ-ICH-E6-002` | `Scientific Validity` | Site information must be captured and present in all exported records (ICH E6 §4.1) | — | — | *(no tests tagged)* | — | ⚠️ NO COVERAGE |
| `REQ-ICH-E9-001` | `Scientific Validity` | Randomization algorithm must be deterministic and reproducible from a fixed PRNG seed (ICH E9 §2.3) | `scripts/cross-env/verify_python_schema.py` | 2 | Execute scripts/cross-env/verify_python_schema.py | Standalone Script | ⬜ UNKNOWN |
| `REQ-ICH-E9-001` | `Scientific Validity` | Randomization algorithm must be deterministic and reproducible from a fixed PRNG seed (ICH E9 §2.3) | `src/app/domain/randomization-engine/core/statistical-validation.spec.ts` | 145 | 1:1 ratio converges to 50 % per arm across 200 Monte Carlo trials | ICH E9 – Law of Large Numbers: allocation ratio convergence | ⬜ UNKNOWN |
| `REQ-ICH-E9-001` | `Scientific Validity` | Randomization algorithm must be deterministic and reproducible from a fixed PRNG seed (ICH E9 §2.3) | `tests_e2e/schema-generation.spec.ts` | 11 | should generate a schema and display results grid |  | ⬜ UNKNOWN |
| `REQ-ICH-E9-002` | `Scientific Validity` | Stratification factors must be applied correctly to the randomization schedule (ICH E9 §2.3.3) | `src/app/domain/randomization-engine/core/statistical-validation.spec.ts` | 278 | per-stratum caps are never exceeded across 100 random seeds | ICH E9 – Stratum Cap Enforcement: dynamic caps are never exceeded | ⬜ UNKNOWN |
| `REQ-ICH-E9-003` | `Scientific Validity` | Block randomization must respect declared block sizes and produce balanced allocations (ICH E9 §2.3.4) | `scripts/cross-env/verify_python_schema.py` | 3 | Execute scripts/cross-env/verify_python_schema.py | Standalone Script | ⬜ UNKNOWN |
| `REQ-ICH-E9-003` | `Scientific Validity` | Block randomization must respect declared block sizes and produce balanced allocations (ICH E9 §2.3.4) | `src/app/domain/randomization-engine/core/statistical-validation.spec.ts` | 185 | every block has exactly the correct count of each arm for a 1:1 ratio with block size 4 | ICH E9 – Block Balance: strict intra-block arm balance | ⬜ UNKNOWN |
| `REQ-SBOM-001` | `Reproducibility` | A Software Bill of Materials (SBOM) must be generated for every production build | `.github/workflows/ci.yml` | 782 | Job: sbom | CI Workflow | ⬜ UNKNOWN |
| `REQ-ZERO-TRUST-001` | `Zero-Trust` | No subject or schema data may be transmitted to external servers (zero-trust architecture) | `tests_e2e/zero-trust.spec.ts` | 53 | schema generation produces zero outbound XHR/Fetch requests to external servers | Zero-Trust Architecture: no outbound network requests | ⬜ UNKNOWN |
| `REQ-ZERO-TRUST-001` | `Zero-Trust` | No subject or schema data may be transmitted to external servers (zero-trust architecture) | `tests_e2e/zero-trust.spec.ts` | 71 | CSV export produces zero outbound requests to external servers |  | ⬜ UNKNOWN |
| `REQ-ZERO-TRUST-001` | `Zero-Trust` | No subject or schema data may be transmitted to external servers (zero-trust architecture) | `tests_e2e/zero-trust.spec.ts` | 92 | PDF export produces zero outbound requests to external servers |  | ⬜ UNKNOWN |

---

## Persona Requirements Traceability Matrix

| Persona | Guideline / Role | Test File | Line | Verified Test / Action | Suite |
|---|---|---|---|---|---|
| `@persona:Biostatistician` | Requires access to full unblinded allocations for verification & reporting | `src/app/domain/core/validation/persona-validator.service.spec.ts` | 16 | should allow Biostatistician to bypass blinding and view full treatment allocations | PersonaValidationService |
| `@persona:Biostatistician` | Requires access to full unblinded allocations for verification & reporting | `src/app/domain/schema-management/components/results-grid.component.spec.ts` | 681 | should retrieve blinding configurations for Biostatistician and allow full view | Standardized Persona Validation Framework Integration |
| `@persona:Biostatistician` | Requires access to full unblinded allocations for verification & reporting | `src/app/domain/schema-management/services/export.service.spec.ts` | 161 | should allow Biostatistician to export unblinded allocations | Standardized Persona Validation Integration |
| `@persona:TrialManager` | Requires secure blinded baseline & disables exports in Draft/Simulation mode | `src/app/domain/core/validation/persona-validator.service.spec.ts` | 24 | should restrict Trial Manager treatment visibility based on unblinded state and segment | PersonaValidationService |
| `@persona:TrialManager` | Requires secure blinded baseline & disables exports in Draft/Simulation mode | `src/app/domain/core/validation/persona-validator.service.spec.ts` | 40 | should disable structural schema exports when in draft simulation mode | PersonaValidationService |
| `@persona:TrialManager` | Requires secure blinded baseline & disables exports in Draft/Simulation mode | `src/app/domain/schema-management/components/results-grid.component.spec.ts` | 688 | should enforce blinding configurations for Trial Manager and mask treatment arms unless toggled under Academic segment | Standardized Persona Validation Framework Integration |
| `@persona:TrialManager` | Requires secure blinded baseline & disables exports in Draft/Simulation mode | `src/app/domain/schema-management/services/export.service.spec.ts` | 169 | should enforce Trial Manager blinded rules and verify simulation export configuration states | Standardized Persona Validation Integration |
| `@persona:ComplianceOfficer` | Requires automated RTM scans & verified persona logic during builds | `src/app/domain/core/validation/persona-validator.service.spec.ts` | 48 | should support Compliance Officer persona and secure baseline behaviors based on segment | PersonaValidationService |
| `@persona:ComplianceOfficer` | Requires automated RTM scans & verified persona logic during builds | `src/app/domain/schema-management/components/results-grid.component.spec.ts` | 698 | should allow Compliance Officer auditing of secure centralized authority behaviors | Standardized Persona Validation Framework Integration |

---

## Strategic Pillar Traceability Matrix

| Strategic Pillar | Test File | Line | Verified Test | Suite | Status |
|---|---|---|---|---|---|
| `Zero-Trust` | `tests_e2e/zero-trust.spec.ts` | 52 | schema generation produces zero outbound XHR/Fetch requests to external servers | Zero-Trust Architecture: no outbound network requests | ⬜ UNKNOWN |
| `Zero-Trust` | `tests_e2e/zero-trust.spec.ts` | 70 | CSV export produces zero outbound requests to external servers | Zero-Trust Architecture: no outbound network requests | ⬜ UNKNOWN |
| `Reproducibility` | `tests_e2e/determinism.spec.ts` | 5 | generates identical Audit Hash for the same seed across Chromium, WebKit, and Firefox | Determinism Test Suite | ⬜ UNKNOWN |
| `Scientific Validity` | `src/app/domain/randomization-engine/core/statistical-validation.spec.ts` | 144 | 1:1 ratio converges to 50 % per arm across 200 Monte Carlo trials | ICH E9 – Law of Large Numbers: allocation ratio convergence | ⬜ UNKNOWN |

---

## Regulatory References

| Tag Prefix | Regulatory Source |
|---|---|
| `REQ-ICH-E9` | ICH E9 – Statistical Principles for Clinical Trials |
| `REQ-ICH-E6` | ICH E6(R2) – Good Clinical Practice (GCP) |
| `REQ-21CFR11` | 21 CFR Part 11 – Electronic Records; Electronic Signatures |
| `REQ-ZERO-TRUST` | Equipose Zero-Trust Architecture Requirement |
| `REQ-SBOM` | Supply-Chain Security – Software Bill of Materials |
| `REQ-EXPORT` | Export Artifact Provenance Requirements |

---

## SAS & Stata Cross-Environment Note

Mathematical result validation for SAS and Stata is deferred to the end-user
environment per the formal Exception Report. See `docs/explanation/SAS_Stata_Exception_Report.md`.

Static syntax validation of generated SAS scripts is automated in CI via the
`sas_static_validation` job (`scripts/validate-sas-syntax.mjs`).
See `docs/explanation/adr/0001-sas-static-validation-strategy.md` for the validation strategy ADR.

