import { LinkQualityEngine, FilteredLinkOutput } from '../src/lib/seo-intelligence/link_quality_engine';

console.log("=== LQE VALIDATION UNIT TESTS ===");

// Helper to run validate and expect error
function expectValidationError(links: FilteredLinkOutput[], expectedKeyword: string) {
  try {
    // Access private static validate using any cast
    (LinkQualityEngine as any).validate(links);
    console.log(`FAIL: Expected validation error containing "${expectedKeyword}", but it passed!`);
  } catch (err: any) {
    if (err.message.toLowerCase().includes(expectedKeyword.toLowerCase())) {
      console.log(`SUCCESS: Correctly failed with: "${err.message}"`);
    } else {
      console.log(`FAIL: Failed, but error message "${err.message}" did not contain "${expectedKeyword}"`);
    }
  }
}

// Case 1: Duplicate canonical URLs
console.log("\n1. Testing duplicate canonical URLs...");
const dupUrls: FilteredLinkOutput[] = [
  { entity: "Link A", canonicalURL: "https://framer.com", category: "Official Website", authorityScore: 90, relevanceScore: 80, selectionReason: "" },
  { entity: "Link B", canonicalURL: "https://framer.com", category: "Official Website", authorityScore: 90, relevanceScore: 80, selectionReason: "" }
];
expectValidationError(dupUrls, "Duplicate canonical URLs");

// Case 2: Blacklisted domains remain
console.log("\n2. Testing blacklisted domains remaining...");
const blacklisted: FilteredLinkOutput[] = [
  { entity: "AppSumo", canonicalURL: "https://appsumo.com", category: "Official Website", authorityScore: 90, relevanceScore: 80, selectionReason: "" }
];
expectValidationError(blacklisted, "Blacklisted domain");

// Case 3: Tracking parameters remain
console.log("\n3. Testing tracking parameters remaining...");
const tracking: FilteredLinkOutput[] = [
  { entity: "Framer", canonicalURL: "https://framer.com?utm_source=test", category: "Official Website", authorityScore: 90, relevanceScore: 80, selectionReason: "" }
];
expectValidationError(tracking, "Tracking parameter");

// Case 4: More than one URL exists for the same entity
console.log("\n4. Testing duplicate entity...");
const dupEntities: FilteredLinkOutput[] = [
  { entity: "Framer", canonicalURL: "https://framer.com", category: "Official Website", authorityScore: 90, relevanceScore: 80, selectionReason: "" },
  { entity: "Framer", canonicalURL: "https://framer.com/docs", category: "Official Documentation", authorityScore: 95, relevanceScore: 80, selectionReason: "" }
];
expectValidationError(dupEntities, "More than one URL exists for the same entity");

// Case 5: More than one Reddit URL exists
console.log("\n5. Testing duplicate Reddit...");
const dupReddit: FilteredLinkOutput[] = [
  { entity: "Reddit 1", canonicalURL: "https://reddit.com/r/1", category: "Community", authorityScore: 85, relevanceScore: 80, selectionReason: "" },
  { entity: "Reddit 2", canonicalURL: "https://reddit.com/r/2", category: "Community", authorityScore: 85, relevanceScore: 80, selectionReason: "" }
];
expectValidationError(dupReddit, "More than one Reddit URL detected");

// Case 6: Average authority score < 80
console.log("\n6. Testing average authority score < 80...");
const lowAuth: FilteredLinkOutput[] = [
  { entity: "Blog 1", canonicalURL: "https://blog1.com", category: "Vendor Blog", authorityScore: 75, relevanceScore: 80, selectionReason: "" },
  { entity: "Blog 2", canonicalURL: "https://blog2.com", category: "Vendor Blog", authorityScore: 75, relevanceScore: 80, selectionReason: "" }
];
expectValidationError(lowAuth, "below 80");
