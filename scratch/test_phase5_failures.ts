// scratch/test_phase5_failures.ts
import { GenerationPipelineAdapter, LegacyPayload } from '../src/lib/core/GenerationPipelineAdapter';
import { AgentOrchestrator, AgentStage } from '../src/core/orchestrator/AgentOrchestrator';
import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '../src/core/contracts/providers';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const mockPayload: LegacyPayload = {
  title: "Building SaaS Workflows with CRM Integration",
  targetKeywords: "crm workflows",
  customInsights: "Test details.",
  campaignMode: "own_blog",
  externalLinks: []
};

const saasProfile = {
  name: "SalesBoost",
  description: "Sales software.",
  targetAudience: "Sales directors",
  keyFeatures: [],
  primaryCompetitors: [],
  tone: "professional",
  customInsights: ""
};

async function runFailureTests() {
  console.log("=== STARTING PHASE 5 CONTROLLED FAILURE TESTS ===\n");

  // --- Test A: Search failure ---
  {
    console.log("Testing Test A: Search Provider failure...");
    const orchestrator = new AgentOrchestrator({
      llm: {} as any,
      search: {
        search: async () => { throw new Error("Google Serper Quota Exceeded"); }
      },
      scraper: { scrape: async () => [] }
    });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm",
      targetAudience: "Sales directors"
    });

    await assert(result.success === false, "Run should fail");
    await assert(result.errors.some(e => e.message.includes("Google Serper Quota Exceeded")), "Should track Serper error message");
    console.log("Test A: PASSED (Graceful fail, tracked error, no crash)\n");
  }

  // --- Test B: Scraping failure ---
  {
    console.log("Testing Test B: Scraping partial failure...");
    // Let's mock a scraper where one URL fails, and check that it records it but continues.
    const search: SearchProvider = {
      search: async () => [
        { title: "Page 1", link: "https://site1.com/page1", snippet: "" },
        { title: "Page 2", link: "https://site2.com/page2", snippet: "" }
      ]
    };
    const scraper: ScrapeProvider = {
      scrape: async (urls) => {
        return urls.map(url => {
          if (url.includes("site1")) {
            return { url, title: "", htmlContent: "", textContent: "", success: false };
          }
          return { url, title: "Site 2", htmlContent: "", textContent: "Scraped body", success: true };
        });
      }
    };

    const orchestrator = new AgentOrchestrator({
      llm: {
        generate: async () => "Draft text",
        structuredGenerate: async () => ({
          title: "Title",
          targetKeywords: ["crm"],
          outline: [{ heading: "H", level: "H2", assignedKeywords: [], assignedEntities: [] }],
          wordCountBudget: { min: 10, max: 100, target: 50 },
          intent: { primaryKeyword: "crm", intentType: "Informational", contentType: "Guide" }
        })
      } as any,
      search,
      scraper
    });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm",
      targetAudience: "Sales directors"
    });

    await assert(result.success === true, "Partial scrape failures should not fail the pipeline");
    await assert(!!result.research?.scrapeResults.some(r => r.url.includes("site1") && !r.success), "Failing page recorded");
    await assert(!!result.research?.scrapeResults.some(r => r.url.includes("site2") && r.success), "Succeeding page processed");
    console.log("Test B: PASSED (Partial scrape failure handled, research continues)\n");
  }

  // --- Test C: LLM failure ---
  {
    console.log("Testing Test C: LLM Provider failure...");
    const orchestrator = new AgentOrchestrator({
      llm: {
        generate: async () => { throw new Error("Gemini API connection timeout"); },
        structuredGenerate: async () => { throw new Error("Gemini API connection timeout"); }
      },
      search: { search: async () => [] },
      scraper: { scrape: async () => [] }
    });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm",
      targetAudience: "Sales directors"
    });

    await assert(result.success === false, "Run should fail on LLM crash");
    await assert(result.errors.some(e => e.message.includes("Gemini API connection timeout")), "Should track LLM error");
    console.log("Test C: PASSED (Graceful fail, LLM exception captured)\n");
  }

  // --- Test D: Budget exceeded ---
  {
    console.log("Testing Test D: Scraping budget limit exceeded...");
    const search: SearchProvider = {
      search: async () => [
        { title: "Page 1", link: "https://site1.com/page1", snippet: "" },
        { title: "Page 2", link: "https://site2.com/page2", snippet: "" },
        { title: "Page 3", link: "https://site3.com/page3", snippet: "" }
      ]
    };
    const scraper: ScrapeProvider = {
      scrape: async (urls) => urls.map(url => ({ url, title: "", htmlContent: "", textContent: "", success: true }))
    };

    const orchestrator = new AgentOrchestrator({
      llm: {} as any,
      search,
      scraper,
      budget: { maxScrapeCalls: 1 } // set budget lower than search results count
    });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm",
      targetAudience: "Sales directors"
    });

    await assert(result.success === false, "Run should fail because budget is exceeded");
    await assert(result.errors.some(e => e.message.includes("Scrape calls limit exceeded")), "Tracks budget limit message");
    console.log("Test D: PASSED (Orchestrator stops safely, returns budget error)\n");
  }

  // --- Test E: Abort ---
  {
    console.log("Testing Test E: Execution cancelled via AbortSignal...");
    const controller = new AbortController();
    const orchestrator = new AgentOrchestrator({
      llm: {} as any,
      search: {} as any,
      scraper: {} as any,
      signal: controller.signal
    });

    controller.abort();

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm",
      targetAudience: "Sales directors"
    });

    await assert(result.success === false, "Run should fail when aborted");
    await assert(result.errors.some(e => e.message.includes("aborted")), "Tracks abort status message");
    console.log("Test E: PASSED (Signal caught, execution halts immediately)\n");
  }

  console.log("🎉 ALL FAILURE TESTS PASSED SUCCESSFULLY!");
}

runFailureTests().catch(err => {
  console.error("Failure tests crashed:", err);
  process.exit(1);
});
