// scratch/test_geo_runtime_integration.ts
import { 
  AgentOrchestrator, 
  AgentStage, 
  OrchestrationResult
} from '../src/core/orchestrator/AgentOrchestrator';
import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '../src/core/contracts/providers';
import { SaaSProfile } from '../src/core/contracts/schemas';

const MOCK_ARTICLE_BODY = "This is a high quality article focusing on CRM systems. We integrate sales pipelines and databases to help small agency owners optimize conversion rates and track customer interactions. We use active voice to avoid passive meta announcements. Our dashboard connects leads and sales directly.";

class MockLLM implements LLMProvider {
  public callCount = 0;
  public failStructured = false;

  async generate(prompt: string, options?: any): Promise<string> {
    this.callCount++;
    if (options?.operation === 'GEO AI Answer Generation') {
      // Simulate Gemini visibility answer containing citations to competitor and brand
      return `For lightweight CRM systems, CRMify (https://crmify.com) is highly recommended. It competes directly with Salesforce (https://salesforce.com). Here is our analysis.`;
    }
    if (options?.operation === 'Content Quality Repair') {
      return MOCK_ARTICLE_BODY + " (Repaired issues)";
    }
    return MOCK_ARTICLE_BODY;
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    this.callCount++;
    if (this.failStructured) {
      throw new Error("Mock structured generate failure");
    }

    if (options?.operation === 'SaaS Keyword Discovery') {
      return { suggestedKeywords: ["crm software", "crmify alternatives"] } as unknown as T;
    }

    if (options?.operation === 'Keyword Opportunity Classification') {
      return {
        normalizedKeyword: "crm software",
        intent: "Comparison",
        contentType: "Comparison",
        serpTypes: [{ type: "Listicle", count: 7 }],
        searchFeatures: ["Featured Snippet"],
        competitors: ["salesforce.com", "hubspot.com"],
        businessRelevance: 95,
        competitorPresence: 80,
        estimatedDifficulty: 40,
        contentGap: "Competitor reviews lack pricing transparency.",
        recommendedAssetType: "Comparison page",
        explanation: "Opportunity score is high due to gap.",
        reasoning: "Detailed reasoning on search landscape",
        priority: "High"
      } as unknown as T;
    }

    // Default: ContentBrief
    return {
      title: "Best CRM Software for Agency Owners",
      targetKeywords: ["crm software"],
      outline: [
        {
          heading: "CRM Software Overview",
          level: "H2",
          assignedKeywords: ["crm"],
          assignedEntities: ["salesforce", "crmify"],
          core_concept: "Overview of modern platforms"
        }
      ],
      wordCountBudget: { min: 200, max: 800, target: 500 },
      intent: {
        primaryKeyword: "crm software",
        intentType: "Comparison",
        contentType: "Comparison"
      },
      competitorInsights: []
    } as unknown as T;
  }
}

class MockSearch implements SearchProvider {
  async search(query: string, options?: any): Promise<SearchResult[]> {
    return [
      { title: "Top 10 CRM Systems in 2026", link: "https://hubspot.com/crm", snippet: "Compare the best CRM tools." },
      { title: "Salesforce CRM Platform", link: "https://salesforce.com", snippet: "Manage customer relationships." }
    ];
  }
}

class MockScrape implements ScrapeProvider {
  async scrape(urls: string[], options?: any): Promise<ScrapeResult[]> {
    return urls.map(url => ({
      url,
      title: "Scraped Title",
      htmlContent: "",
      textContent: "This is scraped content for competitive analysis. We cover crm features.",
      success: true
    }));
  }
}

const saasProfile: SaaSProfile = {
  name: "CRMify",
  description: "Lightweight CRM SaaS for small agency owners.",
  website: "https://crmify.com",
  targetAudience: "Agency owners",
  keyFeatures: ["Lead pipeline", "Contact management"],
  primaryCompetitors: ["Salesforce"],
  tone: "helpful",
  customInsights: ""
};

