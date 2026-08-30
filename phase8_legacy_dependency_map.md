# Phase 8 Legacy Dependency Map

This map outlines the dependencies of symbols and functions currently contained inside the monolithic route configuration at [`route.ts`](file:///c:/Users/Joshua/Desktop/Blog-Generator-main/src/app/api/generate-blocks/route.ts).

---

## 1. Dependency Analysis Table

| Symbol Name | Declared In | Reference Context / Consumers | Classification |
| :--- | :--- | :--- | :--- |
| `LinkQualityEngine` | `src/lib/seo-intelligence/link_quality_engine.ts` | Used in both legacy route and `GenerationPipelineAdapter`. | **USED BY BOTH** |
| `validateArticleQuality` | `src/lib/seo-intelligence/quality_validator.ts` | Used in legacy route and `AgentOrchestrator` quality validators. | **USED BY BOTH** |
| `calculateSeoScore` | `src/lib/seo-intelligence/seo_scoring_engine.ts` | Used in legacy route, extracted SEO scoring service. | **USED BY BOTH** |
| `limitConcurrency` | `src/app/api/generate-blocks/route.ts` | Internal to legacy route. Used for concurrent section batches. | **USED BY LEGACY** |
| `validateSection` | `src/app/api/generate-blocks/route.ts` | Internal to legacy route. Performs inline validation check. | **USED BY LEGACY** |
| `cleanParagraph` | `src/app/api/generate-blocks/route.ts` | Internal helper used to sanitize output strings. | **USED BY LEGACY** |
| `getPromptKeywords` | `src/lib/keyword-bank.ts` | Used inside legacy route keywords bank calculations. | **USED BY LEGACY** |
| `AUTHOR_PROFILES` | `src/lib/author-profiles.ts` | Used inside legacy route to style tone profiles. | **USED BY LEGACY** |

---

## 2. Retention Guidelines
*   **Do NOT delete**: `LinkQualityEngine`, `validateArticleQuality`, and `calculateSeoScore` since they are core to the adapter and agent validation layers.
*   **Safe to delete**: Internal functions in `route.ts` (`limitConcurrency`, `validateSection`, `cleanParagraph`) once the legacy route POST execution path is completely removed in Phase 9.
