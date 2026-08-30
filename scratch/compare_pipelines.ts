// scratch/compare_pipelines.ts
import { POST } from '../src/app/api/generate-blocks/route';
import dotenv from 'dotenv';
dotenv.config();

// Enforce dry run mode for safety
process.env.ENABLE_DRY_RUN = 'true';

interface ComparisonMetric {
  title: string;
  durationLegacy: number;
  durationAgent: number;
  sectionsLegacy: number;
  sectionsAgent: number;
  llmCallsLegacy: number;
  llmCallsAgent: number;
  status: 'SUCCESS' | 'FAILED';
}

const workloads = [
  {
    title: "What is CRM Workflow Automation",
    targetKeywords: "crm workflow, crm automation",
    customInsights: "CRM systems automate customer interactions and lead stages.",
    maxHeadings: 1 // limit outline for cost safety
  },
  {
    title: "Best Lead Scoring Software Tools",
    targetKeywords: "lead scoring software, sales tools",
    customInsights: "Lead scoring identifies hot prospects automatically.",
    maxHeadings: 1
  },
  {
    title: "HubSpot vs Salesforce CRM Comparison",
    targetKeywords: "hubspot vs salesforce, crm comparison",
    customInsights: "HubSpot is user-friendly, Salesforce is highly customizable.",
    maxHeadings: 1
  },
  {
    title: "Asana Alternatives for Project Management",
    targetKeywords: "asana alternatives, project management",
    customInsights: "Teams need alternative task trackers with client portals.",
    maxHeadings: 1
  },
  {
    title: "How to Build a SaaS Marketing Strategy",
    targetKeywords: "saas marketing strategy, marketing funnel",
    customInsights: "SaaS growth requires organic search intent alignment.",
    maxHeadings: 1
  }
];

async function parseSseResponse(response: Response): Promise<{ events: any[]; completeData: any }> {
  const events: any[] = [];
  let completeData: any = null;
  const reader = response.body?.getReader();
  if (!reader) return { events, completeData };

  const textDecoder = new TextDecoder();
  let done = false;
  let buffer = "";

  while (!done) {
    const { value, done: rd } = await reader.read();
    done = rd;
    if (value) {
      buffer += textDecoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || ""; // keep unfinished line in buffer
      
      for (const part of parts) {
        if (part.trim().startsWith('data: ')) {
          try {
            const jsonStr = part.replace(/^data: /, '').trim();
            const parsed = JSON.parse(jsonStr);
            events.push(parsed);
            if (parsed.type === 'complete') {
              completeData = parsed.data;
            }
          } catch (e) {
            // parse error
          }
        }
      }
    }
  }
  return { events, completeData };
}

async function runComparison() {
  console.log("=== STARTING PIPELINE COMPARISON HARNESS ===\n");
  const results: ComparisonMetric[] = [];

  for (const [index, caseData] of workloads.entries()) {
    console.log(`\n--- Workload Case ${index + 1}/5: "${caseData.title}" ---`);
    
    // 1. Run Legacy Pipeline
    console.log("[Legacy] Launching legacy blocks generator...");
    process.env.ENABLE_AGENT_PIPELINE = "false";
    const startLegacy = Date.now();
    let legacySucceed = false;
    let legacyArticle: any = null;

    try {
      const reqLegacy = new Request("http://localhost/api/generate-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseData.title,
          targetKeywords: caseData.targetKeywords,
          customInsights: caseData.customInsights,
          maxHeadings: caseData.maxHeadings
        })
      });

      const resLegacy = await POST(reqLegacy);
      const parsedLegacy = await parseSseResponse(resLegacy);
      legacyArticle = parsedLegacy.completeData;
      legacySucceed = !!legacyArticle;
      console.log(`[Legacy] Status: ${legacySucceed ? 'SUCCESS' : 'FAILED'} in ${((Date.now() - startLegacy)/1000).toFixed(1)}s`);
    } catch (err: any) {
      console.error("[Legacy] Failed:", err.message);
    }
    const durationLegacy = Date.now() - startLegacy;

    // 2. Run Agent Pipeline
    console.log("[Agent] Launching new AgentOrchestrator pipeline...");
    process.env.ENABLE_AGENT_PIPELINE = "true";
    const startAgent = Date.now();
    let agentSucceed = false;
    let agentArticle: any = null;

    try {
      const reqAgent = new Request("http://localhost/api/generate-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: caseData.title,
          targetKeywords: caseData.targetKeywords,
          customInsights: caseData.customInsights,
          maxHeadings: caseData.maxHeadings
        })
      });

      const resAgent = await POST(reqAgent);
      const parsedAgent = await parseSseResponse(resAgent);
      agentArticle = parsedAgent.completeData;
      agentSucceed = !!agentArticle;
      console.log(`[Agent] Status: ${agentSucceed ? 'SUCCESS' : 'FAILED'} in ${((Date.now() - startAgent)/1000).toFixed(1)}s`);
    } catch (err: any) {
      console.error("[Agent] Failed:", err.message);
    }
    const durationAgent = Date.now() - startAgent;

    results.push({
      title: caseData.title,
      durationLegacy,
      durationAgent,
      sectionsLegacy: legacyArticle?.sections?.length || 0,
      sectionsAgent: agentArticle?.sections?.length || 0,
      llmCallsLegacy: legacyArticle?.diagnostics?.telemetry?.llmCalls || 0,
      llmCallsAgent: agentArticle?.diagnostics?.telemetry?.llmCalls || 0,
      status: (legacySucceed && agentSucceed) ? 'SUCCESS' : 'FAILED'
    });
  }

  // Save report to disk
  const fs = require('fs');
  const path = require('path');
  fs.writeFileSync(
    path.join(__dirname, 'pipeline_comparison_results.json'),
    JSON.stringify(results, null, 2)
  );

  console.log("\n=== PIPELINE COMPARISON COMPLETED ===");
  console.table(results);
}

runComparison().catch(console.error);