async function runTests() {
  console.log("=== RUNTIME INTEGRATION TEST SUITE ===");

  const llm = new MockLLM();
  const search = new MockSearch();
  const scraper = new MockScrape();

  const orchestrator = new AgentOrchestrator({
    llm,
    search,
    scraper,
    maxReviewRetries: 1
  });

  console.log("\n1. Testing successful execution of connected GEO and Opportunity Stages...");
  const result: OrchestrationResult = await orchestrator.run({
    saasProfile,
    targetKeyword: "crm software",
    targetAudience: "Agency owners",
    competitorUrls: ["https://salesforce.com"]
  });

  // Verify stages execution
  const executedStages = result.stages.map(s => s.stage);
  console.log("Executed Stages:", executedStages);

  if (!executedStages.includes(AgentStage.SEARCH_OPPORTUNITY)) {
    throw new Error("❌ SEARCH_OPPORTUNITY stage did not execute");
  }
  if (!executedStages.includes(AgentStage.GEO_INTELLIGENCE)) {
    throw new Error("❌ GEO_INTELLIGENCE stage did not execute");
  }
  console.log("✅ SEARCH_OPPORTUNITY and GEO_INTELLIGENCE stages executed successfully.");

  // Verify new telemetry tracking via wrapped providers
  console.log("\n2. Verifying Telemetry counters...");
  console.log(`LLM Calls: ${result.telemetry.llmCalls}`);
  console.log(`Search Calls: ${result.telemetry.searchCalls}`);
  console.log(`Scrape Calls: ${result.telemetry.scrapeCalls}`);
  
  if (result.telemetry.llmCalls === 0 || result.telemetry.searchCalls === 0) {
    throw new Error("❌ Wrapped providers telemetry failed to count calls.");
  }
  console.log("✅ Telemetry wrapped counts validated.");

  // Verify data model fields on final ContentAsset
  console.log("\n3. Verifying ContentAsset fields...");
  const asset = result.content;
  if (!asset) {
    throw new Error("❌ Final ContentAsset is missing.");
  }

  console.log(`geoStatus: ${asset.geoStatus}`);
  console.log(`observedGeoScore: ${asset.observedGeoScore}`);
  console.log(`geoReadinessScore: ${asset.geoReadinessScore}`);
  console.log(`geoScore: ${asset.geoScore}`);
  console.log(`geoOpportunities count: ${asset.geoOpportunities?.length}`);
  console.log(`geoProviderResults count: ${asset.geoProviderResults?.length}`);

  if (asset.geoStatus !== 'available') {
    throw new Error(`❌ geoStatus expected 'available', got ${asset.geoStatus}`);
  }
  if (asset.observedGeoScore === undefined) {
    throw new Error("❌ observedGeoScore is undefined");
  }
  if (asset.geoReadinessScore === undefined) {
    throw new Error("❌ geoReadinessScore is undefined");
  }
  if (asset.geoScore === 90 && asset.observedGeoScore !== 90) {
    throw new Error("❌ geoScore is hardcoded to 90 as unconditional default.");
  }
  console.log("✅ ContentAsset GEO data model fields validated successfully.");

  // Verify provider failures do not fail generation completely
  console.log("\n4. Verifying provider failure safety...");
  const brokenLLM = new MockLLM();
  brokenLLM.generate = async (prompt: string, options?: any): Promise<string> => {
    if (options?.operation === 'GEO AI Answer Generation') {
      throw new Error("API Connection timeout");
    }
    return MOCK_ARTICLE_BODY;
  };

  const brokenOrchestrator = new AgentOrchestrator({
    llm: brokenLLM,
    search,
    scraper
  });

  const brokenResult = await brokenOrchestrator.run({
    saasProfile,
    targetKeyword: "crm software",
    targetAudience: "Agency owners"
  });

  const brokenAsset = brokenResult.content;
  if (!brokenAsset) {
    throw new Error("❌ Generation crashed completely due to GEO provider failure.");
  }

  console.log(`broken geoStatus: ${brokenAsset.geoStatus}`);
  console.log(`broken observedGeoScore: ${brokenAsset.observedGeoScore}`);
  console.log(`broken geoReadinessScore: ${brokenAsset.geoReadinessScore}`);
  console.log(`broken geoScore (fallback): ${brokenAsset.geoScore}`);

  if (brokenAsset.geoStatus !== 'provider_unavailable') {
    throw new Error(`❌ expected geoStatus to be 'provider_unavailable', got ${brokenAsset.geoStatus}`);
  }
  if (brokenAsset.observedGeoScore !== undefined) {
    throw new Error("❌ observedGeoScore should not be defined when provider is unavailable.");
  }
  if (brokenAsset.geoScore !== brokenAsset.geoReadinessScore) {
    throw new Error("❌ geoScore fallback should match geoReadinessScore.");
  }
  console.log("✅ Provider failure handled gracefully and fell back to readiness score.");

  // Verify budgets
  console.log("\n5. Verifying GEO budget enforcement...");
  const budgetOrchestrator = new AgentOrchestrator({
    llm,
    search,
    scraper,
    budget: { maxLLMCalls: 1 } // Out of budget immediately
  });

  const budgetResult = await budgetOrchestrator.run({
    saasProfile,
    targetKeyword: "crm software",
    targetAudience: "Agency owners"
  });

  if (budgetResult.success !== false) {
    throw new Error("❌ Budget check did not fail execution.");
  }
  const hasBudgetError = budgetResult.errors.some(e => e.message.includes("limit exceeded"));
  if (!hasBudgetError) {
    throw new Error(`❌ Expected budget error in result.errors, got: ${JSON.stringify(budgetResult.errors)}`);
  }
  console.log("✅ Budget limit correctly halted execution.");

  console.log("\n🎉 ALL RUNTIME INTEGRATION TESTS PASSED!");
}

runTests().catch(err => {
  console.error("❌ INTEGRATION TEST SUITE FAILED:", err);
  process.exit(1);
});
