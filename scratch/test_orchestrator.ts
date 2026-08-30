// scratch/test_orchestrator.ts
import { 
  AgentOrchestrator, 
  AgentStage, 
  AgentOrchestratorOptions 
} from '../src/core/orchestrator/AgentOrchestrator';
import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '../src/core/contracts/providers';
import { SaaSProfile } from '../src/core/contracts/schemas';

// Passing text: high readability, low keyword density
const PASSING_TEXT = "This is a simple test. We write code now. We like clean code. A database has data. We send leads to sales. We build apps. We run fast tests. We love quality tools. We make content strategy easy. SaaS companies benefit from topical authority. We will build a helper tool. We write clean files. We develop code. We avoid errors. We use active voice. We like fast pipelines. The team works hard. We deploy every day. Testing is fun. Code reviews are helpful. We check for bugs.";

// Failing text: long sentence triggers average sentence length failure
const FAILING_TEXT = "This is a very long sentence that has no punctuation and keeps going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going.";

// Mocks configuration
class MockLLMProvider implements LLMProvider {
  public generateCount = 0;
  public generateBehavior: (prompt?: string, options?: any) => string = () => PASSING_TEXT;
  
  async generate(prompt: string, options?: any): Promise<string> {
    this.generateCount++;
    return this.generateBehavior(prompt, options);
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    this.generateCount++;
    if (options?.operation === 'SaaS Keyword Discovery') {
      return { suggestedKeywords: ["crm system", "crm alternatives"] } as unknown as T;
    }
    if (options?.operation === 'Keyword Opportunity Classification') {
      return {
        normalizedKeyword: "crm system",
        intent: "Informational",
        contentType: "Guide",
        serpTypes: [{ type: "Guide", count: 8 }],
        searchFeatures: [],
        competitors: ["competitor1.com"],
        businessRelevance: 90,
        competitorPresence: 70,
        estimatedDifficulty: 30,
        contentGap: "Competitor reviews lack detailed execution workflows.",
        recommendedAssetType: "Guide page",
        explanation: "Opportunity score is high.",
        reasoning: "Detailed reasoning",
        priority: "High"
      } as unknown as T;
    }
    // Returns a mock ContentBrief
    return {
      title: "How to Build a Custom CRM System",
      targetKeywords: ["crm system"],
      outline: [
        {
          heading: "What is a CRM?",
          level: "H2",
          assignedKeywords: ["crm"],
          assignedEntities: ["Database"],
          core_concept: "Definition of CRM"
        }
      ],
      wordCountBudget: { min: 100, max: 500, target: 300 },
      intent: {
        primaryKeyword: "crm system",
        intentType: "Informational",
        contentType: "Guide"
      },
      competitorInsights: []
    } as unknown as T;
  }
}

class MockSearchProvider implements SearchProvider {
  public searchCount = 0;
  async search(query: string, options?: any): Promise<SearchResult[]> {
    this.searchCount++;
    return [
      { title: "Competitor 1", link: "https://competitor1.com", snippet: "All about CRM systems" }
    ];
  }
}

class MockScrapeProvider implements ScrapeProvider {
  public scrapeCount = 0;
  async scrape(urls: string[], options?: any): Promise<ScrapeResult[]> {
    this.scrapeCount += urls.length;
    return urls.map(url => ({
      url,
      title: "Mock Title",
      htmlContent: "",
      textContent: "This is mock text contents for research analysis.",
      success: true
    }));
  }
}

