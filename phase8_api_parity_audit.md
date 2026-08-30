# Phase 8 API Parity Audit

This document audits the API contract parity between the **Legacy Pipeline** (defined inline inside `route.ts`) and the new **Agent Pipeline** (orchestrated via `GenerationPipelineAdapter`).

---

## 1. Request Payload Mapping

| Request Key | Legacy Pipeline Behavior | Agent Pipeline Behavior | Classification |
| :--- | :--- | :--- | :--- |
| `title` | Required. Serves as fallback query keyword. | Required. Passed directly as fallback keyword. | **SAFE** |
| `targetKeywords` | Optional string. Splits by comma to get primary keyword. | Optional string. Splits by comma for primary keyword. | **SAFE** |
| `customInsights` | Injected into Gemini system prompts. | Normalized into the custom `SaaSProfile` description context. | **SAFE** |
| `campaignMode` | Used to alter publication target parameters. | Maps to target name in `SaaSProfile` ('guest_post' targets publication name). | **SAFE** |
| `guestPostTargetPublication` | Appended to inline prompts. | Maps to SaaSProfile name property if campaignMode is 'guest_post'. | **SAFE** |
| `externalLinks` | Validated and cleaned via LQE. | Processed by LinkQualityEngine inside Adapter before orchestrator run. | **SAFE** |
| `authorMode` | Selects prompt tone vectors. | Reserved for future persona extensions (uses `SaaSProfile.tone` default). | **INTENTIONAL DIFFERENCE** |
| `internalLinks` | Outbound anchor links injected post-gen. | Decoupled (Agent uses outbound link quality validators directly). | **SAFE** |
| `serpMedianWordCount` | Used to scale target section lengths. | Replaced by competitor medians analyzed during the `ANALYZE` stage. | **INTENTIONAL DIFFERENCE** |

---

## 2. Response & SSE Stream Structure
*   **Legacy Pipeline**: Emits `outline`, concurrent incremental `section` chunks, `complete`, and `error` events.
*   **Agent Pipeline**: Emits stage `status` updates, `outline`, concurrent incremental `section` chunks (forwarded via onStageUpdate index loops), and the final `complete` article structure.
*   **Parity Status**: **100% Compatible**. The hook `useGenerationPipeline.ts` parses the exact same event stream formats.

---

## 3. Article Output Blueprint Structure
Both pipelines return the exact same output Zod validation shapes on completion:
*   `title`: SEO Title String.
*   `intro`: Hook & Paragraph string.
*   `sections`: Array of sections containing `heading`, `what_it_is`, `why_it_works`, `rich_media_query`.
*   `cta`: CTA details.
*   `diagnostics`: Telemetry run details.
