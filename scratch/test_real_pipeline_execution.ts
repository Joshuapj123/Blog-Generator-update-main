// scratch/test_real_pipeline_execution.ts
import { GenerationPipelineAdapter } from '../src/lib/core/GenerationPipelineAdapter';
import dotenv from 'dotenv';
dotenv.config();

// Ensure dry run is false so it runs real providers
process.env.ENABLE_DRY_RUN = 'false';

async function runRealPipeline() {
  console.log("=== STARTING REAL AGENT PIPELINE RUN ===");
  const startTime = Date.now();
  const progressLogs: any[] = [];

  const payload = {
    title: "Why SaaS Startups Need Topical Authority",
    targetKeywords: "topical authority",
    customInsights: "Topical authority is established by writing comprehensive coverage of related semantic subtopics.",
    campaignMode: "own_blog",
    externalLinks: []
  };

  // Controlled budgets:
  const overrideBudget = {
    maxLLMCalls: 5,
    maxSearchCalls: 1,
    maxScrapeCalls: 3,
    timeoutMs: 180000 // 3 minutes
  };

  try {
    const finalArticle = await GenerationPipelineAdapter.runPipeline(
      payload,
      (progress) => {
        // Safe logging - never log credentials/keys
        console.log(`[Progress Update] ${JSON.stringify(progress)}`);
        progressLogs.push(progress);
      },
      undefined,
      {
        overrideBudget,
        overrideMaxReviewRetries: 1
      }
    );

    console.log("\n=== REAL PIPELINE COMPLETED SUCCESSFULLY ===");
    console.log(`Duration: ${(Date.now() - startTime) / 1000} seconds`);
    console.log("Generated Title:", finalArticle.title);
    console.log("Sections count:", finalArticle.sections.length);
    console.log("Intro hook:", finalArticle.intro.hook);
    console.log("Telemetry Stats:", JSON.stringify(finalArticle.diagnostics.telemetry, null, 2));
  } catch (err: any) {
    console.error("\nReal Pipeline execution failed with error:", err.message);
  }
}

runRealPipeline().catch(console.error);
