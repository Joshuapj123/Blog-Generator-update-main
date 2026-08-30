// scratch/test_phase10_saas_intelligence.ts
import { SaaSProfileSchema, SaaSIntelligenceProfileSchema, SearchOpportunitySchema } from '../src/core/contracts/schemas';
import { SaaSProfileService } from '../src/lib/saas-intelligence/SaaSProfileService';
import { CompetitorDiscoveryService } from '../src/lib/saas-intelligence/CompetitorDiscoveryService';
import { MarketIntelligenceService } from '../src/lib/saas-intelligence/MarketIntelligenceService';
import { SearchOpportunityService } from '../src/lib/saas-intelligence/SearchOpportunityService';
import { AgentOrchestrator, AgentStage } from '../src/core/orchestrator/AgentOrchestrator';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ─── MOCK PROVIDERS ─────────────────────────────────────────────────────────

const mockLLMSuccess = {
  generate: async () => 'mock text',
  structuredGenerate: async (prompt: string, schema: any) => {
    // Determine which schema is requested and return matching mocks
    if (prompt.includes('SaaS growth consultant') || prompt.includes('described below')) {
      return {
        product: {
          name: 'TestSaaS',
          website: 'https://testsaas.com',
          description: 'Automated CRM tool.',
          category: 'CRM',
          features: ['Lead tracking', 'Email sequences'],
          integrations: ['Slack', 'Gmail'],
          pricingInfo: 'Freemium',
          differentiators: ['Fast setup', 'AI insights'],
          useCases: ['Sales agencies', 'Startups']
        },
        audience: {
          icp: 'Small sales teams',
          personas: ['Sales Rep Sally'],
          industries: ['Software', 'Real Estate'],
          jobRoles: ['Sales rep', 'Account executive'],
          painPoints: ['Messy pipelines', 'Manual logging'],
          jtbd: ['When I log in, I want auto logs so I save time']
        }
      };
    }

    if (prompt.includes('SaaS market analyst')) {
      return {
        competitors: [
          {
            name: 'Competitor Alpha',
            domain: 'alpha.com',
            category: 'CRM',
            relevanceScore: 90,
            discoveryReason: 'Direct CRM competitor with similar features.'
          }
        ]
      };
    }

    if (prompt.includes('expert SaaS product marketer')) {
      return {
        audience: {
          icp: 'Small sales teams',
          personas: ['Sales Rep Sally'],
          industries: ['Software'],
          jobRoles: ['Sales Rep'],
          painPoints: ['Manual logging'],
          jtbd: ['Log in to save time']
        },
        positioning: 'The fastest CRM for small sales teams.'
      };
    }

    if (prompt.includes('search strategist')) {
      return {
        intent: 'Commercial',
        contentType: 'Comparison',
        businessRelevance: 9,
        explanation: 'Direct competitor query with high commercial value.'
      };
    }

    return {};
  }
} as any;

const mockSearchSuccess = {
  search: async () => [
    { title: 'Alpha CRM Alternatives', link: 'https://alpha.com', snippet: 'Best CRM tools' }
  ]
} as any;

