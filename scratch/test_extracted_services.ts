// scratch/test_extracted_services.ts
import { SearchService } from '../src/lib/research/SearchService';
import { ScrapingService } from '../src/lib/research/ScrapingService';
import { ResearchService } from '../src/lib/research/ResearchService';
import { ContentBriefBuilder } from '../src/lib/content/ContentBriefBuilder';
import { WritingService } from '../src/lib/content/WritingService';
import { ContentRepairService } from '../src/lib/content/ContentRepairService';
import { ContentService } from '../src/lib/content/ContentService';
import { QualityValidationService } from '../src/lib/intelligence/QualityValidationService';
import { SeoScoringService } from '../src/lib/intelligence/SeoScoringService';
import { GeoIntelligenceService } from '../src/lib/intelligence/GeoIntelligenceService';
import { ContentGenerationServiceFacade } from '../src/lib/core/ContentGenerationServiceFacade';

import { 
  LLMProvider, 
  SearchProvider, 
  ScrapeProvider, 
  SearchResult, 
  ScrapeResult 
} from '../src/core/contracts/providers';
import { SaaSProfile } from '../src/core/contracts/schemas';

// Mock values
const PASSING_TEXT = "This is a simple test. We write code now. We like clean code. A database has data. We send leads to sales. We build apps. We run fast tests. We love quality tools. We make content strategy easy. SaaS companies benefit from topical authority. We will build a helper tool. We write clean files. We develop code. We avoid errors. We use active voice. We like fast pipelines. The team works hard. We deploy every day. Testing is fun. Code reviews are helpful. We check for bugs.";
const FAILING_TEXT = "This is a very long sentence that has no punctuation and keeps going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going.";

class MockLLMProvider implements LLMProvider {
  public generateCount = 0;
  public generateBehavior: () => string = () => PASSING_TEXT;

  async generate(prompt: string, options?: any): Promise<string> {
    this.generateCount++;
    return this.generateBehavior();
  }

  async structuredGenerate<T>(prompt: string, schema: any, options?: any): Promise<T> {
    this.generateCount++;
    return {
      title: "CRM System Implementation Guide",
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
      { title: "CRM Competitor Page", link: "https://competitor.com/crm", snippet: "Guide to CRM software features" }
    ];
  }
}

class MockScrapeProvider implements ScrapeProvider {
  public scrapeCount = 0;
  async scrape(urls: string[], options?: any): Promise<ScrapeResult[]> {
    this.scrapeCount += urls.length;
    return urls.map(url => ({
      url,
      title: "Mock CRM Guide",
      htmlContent: "",
      textContent: "This is scraped context containing data and insights.",
      success: true
    }));
  }
}

