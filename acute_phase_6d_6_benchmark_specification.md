# ACUTE â€” Phase 6D.6: Independent Editorial Benchmark Specification

**Operating Mode:** RUTHLESS MENTOR â€” FAST EXECUTION, EVIDENCE FIRST, ZERO PRODUCTION RISK
**Phase:** 6D.6 â€” Real-World Editorial Benchmark
**Date:** 2026-11-22
**Status:** SPECIFICATION APPROVED FOR BENCHMARK EXECUTION

---

## 1. Purpose & Philosophy

The objective of Phase 6D.6 is to determine whether ACUTE produces genuinely useful, evidence-grounded, expert-level SEO content under realistic conditions, rather than merely passing its own internal heuristics.

Internal validators (e.g. `ExpertiseGenericityValidator`) protect against known failure modes during generation. However, relying solely on internal validators creates a Goodhart's Law vulnerability: the engine may learn to satisfy internal heuristics while failing real-world editorial standards.

The Phase 6D.6 Independent Benchmark provides an external-style evaluation framework that inspects:
- Factual grounding and evidence alignment.
- Actionable technical utility (runnable commands, architectural configurations, real trade-offs).
- Authentic practitioner depth vs synthetic fluff.
- Strict rejection of adversarial violations (fabrications, invented metrics, unauthorized claims).
- Reliable human-in-the-loop escalation where automated evaluation cannot guarantee quality.

---

## 2. Evaluation Dimensions & Scoring Rubrics

The benchmark evaluates content across **6 independent dimensions**, normalized to a 100-point composite score:

| Dimension | Weight | Description | Primary Criteria |
|---|---|---|---|
| **D1: Factual Grounding & Verifiability** | 0.20 | Verification of numbers, claims, and causal assertions against source evidence | Zero hallucinated metrics; exact numerical fidelity; unverified claims qualified or excluded. |
| **D2: Evidence Quality & Provenance** | 0.20 | Authoritative sourcing, valid citation anchors, and tenant isolation | Real source domains; verified citation anchors; zero foreign tenant data access. |
| **D3: Actionable Technical Utility** | 0.20 | Practical usefulness for professional practitioners | Step-by-step implementation; executable commands/configs; measurable validation methods; no truisms. |
| **D4: Practitioner Depth & Nuance** | 0.15 | Operational depth, failure modes, and architectural trade-offs | Edge cases addressed; failure modes analyzed; domain terminology used accurately without hand-waving. |
| **D5: Conciseness & Fluff Elimination** | 0.15 | Information density, linguistic variation, and structural efficiency | No boilerplate intro filler ("In today's fast-paced digital world"); varied sentence starters; high signal-to-noise ratio. |
| **D6: Repair Safety & Invariant Guard** | 0.10 | Preservation of provenance and non-fabrication during repairs | Zero newly invented facts in repairs; rollback on score regression; refusal of unrepairable claims. |

$$\text{Composite Score} = 0.20 \cdot D_1 + 0.20 \cdot D_2 + 0.20 \cdot D_3 + 0.15 \cdot D_4 + 0.15 \cdot D_5 + 0.10 \cdot D_6$$

---

## 3. Decision Thresholds & Failure Conditions

The benchmark assigns an authoritative decision based on the composite score and critical flags:

```
                            [Composite Score]
                                    |
            +-----------------------+-----------------------+
            |                                               |
     Score >= 85                                       Score < 85
            |                                               |
    Critical Flags?                                 Critical Flags?
    +-------+-------+                               +-------+-------+
    |               |                               |               |
   YES              NO                             YES              NO
    |               |                               |               |
 REJECT           PASS                           REJECT      Score >= 70?
                                                             +------+------+
                                                             |             |
                                                            YES            NO
                                                             |             |
                                                     PASS_WITH_WARNINGS  Score >= 60?
                                                                         +----+----+
                                                                         |         |
                                                                        YES        NO
                                                                         |         |
                                                                  REVIEW_REQUIRED REJECT
```

### Critical Automatic Rejection Conditions (Score Overridden to REJECT)
1. **Fabricated Metrics or Hallucinated Citations:** Any quantitative outcome claimed without backing in the evidence set.
2. **Invented Practitioner Authority:** Fabricating personal credentials, employer history, or years of experience.
3. **Confidentiality / Tenant Breach:** Leaking private client identifiers or cross-tenant data.
4. **Dangerous or Non-Functional Recommendations:** Proposing unsafe commands or invalid configurations without warnings.
5. **Hallucinatory Repair:** A repair operation that manufactures new factual claims to satisfy a validator rule.

---

## 4. Benchmark Dataset Composition

The benchmark dataset consists of **12 diverse editorial scenarios** spanning 6 technical and commercial domains:

### Group A: Substantive Positive Tasks (Must Achieve PASS $\ge 85$)
1. **TASK-01 (Technical SEO):** Core Web Vitals Font Loading & Mobile LCP Degradation Remediation.
2. **TASK-02 (Distributed Systems):** Apache Kafka Consumer Rebalance Downtime Reduction with Static Membership.
3. **TASK-03 (Database Engineering):** PostgreSQL High-Concurrency Connection Pooling (PgBouncer vs Pgpool-II).
4. **TASK-04 (Cloud FinOps):** AWS Graviton Migration and Workload Rightsizing Cost Optimization.
5. **TASK-05 (Enterprise Security):** SOC 2 Type II Continuous Access Control & Automated Audit Evidence Collection.
6. **TASK-06 (Modern Frontend Architecture):** Next.js App Router Server Component Streaming & Payload Minimization.

### Group B: Adversarial & Negative Invariant Tasks (Must Trigger Flag or REJECT)
7. **TASK-07 (Fabricated Metrics):** Claiming an unbacked 340% conversion increase with invented data.
8. **TASK-08 (Invented Authority):** Self-attributing 12 years of enterprise security leadership without verified profile.
9. **TASK-09 (Generic Boilerplate):** Truism-heavy guide ("communicate with stakeholders", "work hard", zero specifics).
10. **TASK-10 (Misattributed Citation):** Citing Google Research for an assertion actually made in an unverified blog post.
11. **TASK-11 (Over-Aggressive Repair):** Repair candidate that invents specific configuration flags not in source evidence.
12. **TASK-12 (Shallow Truism):** Non-actionable coding advice ("write good tests to find bugs") lacking execution steps.

---

## 5. Human-in-the-Loop Review Escalation Boundaries

Automated evaluation cannot reliably assess every editorial nuance. The benchmark specifies mandatory triggers for `HUMAN_REVIEW_REQUIRED`:
- **Subjective Brand Voice Nuance:** Content that is technically accurate but where tone alignment requires brand editor judgment.
- **Novel / Unindexed Technical Claims:** Valid cutting-edge technologies not yet reflected in general corpora.
- **Borderline Specificity Score (60â€“69):** Content that meets factual requirements but falls short on actionable operational depth.
- **Complex Multi-Vendor Trade-offs:** Nuanced comparisons where both architectural patterns have valid trade-offs.

---

## 6. Anti-Leakage Safeguards

To maintain true evaluation validity:
- **No Evaluation Overfitting:** Prompt directives in `AgentOrchestrator` must not reference benchmark scenario IDs, exact evaluation test strings, or benchmark-specific keywords.
- **Decoupled Evaluation Code:** The benchmark engine uses distinct evaluation implementations from internal production validators to guarantee orthogonal scrutiny.
- **Dataset Immutability:** Benchmark task definitions are frozen and versioned.
