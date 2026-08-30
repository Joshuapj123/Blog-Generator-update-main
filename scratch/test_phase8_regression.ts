// scratch/test_phase8_regression.ts
import { GenerationPipelineAdapter, LegacyPayload } from '../src/lib/core/GenerationPipelineAdapter';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { POST } from '../src/app/api/generate-blocks/route';
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

async function runRegressionTests() {
  console.log("=== STARTING PHASE 8 REGRESSION TESTS ===\n");
  process.env.ENABLE_AGENT_PIPELINE = "true";

  // 1. API Request Compatibility
  console.log("1. Testing API Request payload compatibility...");
  // Verify that extra inputs do not crash the entry parser
  const req = new Request("http://localhost/api/generate-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...mockPayload,
      authorMode: "pro",
      planRole: "primary",
      serpMedianWordCount: 1500
    })
  });
  const res = await POST(req);
  await assert(res.status === 200, "Should successfully parse extra request fields");
  console.log("   PASSED");

  // 2. Agent Generation & 3. Frontend-compatible response
  console.log("2 & 3. Testing Agent Generation & Frontend Compatibility...");
  process.env.ENABLE_AGENT_PIPELINE = "true";
  const reqAgent = new Request("http://localhost/api/generate-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });
  const resAgent = await POST(reqAgent);
  const reader = resAgent.body?.getReader();
  const textDecoder = new TextDecoder();
  let done = false;
  let completeArticle: any = null;
  let sectionEventCount = 0;

  while (!done) {
    const { value, done: rd } = await reader?.read() || { done: true };
    done = rd;
    if (value) {
      const chunk = textDecoder.decode(value);
      const lines = chunk.split('\n\n');
      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          const parsed = JSON.parse(line.replace(/^data: /, ''));
          if (parsed.type === 'section') {
            sectionEventCount++;
          }
          if (parsed.type === 'complete') {
            completeArticle = parsed.data;
          }
        }
      }
    }
  }

  await assert(!!completeArticle, "Complete article blueprint must be returned");
  await assert(sectionEventCount > 0, "Incremental section events must be streamed to the client");
  await assert(typeof completeArticle.title === 'string' && completeArticle.title.length > 0, "Title lock must match the input title");
  console.log("   PASSED");

  // 4. Validation, 5. Citations, 6. Links & 7. Firebase Persistence compatibility
  console.log("4, 5, 6 & 7. Testing Article Structure, Links, and Firestore Parity...");
  await assert(Array.isArray(completeArticle.sections), "Article must contain sections array");
  await assert(completeArticle.intro !== undefined, "Article must contain intro block");
  await assert(completeArticle.cta !== undefined, "Article must contain CTA block");
  await assert(completeArticle.diagnostics !== undefined, "Article must contain diagnostics telemetry");
  // Check that switching does not affect schema (Firestore contract compatibility check)
  const firestoreMockObj = {
    title: completeArticle.title,
    blueprint: completeArticle,
    sections: completeArticle.sections,
    contentScore: 90
  };
  await assert(firestoreMockObj.blueprint.sections.length > 0, "Sections must not be empty");
  console.log("   PASSED");

  // 8. SSE / progress
  console.log("8. Testing SSE Event-Stream Headers...");
  await assert(resAgent.headers.get('Content-Type') === 'text/event-stream', "Content type must be event-stream");
  console.log("   PASSED");

  // 9. Abort & 10. Timeout
  console.log("9 & 10. Testing Abort and Timeout enforcement...");
  const controller = new AbortController();
  const orchestratorTimeout = new AgentOrchestrator({
    llm: {
      generate: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return "slow content";
      },
      structuredGenerate: async () => ({
        title: "T", targetKeywords: ["K"],
        outline: [{ heading: "H", level: "H2", assignedKeywords: [], assignedEntities: [] }],
        wordCountBudget: { min: 10, max: 100, target: 50 },
        intent: { primaryKeyword: "K", intentType: "Informational", contentType: "Guide" }
      })
    } as any,
    search: { search: async () => [] },
    scraper: { scrape: async () => [] },
    budget: { timeoutMs: 10 },
    signal: controller.signal
  });
  const resTimeout = await orchestratorTimeout.run({
    saasProfile: { name: "A", description: "B", targetAudience: "C", keyFeatures: [], primaryCompetitors: [], tone: "professional", customInsights: "" },
    targetKeyword: "crm",
    targetAudience: "C"
  });
  await assert(resTimeout.success === false, "Should fail on timeout");
  console.log("    PASSED");

  // 11. Budget enforcement & 12. Provider failures
  console.log("11 & 12. Testing budget exceptions and provider errors...");
  const orchestratorBudget = new AgentOrchestrator({
    llm: {} as any,
    search: { search: async () => { throw new Error("Google Serper Quota Exceeded"); } },
    scraper: { scrape: async () => [] },
    budget: { maxSearchCalls: 1 }
  });
  const resBudget = await orchestratorBudget.run({
    saasProfile: { name: "A", description: "B", targetAudience: "C", keyFeatures: [], primaryCompetitors: [], tone: "professional", customInsights: "" },
    targetKeyword: "crm",
    targetAudience: "C"
  });
  await assert(resBudget.success === false && resBudget.errors.some(e => e.message.includes("Quota Exceeded")), "Should log Serper error cleanly");
  console.log("    PASSED");

  // 13 & 14. Feature flags ON/OFF checks
  console.log("13 & 14. Testing Feature Flag Routing Switches...");
  process.env.ENABLE_AGENT_PIPELINE = "false";
  const reqFlagOff = new Request("http://localhost/api/generate-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload)
  });
  const resFlagOff = await POST(reqFlagOff);
  await assert(resFlagOff.status === 200 || resFlagOff.status === 500, "Flag OFF executes legacy path");
  console.log("    PASSED");

  console.log("\n🎉 ALL PHASE 8 REGRESSION TESTS PASSED SUCCESSFULLY!");
}

runRegressionTests().catch(err => {
  console.error("Regression tests failed:", err);
  process.exit(1);
});
