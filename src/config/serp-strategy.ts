export const SERP_CONFIG = {
  PREPOPULATED_KEYWORD_COUNT: 3,     // keywords shown as default chips
  MAX_KEYWORD_COUNT: 10,             // hard cap for combo box
  LSI_KEYWORD_TARGET: 15,            // how many LSI terms to extract
  LSI_MIN_THRESHOLD: 8,              // below this, trigger LLM enrichment
  FORMAT_CONFIDENCE_THRESHOLD: 0.6,  // below this, show manual format picker
  REFERENCE_DEFAULT_POSITION: 1,     // auto-select rank #1 as reference
  CONTENT_GAP_MIN: 1,                // minimum gaps to surface in outline prompt
} as const;
