# Phase 4 Integration Audit

## 1. Current Request Contract

The legacy `/api/generate-blocks` route parses the following JSON payload:

```typescript
interface LegacyRequestPayload {
  title: string;
  targetKeywords?: string;
  referenceData?: ExtractedDesign | null;
  authorMode?: string;
  selectedProfileId?: string | null;
  contentStructureMode?: 'inspire' | 'mirror';
  ctaIntent?: string;
  campaignMode?: string;
  guestPostBacklinkUrl?: string;
  guestPostTargetPublication?: string;
  internalLinks?: Array<{ title: string, keywords: string }>;
  externalLinks?: Array<{ title: string, url: string, folder?: string }>;
  customInsights?: string;
  serpTerms?: any[];
  serpMedianWordCount?: number;
  serpMedianTitleLength?: number;
  serpMedianH2Count?: number;
  serpEntities?: any[];
  planRole?: 'primary' | 'support' | null;
  keywordBank?: KeywordBank | null;
  detectedFormat?: "Listicle" | "How-To" | "Guide" | "Review" | "Comparison" | null;
  serpAnalysis?: any;
}
```

---

## 2. Current Response Contract

The route returns a `Response` with `Content-Type: text/event-stream`.
SSE chunks sent during execution are in the format `data: ${JSON.stringify(chunk)}\n\n`, where `chunk` is one of:

```typescript
type SSEChunk =
  | { type: 'status'; message: string; progress: number }
  | { type: 'outline'; data: any; progress: number }
  | { type: 'section'; index: number; data: any }
  | { type: 'pitch_email'; data: string }
  | { type: 'complete'; data: FinalArticle; progress: 100 }
  | { type: 'error'; message: string };
```

The `FinalArticle` schema in the `complete` event:
```typescript
interface FinalArticle {
  title: string;
  title_tag: string;
  slug: string;
  intent: any;
  schema_markup: any;
  open_graph_tags: any;
  intro: any;
  section_outlines: any[];
  sections: EnrichedSection[];
  cta: any;
  diagnostics: {
    repairAttemptsUsed: number;
    telemetry: any;
    structureAlignmentScore: number;
    entityPlacementCoverage: number;
    budgetUtilizationPercent: number;
    conceptRepetitionScore: number;
    compressionTriggered: boolean;
    compressionSavingsWords: number;
    modelUsed: string;
    generationSource: string;
    dryRunEnabled: boolean;
    apiProvider: string;
  };
}
```

---

## 3. New Orchestrator Contract

```typescript
interface OrchestrationInput {
  saasProfile: SaaSProfile;
  targetKeyword: string;
  targetAudience: string;
  targetCountry?: string;
  contentType?: string;
  competitorUrls?: string[];
  referenceUrls?: string[];
}
```

---

## 4. Mapping Between Old and New Contracts

*   **`title` / `targetKeyword`**: Map `targetKeywords` or the title keyword to `targetKeyword`.
*   **`saasProfile`**: Extract from `customInsights`, `campaignMode`, or fallback configuration.
*   **`competitorUrls` / `referenceUrls`**: Map from `referenceData` and organic search listings.

---

## 5. Missing Functionality to Bridge
*   **YouTube Media Fetching**: Needs to query search API and inject results into `rich_media_query`.
*   **Link Quality Engine (LQE)**: Must run pre-generation and post-generation checks.
*   **SSE Streaming**: The adapter must stream events back to the client matching the legacy SSE schema structure so the React hook parses them correctly.

---

## 6. Risk Points
*   **Timeout & Concurrency limits**: Standard serverless deployments cap execution at 5 minutes, but generation might exceed this. We must use AbortSignals and timeouts.
*   **API Spend**: Budget limits should be strictly enforced.

---

## 7. Recommended Integration Boundary

The adapter class `GenerationPipelineAdapter` will reside at `src/lib/core/GenerationPipelineAdapter.ts`. It will accept the legacy request payload, stream progress events via a callback, orchestrator run results, map the final `ContentAsset` to `FinalArticle`, and close the stream.
