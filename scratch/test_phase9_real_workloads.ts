// scratch/test_phase9_real_workloads.ts
import { GenerationPipelineAdapter } from '../src/lib/core/GenerationPipelineAdapter';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

// Ensure real providers are used
process.env.ENABLE_DRY_RUN = 'false';

const workloads = [
  {
    title: "How to Build Topical Authority in SEO",
    targetKeywords: "topical authority SEO",
    customInsights: "Explain how keyword clusters build topical authority.",
    maxHeadings: 1
  },
  {
    title: "HubSpot vs Salesforce Pricing Comparison for SaaS",
    targetKeywords: "HubSpot vs Salesforce pricing",
    customInsights: "Compare pricing models, licenses, and contracts.",
    maxHeadings: 1
  },
  {
    title: "Best ClickUp Alternatives for Task Management",
    targetKeywords: "ClickUp alternatives",
    customInsights: "Analyze competitors offering kanban and client portal features.",
    maxHeadings: 1
  }
];

async function runRealWorkloads() {
  console.log("=== STARTING PHASE 9 REAL PROVIDERS VALIDATION ===");
  const results: any[] = [];

  for (let i = 0; i < workloads.length; i++) {
    const workload = workloads[i];
    console.log(`\nExecuting Workload ${i + 1}/3: "${workload.title}"...`);
    const start = Date.now();
    let status = "SUCCESS";
    let article: any = null;
    let errorMsg = "";

    try {
      article = await GenerationPipelineAdapter.runPipeline(
        {
          title: workload.title,
          targetKeywords: workload.targetKeywords,
          customInsights: workload.customInsights,
          maxHeadings: workload.maxHeadings
        },
        () => {},
        undefined,
        {
          overrideBudget: {
            maxLLMCalls: 5,
            maxSearchCalls: 1,
            maxScrapeCalls: 3
          },
          overrideMaxReviewRetries: 1
        }
      );
    } catch (err: any) {
      status = "FAILED";
      errorMsg = err.message;
      console.error(`  Failed: ${err.message}`);
    }

    const duration = Date.now() - start;
    results.push({
      title: workload.title,
      status,
      durationMs: duration,
      wordCount: article?.sections?.[0]?.what_it_is?.split(/\s+/).length || 0,
      sectionsCount: article?.sections?.length || 0,
      llmCalls: article?.diagnostics?.telemetry?.llmCalls || 0,
      searchCalls: article?.diagnostics?.telemetry?.searchCalls || 0,
      scrapeCalls: article?.diagnostics?.telemetry?.scrapeCalls || 0,
      errors: errorMsg ? [errorMsg] : []
    });
  }

  // Create Phase 9 real execution report markdown
  let md = `# Phase 9 Real Execution Report\n\n`;
  md += `This report details the E2E live executions using real providers post-deprecation.\n\n`;
  md += `## Workload Execution Metrics\n\n`;
  md += `| Workload Title | Status | Duration | LLM Calls | Search Calls | Scrape Calls | Est. Cost | Output Sections |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const r of results) {
    const cost = `$${(r.llmCalls * 0.0001).toFixed(4)}`; // approx Gemini cost
    md += `| ${r.title} | **${r.status}** | ${(r.durationMs / 1000).toFixed(1)}s | ${r.llmCalls} | ${r.searchCalls} | ${r.scrapeCalls} | ${cost} | ${r.sectionsCount} |\n`;
  }

  fs.writeFileSync(
    path.join(__dirname, '../phase9_real_execution_report.md'),
    md
  );

  console.log("\n=== REAL VALIDATION RUN COMPLETE ===");
  console.table(results);
}

runRealWorkloads().catch(console.error);