// Global default test profile
const saasProfile: SaaSProfile = {
  name: "CRMify",
  description: "Lightweight CRM SaaS for small agencies.",
  targetAudience: "Agency owners",
  keyFeatures: ["Lead pipeline", "Contact management"],
  primaryCompetitors: ["HubSpot"],
  tone: "helpful",
  customInsights: ""
};

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("=== STARTING AGENT ORCHESTRATOR UNIT TESTS ===\n");

  // --- TEST 1: Full pipeline execution ---
  {
    console.log("--- Test 1: Full pipeline execution ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ llm, search, scraper });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === true, "Pipeline should succeed");
    await assert(result.status === "completed", "Status should be completed");
    await assert(result.stages.length >= 6, "Should run multiple stages");
    await assert(llm.generateCount > 0, "LLM generate should be called");
    console.log("Test 1: PASSED\n");
  }

  // --- TEST 2: REVIEW passes on first attempt ---
  {
    console.log("--- Test 2: REVIEW passes on first attempt ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ llm, search, scraper });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === true, "Review should pass on first attempt");
    // Ensure no retries/repairs were run
    const generateStages = result.stages.filter(s => s.stage === AgentStage.GENERATE);
    await assert(generateStages.length === 1, "Only one generate stage should run");
    console.log("Test 2: PASSED\n");
  }

  // --- TEST 3: REVIEW fails once and repair succeeds ---
  {
    console.log("--- Test 3: REVIEW fails once and repair succeeds ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ llm, search, scraper, maxReviewRetries: 2 });

    // First call generates bad text (long sentence > 30 words), second call (repair) generates passing text
    let calls = 0;
    llm.generateBehavior = (prompt, options) => {
      if (options?.operation === 'Section Generation' || options?.operation === 'Content Quality Repair') {
        calls++;
        if (calls === 1) {
          return FAILING_TEXT;
        }
        return PASSING_TEXT;
      }
      return PASSING_TEXT;
    };

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === true, "Pipeline should succeed after repair");
    const generateStages = result.stages.filter(s => s.stage === AgentStage.GENERATE);
    await assert(generateStages.length === 2, "Two generate/repair stages should have run");
    console.log("Test 3: PASSED\n");
  }

  // --- TEST 4: REVIEW fails until maximum retries are exhausted ---
  {
    console.log("--- Test 4: REVIEW fails until maximum retries are exhausted ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ llm, search, scraper, maxReviewRetries: 2 });

    // Always generate bad text
    llm.generateBehavior = (prompt, options) => {
      if (options?.operation === 'Section Generation' || options?.operation === 'Content Quality Repair') {
        return FAILING_TEXT;
      }
      return PASSING_TEXT;
    };

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === false, "Pipeline should fail because of review issues");
    await assert(result.status === "partial", "Status should be partial");
    const generateStages = result.stages.filter(s => s.stage === AgentStage.GENERATE);
    await assert(generateStages.length === 3, "Original generate + 2 repair attempts = 3 generate stages");
    console.log("Test 4: PASSED\n");
  }

  // --- TEST 5: Search budget exceeded ---
  {
    console.log("--- Test 5: Search budget exceeded ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ 
      llm, 
      search, 
      scraper,
      budget: { maxSearchCalls: 0 } // limit search to 0
    });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === false, "Should fail because budget is exceeded");
    await assert(result.status === "failed", "Status should be failed");
    await assert(result.errors.some(e => e.message.includes("Search calls limit exceeded")), "Error message must report search limit");
    console.log("Test 5: PASSED\n");
  }

  // --- TEST 6: LLM budget exceeded ---
  {
    console.log("--- Test 6: LLM budget exceeded ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ 
      llm, 
      search, 
      scraper,
      budget: { maxLLMCalls: 0 } // limit LLM to 0
    });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === false, "Should fail because LLM budget is exceeded");
    await assert(result.errors.some(e => e.message.includes("LLM calls limit exceeded")), "Error message must report LLM limit");
    console.log("Test 6: PASSED\n");
  }

  // --- TEST 7: Timeout/AbortSignal ---
  {
    console.log("--- Test 7: Timeout/AbortSignal ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    
    const controller = new AbortController();
    const orchestrator = new AgentOrchestrator({ 
      llm, 
      search, 
      scraper,
      signal: controller.signal
    });

    // Abort immediately
    controller.abort();

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === false, "Should fail because of abort signal");
    await assert(result.errors.some(e => e.message.includes("aborted")), "Error must mention abort");
    console.log("Test 7: PASSED\n");
  }

  // --- TEST 8: Provider failure ---
  {
    console.log("--- Test 8: Provider failure ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    
    // Search throws error
    search.search = async () => { throw new Error("Search network error"); };

    const orchestrator = new AgentOrchestrator({ llm, search, scraper });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.success === false, "Should fail due to search error");
    await assert(result.errors.some(e => e.message.includes("Search network error")), "Error must report search provider exception");
    console.log("Test 8: PASSED\n");
  }

  // --- TEST 9: Structured result contains stage telemetry ---
  {
    console.log("--- Test 9: Structured result contains stage telemetry ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ llm, search, scraper });

    const result = await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    await assert(result.telemetry.runId !== undefined, "Telemetry runId must exist");
    await assert(result.telemetry.llmCalls > 0, "Telemetry must record LLM calls");
    await assert(result.telemetry.searchCalls > 0, "Telemetry must record search calls");
    await assert(result.telemetry.scrapeCalls > 0, "Telemetry must record scrape calls");
    await assert(result.stages.every(s => s.startedAt && (s.status === "completed" || s.status === "failed")), "All executed stages must have status");
    console.log("Test 9: PASSED\n");
  }

  // --- TEST 10: No API secrets appear in logs ---
  {
    console.log("--- Test 10: No API secrets appear in logs ---");
    const llm = new MockLLMProvider();
    const search = new MockSearchProvider();
    const scraper = new MockScrapeProvider();
    const orchestrator = new AgentOrchestrator({ llm, search, scraper });

    // Set hypothetical secrets in env
    process.env.SERP_KEY = "SECRET_SERP_KEY_VAL_123";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "SECRET_GEMINI_KEY_VAL_456";

    // Intercept console.log and console.error
    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: any[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };
    console.error = (...args: any[]) => {
      logs.push(args.join(" "));
      originalError(...args);
    };

    await orchestrator.run({
      saasProfile,
      targetKeyword: "crm system",
      targetAudience: "agency owners"
    });

    console.log = originalLog;
    console.error = originalError;

    // Check logs for leaks
    for (const logLine of logs) {
      assert(!logLine.includes("SECRET_SERP_KEY_VAL_123"), "Secrets must not leak in logs!");
      assert(!logLine.includes("SECRET_GEMINI_KEY_VAL_456"), "Secrets must not leak in logs!");
    }
    console.log("Test 10: PASSED\n");
  }

  console.log("🎉 ALL 10 UNIT TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