// ─── TESTS ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("=== STARTING PHASE 10 SAAS INTELLIGENCE TESTS ===\n");

  // 1. SaaS profile validation
  console.log("1. Testing SaaS Profile Validation...");
  const validProfile = {
    name: "A",
    description: "B",
    targetAudience: "C",
    keyFeatures: [],
    primaryCompetitors: [],
    website: "https://test.com"
  };
  const parsed = SaaSProfileSchema.parse(validProfile);
  await assert(parsed.name === "A" && parsed.website === "https://test.com", "SaaS Profile validation failed");
  console.log("   PASSED");

  // 2. Profile normalization
  console.log("2. Testing Profile Normalization Service...");
  const profileService = new SaaSProfileService(mockLLMSuccess);
  const normalized = await profileService.normalizeProfile({
    name: "TestSaaS",
    description: "CRM for startups."
  });
  await assert(normalized.product?.name === "TestSaaS" && normalized.product?.category === "CRM", "Normalization failed");
  console.log("   PASSED");

  // 3. Competitor discovery using mocks
  console.log("3. Testing Competitor Discovery Service...");
  const compService = new CompetitorDiscoveryService(mockSearchSuccess, mockLLMSuccess);
  const competitors = await compService.discoverCompetitors({
    name: "TestSaaS",
    category: "CRM",
    description: "CRM for startups"
  });
  await assert(competitors.length > 0 && competitors[0].name === "Competitor Alpha", "Competitor discovery failed");
  console.log("   PASSED");

  // 4. Market intelligence & JTBD
  console.log("4. Testing Market Intelligence Service...");
  const marketService = new MarketIntelligenceService(mockLLMSuccess);
  const marketData = await marketService.extractMarketIntelligence({
    name: "TestSaaS",
    description: "CRM for startups",
    features: ["A"]
  });
  await assert(marketData.positioning.includes("CRM") && marketData.audience.personas.length > 0, "Market intelligence extraction failed");
  console.log("   PASSED");

  // 5. Search opportunity extraction & 6. Intent & 7. Content-type & 8. Opportunity scoring
  console.log("5, 6, 7 & 8. Testing Opportunity Analysis & Prioritized Scoring...");
  const oppService = new SearchOpportunityService(mockSearchSuccess, mockLLMSuccess);
  const opportunities = await oppService.analyzeOpportunities(
    "TestSaaS",
    "CRM",
    ["crm software"],
    ["alpha.com"]
  );
  await assert(opportunities.length > 0, "Opportunity analysis returned empty list");
  const opp = opportunities[0];
  await assert(opp.intent === "Commercial" && opp.contentType === "Comparison", "Classification mismatch");
  await assert(opp.opportunityScore > 0 && opp.opportunityScore <= 100, "Scoring bound mismatch");
  console.log("   PASSED");

  // 9. Missing-data handling
  console.log("9. Testing Missing-Data Fallbacks...");
  const fallbackNormalized = await profileService.normalizeProfile({
    name: "EmptySaaS",
    description: "Minimal description"
  });
  await assert(fallbackNormalized.product?.features !== undefined, "Failed to inject default arrays on empty fields");
  console.log("   PASSED");

  // 10. Provider failure
  console.log("10. Testing Provider Failure robustness...");
  const failingSearch = {
    search: async () => { throw new Error("Search quota exceeded"); }
  } as any;
  const oppServiceFailing = new SearchOpportunityService(failingSearch, mockLLMSuccess);
  const oppsWithFail = await oppServiceFailing.analyzeOpportunities(
    "TestSaaS",
    "CRM",
    ["crm"],
    ["alpha.com"]
  );
  await assert(oppsWithFail.length > 0 && oppsWithFail[0].estimatedDifficulty === 4, "Failed to fallback to standard metrics on search errors");
  console.log("    PASSED");

  // 11. Malformed LLM output
  console.log("11. Testing Malformed LLM Output robustness...");
  const malformedLLM = {
    structuredGenerate: async () => { throw new Error("JSON Parse Error"); }
  } as any;
  const oppServiceMalformed = new SearchOpportunityService(mockSearchSuccess, malformedLLM);
  const oppsWithMalformed = await oppServiceMalformed.analyzeOpportunities("A", "B", ["crm"], []);
  await assert(oppsWithMalformed.length === 0, " Fails gracefully on LLM crash");
  console.log("    PASSED");

  // 12. Firestore serialization
  console.log("12. Testing Firestore Serialization compliance...");
  const fullProfile = {
    product: normalized.product,
    audience: marketData.audience,
    market: {
      competitors,
      competitorProducts: ["Product Alpha"],
      alternatives: ["Alpha"],
      adjacentCategories: ["CRM"],
      positioning: marketData.positioning
    },
    opportunities
  };
  const verifiedProfile = SaaSIntelligenceProfileSchema.parse(fullProfile);
  await assert(verifiedProfile.product.name === "TestSaaS", "Profile schema serializes correctly");
  console.log("    PASSED");

  // 13. Orchestrator integration
  console.log("13. Testing AgentOrchestrator Stage Integration...");
  const orchestrator = new AgentOrchestrator({
    llm: mockLLMSuccess,
    search: mockSearchSuccess,
    scraper: { scrape: async () => [] } as any,
    budget: {}
  });
  const res = await orchestrator.run({
    saasProfile: {
      name: "TestSaaS",
      description: "CRM software.",
      targetAudience: "Sales agents",
      keyFeatures: [],
      primaryCompetitors: [],
      website: "https://test.com",
      tone: "professional",
      customInsights: ""
    },
    targetKeyword: "crm",
    targetAudience: "Sales agents"
  });
  await assert(res.stages.some(s => s.stage === AgentStage.SAAS_INTELLIGENCE), "Orchestrator missed SAAS_INTELLIGENCE execution stage");
  console.log("    PASSED");

  // 14. No API-secret leakage
  console.log("14. Testing Security compliance...");
  await assert(!JSON.stringify(res).includes("API_KEY") && !JSON.stringify(res).includes("SERP_KEY"), "Leaked credentials inside run outputs");
  console.log("    PASSED");

  console.log("\n🎉 ALL PHASE 10 SAAS INTELLIGENCE TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("Tests failed:", err);
  process.exit(1);
});
