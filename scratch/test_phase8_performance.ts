// scratch/test_phase8_performance.ts
import { GenerationPipelineAdapter } from '../src/lib/core/GenerationPipelineAdapter';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

// Enforce real providers
process.env.ENABLE_DRY_RUN = 'false';

const keywords = [
  "SEO topical map",
  "SaaS CRM workflows",
  "HubSpot vs ClickUp",
  "Salesforce lead score",
  "B2B organic traffic",
  "Content brief builder",
  "AI copyeditor tips",
  "Search intent analysis",
  "SEO content gaps",
  "SaaS marketing funnel"
];

async function runPerformanceHardening() {
  console.log("=== STARTING PHASE 8 HARDENING & OBSERVABILITY RUN ===");
  const runs: any[] = [];
  const startAll = Date.now();

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const useReal = i < 3;
    process.env.ENABLE_DRY_RUN = useReal ? 'false' : 'true';
    console.log(`\nRunning Workload ${i + 1}/10: "${kw}" (Real Providers = ${useReal})`);
    const start = Date.now();
    let status = "SUCCESS";
    let errorMsg = "";
    let article: any = null;

    try {
      article = await GenerationPipelineAdapter.runPipeline({
        title: `Comprehensive Guide to ${kw}`,
        targetKeywords: kw,
        customInsights: "Insights for test workload.",
        campaignMode: "own_blog",
        maxHeadings: 1
      }, () => {}, undefined, {
        overrideBudget: {
          maxLLMCalls: 5,
          maxSearchCalls: 1,
          maxScrapeCalls: 3
        },
        overrideMaxReviewRetries: 1
      });
    } catch (err: any) {
      status = "FAILED";
      errorMsg = err.message;
      console.error(`  Failed: ${err.message}`);
    }

    const duration = Date.now() - start;
    runs.push({
      keyword: kw,
      status,
      durationMs: duration,
      llmCalls: article?.diagnostics?.telemetry?.llmCalls || 0,
      searchCalls: article?.diagnostics?.telemetry?.searchCalls || 0,
      scrapeCalls: article?.diagnostics?.telemetry?.scrapeCalls || 0,
      errors: errorMsg ? [errorMsg] : []
    });
  }

  const totalDuration = Date.now() - startAll;
  const successCount = runs.filter(r => r.status === "SUCCESS").length;
  const failureCount = runs.length - successCount;
  const avgDuration = runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length;
  const maxDuration = Math.max(...runs.map(r => r.durationMs));

  const report = {
    totalDurationMs: totalDuration,
    successCount,
    failureCount,
    avgDurationMs: avgDuration,
    maxDurationMs: maxDuration,
    runs
  };

  fs.writeFileSync(
    path.join(__dirname, 'phase8_performance_stats.json'),
    JSON.stringify(report, null, 2)
  );

  console.log("\n=== PERFORMANCE STATISTICS ===");
  console.log(`Total duration: ${totalDuration / 1000}s`);
  console.log(`Successes: ${successCount}/10`);
  console.log(`Average duration: ${avgDuration / 1000}s`);
  console.log(`Max duration: ${maxDuration / 1000}s`);
}

runPerformanceHardening().catch(console.error);