const saasProfile: SaaSProfile = {
  name: "SalesBoost",
  description: "Sales workflows and pipeline management software.",
  targetAudience: "Sales directors",
  keyFeatures: ["Lead score", "Inbox sync"],
  primaryCompetitors: ["Salesforce"],
  tone: "professional",
  customInsights: ""
};

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("=== STARTING EXTRACTED SERVICES INTEGRATION TESTS ===\n");

  const llm = new MockLLMProvider();
  const search = new MockSearchProvider();
  const scraper = new MockScrapeProvider();

  // 1. Search service
  {
    console.log("Testing SearchService...");
    const searchService = new SearchService(search);
    const results = await searchService.executeSearch("crm software");
    await assert(results.length === 1, "Should return 1 result");
    await assert(results[0].title === "CRM Competitor Page", "Result title should match mock");
    await assert(search.searchCount === 1, "Provider should be invoked");
    console.log("SearchService: PASSED\n");
  }

  // 2. Scraping service
  {
    console.log("Testing ScrapingService...");
    const scrapingService = new ScrapingService(scraper);
    const results = await scrapingService.executeScraping(["https://competitor.com/crm"]);
    await assert(results.length === 1, "Should return 1 result");
    await assert(results[0].success === true, "Should succeed");
    await assert(scraper.scrapeCount === 1, "Provider should scrape URL");
    console.log("ScrapingService: PASSED\n");
  }

  // 3. Content planning
  {
    console.log("Testing ContentBriefBuilder...");
    const briefBuilder = new ContentBriefBuilder(llm);
    const brief = await briefBuilder.buildBrief("crm system", "sales teams", saasProfile, { medianWordCount: 1500 });
    await assert(brief.title === "CRM System Implementation Guide", "Title should match brief plan");
    await assert(brief.targetKeywords.includes("crm system"), "Keywords should be preserved");
    console.log("ContentBriefBuilder: PASSED\n");
  }

  // 4. Content generation
  {
    console.log("Testing WritingService...");
    const briefBuilder = new ContentBriefBuilder(llm);
    const writer = new WritingService(llm);
    const brief = await briefBuilder.buildBrief("crm system", "sales teams", saasProfile, { medianWordCount: 1500 });
    
    const asset = await writer.generateAsset(brief);
    await assert(asset.title === brief.title, "Asset title should match brief");
    await assert(asset.wordCount > 0, "Word count should be positive");
    console.log("WritingService: PASSED\n");
  }

  // 5. Quality validation
  {
    console.log("Testing QualityValidationService...");
    const validator = new QualityValidationService();
    
    // Passing case
    const passReport = validator.validate(PASSING_TEXT, ["crm system"], ["Database"]);
    await assert(passReport.valid === true, "Active voice text should pass");

    // Failing case
    const failReport = validator.validate(FAILING_TEXT, ["crm system"], ["Database"]);
    await assert(failReport.valid === false, "Long sentence text should fail");
    console.log("QualityValidationService: PASSED\n");
  }

  // 6. SEO scoring
  {
    console.log("Testing SeoScoringService...");
    const scorer = new SeoScoringService();
    
    const mockParams = {
      textContext: PASSING_TEXT,
      title: "CRM System Implementation Guide",
      headings: ["What is a CRM?"],
      liveTerms: [{ term: "crm", category: "basic" as const, importance: 5, currentCount: 1, overuseRisk: false }],
      entities: [{ entityName: "Database", competitorCoverage: 0.8, importanceScore: 80, entityType: "concept" }],
      topTermsForIntent: ["crm"],
      medianWordCount: 1500,
      medianTitleLength: 60,
      medianH2Count: 6
    };

    const scoreResult = scorer.calculateScore(mockParams as any);
    await assert(scoreResult.totalScore !== undefined, "Score result should compute totalScore");
    await assert(scoreResult.breakdown.S !== undefined, "Breakdown should include semantic score");
    console.log("SeoScoringService: PASSED\n");
  }

  // 7. Service facade (executePipeline)
  {
    console.log("Testing ContentGenerationServiceFacade...");
    const searchService = new SearchService(search);
    const scrapingService = new ScrapingService(scraper);
    const researchService = new ResearchService(searchService, scrapingService);
    const briefBuilder = new ContentBriefBuilder(llm);
    const writer = new WritingService(llm);
    const validator = new QualityValidationService();
    const repairer = new ContentRepairService(llm);
    
    const facade = new ContentGenerationServiceFacade(
      researchService,
      briefBuilder,
      writer,
      validator,
      repairer
    );

    // Test facade runs repair loop if review fails on first attempt
    let calls = 0;
    llm.generateBehavior = () => {
      calls++;
      if (calls <= 2) { // 1st generate, and 1st repair
        return FAILING_TEXT;
      }
      return PASSING_TEXT; // 2nd repair passes
    };

    const asset = await facade.executePipeline("crm system", "sales directors", saasProfile, {
      maxReviewRetries: 2
    });

    await assert(asset.title === "CRM System Implementation Guide", "Facade title matches brief");
    await assert(asset.seoScore === 90, "Asset should eventually pass validation and get high score");
    console.log("ContentGenerationServiceFacade: PASSED\n");
  }

  console.log("🎉 ALL EXTRACTED SERVICE INTEGRATION TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("Integration tests failed:", err);
  process.exit(1);
});
