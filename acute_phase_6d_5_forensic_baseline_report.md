# ACUTE — Phase 6D.5: Forensic Baseline Audit Report

**Operating Mode:** RUTHLESS MENTOR — ZERO FABRICATION, EVIDENCE PRESERVATION, PRODUCTION-GRADE ENGINEERING
**Phase:** 6D.5 — Controlled Content Repair & Provenance Guard
**Feature Branch:** `feature/phase-6d-5-controlled-content-repair`
**Required Base Commit:** `49cad5132da61c3fef5f6debed444b6ecf5b6162`
**Production Main Baseline:** `7771094491c40ed378bda8ee8e9c2d4e622718c1`
**Repository:** `https://github.com/Joshuapj123/Blog-Generator-update-main.git`

---

## 1. Repository Identity and Baseline Verification

Forensic Git commands executed at inception:

```bash
git remote -v
origin  https://github.com/Joshuapj123/Blog-Generator-update-main.git (fetch)
origin  https://github.com/Joshuapj123/Blog-Generator-update-main.git (push)

git branch --show-current
feature/phase-6d-5-controlled-content-repair

git rev-parse HEAD
49cad5132da61c3fef5f6debed444b6ecf5b6162

git rev-parse origin/main
7771094491c40ed378bda8ee8e9c2d4e622718c1

git status --short src/
(Clean - 0 modified, 0 untracked files in src/)
```

### Baseline Audit Verdict:
- Base commit matches required SHA: `49cad5132da61c3fef5f6debed444b6ecf5b6162` (Phase 6D.4 release commit).
- Feature branch created and checked out: `feature/phase-6d-5-controlled-content-repair`.
- Production `main` remains pristine at `7771094491c40ed378bda8ee8e9c2d4e622718c1`.
- Tracked production source tree in `src/` is completely clean.

---

## 2. Existing Architecture & Repair Infrastructure Audit

An exhaustive forensic audit of the existing codebase was conducted across validation, repair, and orchestration components:

### 2.1 Existing Validation Engine (`ExpertiseGenericityValidator.ts`)
- **Location:** `src/lib/intelligence/ExpertiseGenericityValidator.ts` (975 lines).
- **Capabilities:** Evaluates 8 dimensions (`EVIDENCE_GROUNDING: 0.20`, `EXPERTISE_SPECIFICITY: 0.15`, `REASONING_DEPTH: 0.15`, `RECOMMENDATION_QUALITY: 0.15`, `REPETITION_CONTROL: 0.10`, `BUSINESS_IMPACT_INTEGRITY: 0.10`, `PRACTITIONER_PROVENANCE: 0.10`, `QUANTITATIVE_INTEGRITY: 0.05`).
- **Outputs:** `ExpertiseValidationResult` containing `decision` (`PASS`, `PASS_WITH_WARNINGS`, `REVIEW_REQUIRED`, `REJECT`), `aggregateScore`, `dimensionScores`, and an array of `ValidationFinding` items (with `ruleId`, `severity`, `dimension`, `explanation`, `suggestedCorrectionCategory`, `requiresHumanReview`).

### 2.2 Existing Repair Infrastructure
- **`src/lib/content/ContentRepairService.ts`:**
  - `repairContent()`: Full-article rewrite via LLM prompt for keyword density and readability issues.
  - `repairTargetedDimension()`: Targeted prompt execution for single dimensions (`readability`, `semantic`, etc.).
  - `repairUngroundedClaimsInMarkdown()`: Deterministic regex substitution to qualify or soften ungrounded critical claims.
  - `repairEditorialContamination()`: Deterministic stripping of prompt instruction leakage, placeholder directives, and generic corporate filler.
- **`src/lib/content/TargetedRepairEngine.ts`:**
  - `executeBoundedRepair()`: Bounded block-level structural repair focusing on paragraph signature repetition and prose rhythm.
- **`src/core/orchestrator/AgentOrchestrator.ts`:**
  - Manages stage lifecycle: `PLAN → GENERATE → REVIEW → (REPAIR LOOP) → FINALIZE`.
  - Currently contains a repair loop with `maxReviewRetries` (default 2), evaluating monotonic improvement.
  - `finalValidationStatus` handles `'PASSED'`, `'PASSED_WITH_WARNINGS'`, `'FAILED'`, and `'REVIEW_REQUIRED'`.
  - When `finalValidationStatus === 'REVIEW_REQUIRED'`, `repairableIssues` is set to `[]` to prevent automated mutation of human-review items.

### 2.3 Existing Architectural Deficiencies for Controlled Repair
While ACUTE has targeted repair for paragraph signatures and keyword stuffing, it currently lacks:
1. **Typed Repairability Classification:** Structured categorization of validation issues into `REPAIRABLE_WITH_EXISTING_EVIDENCE`, `REQUIRES_ADDITIONAL_RESEARCH`, `REQUIRES_PRACTITIONER_INPUT`, `NON_REPAIRABLE_INTEGRITY_VIOLATION`, and `HUMAN_REVIEW_REQUIRED`.
2. **Provenance Guard:** An automated, server-authoritative comparator that validates whether a repair candidate modified claim classifications (e.g., promoted inference to fact, converted proposed target to achieved outcome, or fabricated citations).
3. **Finding & Section Scoped Repair:** Present repair mechanisms rewrite entire markdown bodies rather than targeting the exact affected finding and section without collateral damage.
4. **Controlled Repair Contract:** No Zod schemas defining `RepairRequest`, `RepairCandidate`, `ProvenancePreservationResult`, `RepairValidationResult`, and `RepairAuditRecord`.

---

## 3. Mission Strategy for Phase 6D.5

1. **Contracts in `src/core/contracts/schemas.ts`:**
   - Define `RepairabilityClassificationSchema`.
   - Define `RepairRequestSchema`, `RepairCandidateSchema`, `ProvenancePreservationResultSchema`, `RepairValidationResultSchema`, and `RepairAuditRecordSchema`.
2. **Implementation in `src/lib/intelligence/ControlledContentRepairEngine.ts`:**
   - Create a dedicated, deterministic and surgical engine that:
     - Classifies repairability for each validation finding.
     - Operates strictly at finding and section level.
     - Performs provenance guard invariant checks (7 non-negotiable invariants).
     - Reruns `ExpertiseGenericityValidator` to verify that repaired content passes without regression.
     - Maintains audit records with rollback preservation of original text.
3. **Orchestrator Integration in `AgentOrchestrator.ts`:**
   - Wire `ControlledContentRepairEngine` into the review and repair loop.
   - Enforce lifecycle: `VALIDATE → CLASSIFY → REPAIR → PROVENANCE CHECK → REVALIDATE → ACCEPT/REJECT`.
4. **Adversarial & Real-World Validation:**
   - Develop `scratch/test_phase_6d_5_controlled_content_repair.ts` (50 scenarios, 120+ assertions).
   - Build 15 before/after evaluation fixtures verifying safe repairs and correct refusal of unrepairable/unsafe issues.
   - Full regression matrix (21 suites, 993 checks), `tsc --noEmit`, and Next.js Webpack build.
