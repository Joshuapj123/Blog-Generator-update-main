# Phase 9 Final Dependency Map

This map outlines the dependencies of all orchestration functions inside the legacy block generation route.

---

## 1. Dependency Graph

*   **`limitConcurrency`**: `USED BY LEGACY ONLY`. Obsolete. Safe to delete.
*   **`validateSection`**: `USED BY LEGACY ONLY`. Obsolete. Replaced by `QualityValidationService`. Safe to delete.
*   **`cleanParagraph`**: `USED BY LEGACY ONLY`. Obsolete. Replaced by the Markdown Parsers inside the adapter. Safe to delete.
*   **`LinkQualityEngine`**: `USED BY BOTH`. Preserved.
*   **`validateArticleQuality`**: `USED BY BOTH`. Preserved.
*   **`calculateSeoScore`**: `USED BY BOTH`. Preserved.
*   **`getPromptKeywords`**: `USED BY LEGACY ONLY`. Safe to delete.
*   **`AUTHOR_PROFILES`**: `USED BY LEGACY ONLY`. Safe to delete.
*   **`POST`**: The main route entry point. Re-routed to the `GenerationPipelineAdapter`.

---

## 2. Deletion Boundary Ranges
All legacy functions from line 30 to line 834, and line 930 to line 5420 of the original `src/app/api/generate-blocks/route.ts` file are candidates for deletion.
Only the HTTP Request parsing, routing adapter call, and standard Next.js Event-Stream response block will remain in `route.ts`.
