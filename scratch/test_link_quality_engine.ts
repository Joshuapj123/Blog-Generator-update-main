import { LinkQualityEngine, RawLinkInput } from '../src/lib/seo-intelligence/link_quality_engine';

const testInputs: RawLinkInput[] = [
  // Stage 1 & 5: Ad / tracking and redirects
  { title: "Google Ad Link", url: "https://www.google.com/aclk?sa=L&ai=DChcSE...&adurl=https://framer.com/features" },
  { title: "Ad Link 2", url: "https://framer.com/features?utm_source=adwords&gclid=ads123" },
  // Stage 5: Entity Canonicalization / Ambiguous Entities
  { title: "CMS", url: "https://cms.gov" },
  { title: "CRM", url: "https://crm.org" },
  { title: "API", url: "https://api.org" },
  // Duplicate hompages and pages per domain
  { title: "Wix Homepage", url: "https://www.wix.com/" },
  { title: "Wix equivalent", url: "https://www.wix.com" },
  { title: "Wix Pricing", url: "https://wix.com/pricing/" },
  { title: "Wix Docs 1", url: "https://wix.com/docs" },
  { title: "Wix Docs 2", url: "https://wix.com/docs/api" },
  { title: "Wix Docs 3", url: "https://wix.com/docs/reference" }, // Exceeds docs limit
  // Reddit limit
  { title: "Reddit Discussion", url: "https://reddit.com/r/webdev/comments/1" },
  { title: "Reddit Discussion 2", url: "https://reddit.com/r/webdev/comments/2" }, // Exceeds reddit limit
  // Payment/Login Pages (Blacklisted)
  { title: "Squarespace Checkout", url: "https://squarespace.com/checkout" },
  { title: "Squarespace Login", url: "https://squarespace.com/login" },
  // Normal high-quality resources
  { title: "Framer Homepage", url: "https://framer.com" },
  { title: "Framer Docs", url: "https://framer.com/docs" },
  { title: "Squarespace Homepage", url: "https://squarespace.com" },
  { title: "Squarespace Docs", url: "https://squarespace.com/docs" }
];

console.log("=== RUNNING LINK QUALITY ENGINE UNIT TEST ===");

console.log("\n1. Test Processing & Filtering:");
const processed = LinkQualityEngine.process(
  testInputs,
  "Best AI Website Builders in 2026",
  "Wix, Framer, Squarespace, CMS, CRM, API"
);
console.log("Filtered URL Set size:", processed.length);
console.log(JSON.stringify(processed, null, 2));

console.log("\n2. Verification of Specific Rules:");
const urls = processed.map(p => p.canonicalURL);
console.log("Ad link Framer features included?", urls.includes("https://framer.com/features"));
console.log("Generic API / CMS / CRM links included?", urls.some(u => u.includes("cms.gov") || u.includes("api.org") || u.includes("crm.org")));
console.log("Duplicate Wix homepage included?", urls.filter(u => u === "https://wix.com").length);
console.log("Number of Wix docs pages (Max 2):", urls.filter(u => u.includes("wix.com/docs")).length);
console.log("Number of Reddit pages (Max 1):", urls.filter(u => u.includes("reddit.com")).length);
console.log("Squarespace login/checkout pages included?", urls.some(u => u.includes("login") || u.includes("checkout")));

// Test Validation Failure Cases
console.log("\n3. Testing LQE Validation Failures:");
try {
  // Pass a set of links with low authority score
  const lowAuthInputs = [
    { title: "Low Auth Blog 1", url: "https://randomblog123.com/blog/post1" },
    { title: "Low Auth Blog 2", url: "https://anotherrandomblog.com/post2" }
  ];
  LinkQualityEngine.process(lowAuthInputs, "AI Web Design", "random");
  console.log("FAIL: Low authority validation did not throw error!");
} catch (err: any) {
  console.log("SUCCESS: Correctly failed low authority validation with error:", err.message);
}
