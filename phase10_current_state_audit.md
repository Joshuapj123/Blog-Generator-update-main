# Phase 10 Current State Audit

This document audits the existing schema and services related to SaaS profiles, strategy planning, and orchestrator integrations.

---

## 1. Existing Schemas & Structures

### SaaSProfile (`src/core/contracts/schemas.ts`)
```typescript
export const SaaSProfileSchema = z.object({
  name: z.string().min(1, 'SaaS Name is required'),
  description: z.string().min(1, 'SaaS Description is required'),
  targetAudience: z.string().min(1, 'Target Audience is required'),
  keyFeatures: z.array(z.string()).optional().default([]),
  primaryCompetitors: z.array(z.string()).optional().default([]),
  tone: z.string().optional().default('professional'),
  customInsights: z.string().optional().default(''),
});
```
*   **Gap**: Lacks structured fields for product details (website, pricing, integrations, use cases), audience segments (ICP, industries, pain points, JTBD), and market landscape details (competitor products, positioning).

### SearchIntent (`src/core/contracts/schemas.ts`)
```typescript
export const SearchIntentSchema = z.object({
  primaryKeyword: z.string().min(1, 'Primary keyword is required'),
  intentType: z.enum(['Informational', 'Transactional', 'Commercial', 'Navigational', 'Comparison']).default('Informational'),
  contentType: z.enum(['Listicle', 'How-To', 'Guide', 'Review', 'Comparison', 'Other']).default('Guide'),
  confidenceScore: z.number().min(0).max(100).optional(),
});
```
*   **Status**: Fully functional and used during orchestrator intent classification.

---

## 2. Existing Planning & Strategy Services
*   **`/api/generate-plan`**: Generates a Pillar-Cluster content brief recommendation. Extracts a single core keyword, fetches top Serper organic titles/questions, and queries Gemini to draft `recommendedPages`.
*   **No Competitor Discovery Service**: No automated service exists to query Google Search to identify competitor products or domains based on a SaaS product profile.
*   **No Opportunity Scoring Model**: Keyword recommendations inside the content planner do not have transparent scoring parameters (business value, competitiveness, opportunity score).

---

## 3. Orchestration Stages
*   Currently, the orchestrator stages are: `DISCOVER` -> `RESEARCH` -> `ANALYZE` -> `PLAN` -> `GENERATE` -> `REVIEW` -> `RETURN`.
*   **Gap**: There is no dedicated stage or telemetry parameter mapping for `SAAS_INTELLIGENCE`. We need to add `SAAS_INTELLIGENCE` as an optional stage.
