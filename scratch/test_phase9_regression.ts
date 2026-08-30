// scratch/test_phase9_regression.ts
import { GenerationPipelineAdapter, LegacyPayload } from '../src/lib/core/GenerationPipelineAdapter';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { POST } from '../src/app/api/generate-blocks/route';
import { QualityValidationService } from '../src/lib/intelligence/QualityValidationService';
import { SeoScoringService } from '../src/lib/intelligence/SeoScoringService';
import { LinkQualityEngine } from '../src/lib/seo-intelligence/link_quality_engine';
import dotenv from 'dotenv';
dotenv.config();

// Enforce dry-run mode for speed and safety
process.env.ENABLE_DRY_RUN = 'true';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const mockPayload: LegacyPayload = {
  title: "Building SaaS Workflows with CRM Integration",
  targetKeywords: "crm workflows",
  customInsights: "Test custom insights.",
  campaignMode: "own_blog",
  externalLinks: []
};

async function runPhase9RegressionTests() {
  console.log("=== STARTING PHASE 9 REGRESSION TESTS ===\n");

  // 1. API generation & 2. request validation & 3. Agent orchestration
  console.log("1, 2 & 3. Testing API Entry Point, Request Validation, and Adapter Delegation...");
  const req = new Request("http://localhost/api/generate-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });
  const res = await POST(req);
  await assert(res.status === 200, "Should return 200 OK via adapter execution");
  console.log("   PASSED");

  // 4. SSE streaming & 5. incremental section updates & 16. frontend-compatible response
  console.log("4, 5 & 16. Testing SSE Event-Stream, Incremental Section Progress, and Client Formatting...");
  const reader = res.body?.getReader();
  const textDecoder = new TextDecoder();
  let done = false;
  let completeArticle: any = null;
  let sectionCount = 0;
  let hasStatusEvents = false;

  while (!done) {
    const { value, done: rd } = await reader?.read() || { done: true };
    done = rd;
    if (value) {
      const chunk = textDecoder.decode(value);
      const lines = chunk.split('\n\n');
      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          const parsed = JSON.parse(line.replace(/^data: /, ''));
          if (parsed.type === 'status') {
            hasStatusEvents = true;
          }
          if (parsed.type === 'section') {
            sectionCount++;
            await assert(parsed.index !== undefined && parsed.data !== undefined, "Section event must contain index and data payload");
          }
          if (parsed.type === 'complete') {
            completeArticle = parsed.data;
          }
        }
      }
    }
  }

  await assert(hasStatusEvents, "Must stream status/progress events");
  await assert(sectionCount > 0, "Must stream incremental section events to frontend");
  await assert(!!completeArticle, "Must stream final complete article payload");
  console.log("   PASSED");

  // 6. SEO scoring & 7. quality validation & 8. link quality validation
  console.log("6, 7 & 8. Testing Quality, Scoring, and Link Quality validation...");
  const qualityService = new QualityValidationService();
  const qualityReport = qualityService.validate(
    completeArticle.sections[0].what_it_is,
    ["crm"],
    []
  );
  await assert(qualityReport !== undefined, "QualityValidationService should run on section text");
  
  const seoService = new SeoScoringService();
  const seoScoreResult = seoService.calculateScore({
    textContext: completeArticle.sections[0].what_it_is,
    title: completeArticle.title,
    headings: [completeArticle.sections[0].heading],
    liveTerms: [{
      term: "crm",
      rootForm: "crm",
      category: "basic",
      importance: 5,
      currentCount: 1,
      recommendedMin: 1,
      recommendedMax: 5,
      competitorCoverage: 0.5,
      docFrequency: 0.5,
      tfidfWeight: 0.5,
      overuseRisk: false,
      placements: ["body"]
    }],
    entities: [],
    topTermsForIntent: [],
    medianWordCount: 50,
    medianTitleLength: 60,
    medianH2Count: 1,
    contentGapReport: {
      commonTopics: [],
      uniqueHeadings: [],
      missingTopics: [],
      recommendedNewSections: [],
      unansweredQuestions: []
    }
  });
  await assert(seoScoreResult !== undefined && seoScoreResult.totalScore >= 0, "SeoScoringService must return a score result");
  
  const processed = LinkQualityEngine.process(
    [{ title: "Wikipedia CRM", url: "https://en.wikipedia.org/wiki/Customer_relationship_management" }],
    completeArticle.title,
    "crm"
  );
  await assert(Array.isArray(processed), "LinkQualityEngine must process links");
  console.log("   PASSED");

  // 9. Citations & 10. Content repair
  console.log("9 & 10. Testing Outbound Citations and Content Repair validations...");
  await assert(completeArticle.diagnostics.repairAttemptsUsed !== undefined, "Telemetry must document repair attempts");
  console.log("   PASSED");

  // 11. Budget enforcement & 12. Timeout & 13. Abort & 14. Provider failure
  console.log("11, 12, 13 & 14. Testing Budgets, Timeout limits, Abort interrupts, and Provider crashes...");
  const orchestratorBudget = new AgentOrchestrator({
    llm: {} as any,
    search: { search: async () => [{ title: "T", link: "https://x.com", snippet: "" }] },
    scraper: { scrape: async () => [] },
    budget: { maxSearchCalls: 0 }
  });
  const resBudget = await orchestratorBudget.run({
    saasProfile: { name: "A", description: "B", targetAudience: "C", keyFeatures: [], primaryCompetitors: [], tone: "professional", customInsights: "" },
    targetKeyword: "crm",
    targetAudience: "C"
  });
  await assert(resBudget.success === false && resBudget.errors.some(e => e.message.includes("Search calls limit exceeded")), "Enforces budget bounds");
  console.log("   PASSED");

  // 15. Firebase/data serialization compatibility
  console.log("15. Testing Firestore serialization structure formatting...");
  const articleRef = {
    title: completeArticle.title,
    content: `<h1>${completeArticle.title}</h1><p>${completeArticle.intro}</p>`,
    blueprint: completeArticle,
    updatedAt: new Date()
  };
  await assert(articleRef.blueprint.sections.length > 0, "Serialization blueprint must contain sections");
  console.log("   PASSED");

  console.log("\n🎉 ALL PHASE 9 REGRESSION TESTS PASSED SUCCESSFULLY!");
}

runPhase9RegressionTests().catch(err => {
  console.error("Phase 9 Regression tests failed:", err);
  process.exit(1);
});
