import { generateObject as aiGenerateObject, generateText as aiGenerateText } from 'ai';
import fs from 'fs';
import path from 'path';
import { getLocalCache, setLocalCache, getCacheStats } from './local-cache';

const AUDIT_FILE = path.resolve('c:/Users/Joshua/Desktop/Blog-Generator-main/scratch/gemini_audit_log.json');

export interface GeminiCallRecord {
  timestamp: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number;
  cached?: boolean;
  runId?: string;
  savedCost?: number;
}

export interface StageDetail {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latency: number;
}

export interface TelemetryStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  estimatedCostSaved: number;
  dryRunEnabled: boolean;
  mostExpensiveStage: string;
  stageCosts: Record<string, number>;
  callCounts: Record<string, number>;
  stages: Record<string, StageDetail>;
  cacheHits: number;
  cacheMisses: number;
  cacheHitPercentage: number;
}

// Pricing rates per million tokens
const RATES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'default': { input: 0.30, output: 2.50 }
};

export function logGeminiCall(
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
  cached = false,
  runId?: string,
  isDryRun = false
): GeminiCallRecord {
  const rate = RATES[model] || RATES['default'];
  const potentialCost = ((inputTokens * rate.input) + (outputTokens * rate.output)) / 1_000_000;
  
  const cost = cached || isDryRun ? 0 : potentialCost;
  const savedCost = cached || isDryRun ? potentialCost : 0;

  const record: GeminiCallRecord = {
    timestamp: new Date().toISOString(),
    operation,
    model,
    inputTokens,
    outputTokens,
    cost: parseFloat(cost.toFixed(6)),
    durationMs,
    cached: cached,
    runId,
    savedCost: parseFloat(savedCost.toFixed(6))
  };

  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let logs: GeminiCallRecord[] = [];
    if (fs.existsSync(AUDIT_FILE)) {
      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      try {
        logs = JSON.parse(content);
      } catch (e) {
        logs = [];
      }
    }
    logs.push(record);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.error('[Telemetry] Failed to log Gemini call:', e);
  }

  return record;
}

export function clearAuditLog(): void {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      fs.writeFileSync(AUDIT_FILE, '[]', 'utf8');
    }
  } catch (e) {
    console.error('[Telemetry] Failed to clear audit log:', e);
  }
}

export function getTelemetryStats(runId?: string): TelemetryStats {
  const cacheStats = getCacheStats();
  const dryRunEnabled = process.env.ENABLE_DRY_RUN === 'true';

  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      const logs: GeminiCallRecord[] = JSON.parse(content);

      // Filter logs if runId is provided
      const filteredLogs = runId ? logs.filter(log => log.runId === runId) : logs;

      let totalCalls = filteredLogs.length;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCost = 0;
      let estimatedCostSaved = 0;

      const stageCosts: Record<string, number> = {};
      const callCounts: Record<string, number> = {};
      const stages: Record<string, StageDetail> = {};

      filteredLogs.forEach(log => {
        totalInputTokens += log.inputTokens;
        totalOutputTokens += log.outputTokens;
        totalCost += log.cost;
        estimatedCostSaved += log.savedCost || 0;

        const stageName = log.operation;
        stageCosts[stageName] = (stageCosts[stageName] || 0) + log.cost;
        callCounts[stageName] = (callCounts[stageName] || 0) + 1;

        if (!stages[stageName]) {
          stages[stageName] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, latency: 0 };
        }
        const st = stages[stageName];
        st.calls += 1;
        st.inputTokens += log.inputTokens;
        st.outputTokens += log.outputTokens;
        st.cost += log.cost;
        st.latency += log.durationMs;
      });

      // Round stage metrics and convert to standard types
      Object.keys(stageCosts).forEach(k => {
        stageCosts[k] = parseFloat(stageCosts[k].toFixed(6));
      });
      Object.keys(stages).forEach(k => {
        stages[k].cost = parseFloat(stages[k].cost.toFixed(6));
      });

      // Determine most expensive stage
      let mostExpensiveStage = 'None';
      let maxStageCost = -1;
      Object.entries(stageCosts).forEach(([stage, cost]) => {
        if (cost > maxStageCost) {
          maxStageCost = cost;
          mostExpensiveStage = stage;
        }
      });

      return {
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        totalCost: parseFloat(totalCost.toFixed(6)),
        estimatedCostSaved: parseFloat(estimatedCostSaved.toFixed(6)),
        dryRunEnabled,
        mostExpensiveStage,
        stageCosts,
        callCounts,
        stages,
        ...cacheStats
      };
    }
  } catch (e) {
    console.error('[Telemetry] Failed to read stats:', e);
  }

  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    estimatedCostSaved: 0,
    dryRunEnabled,
    mostExpensiveStage: 'None',
    stageCosts: {},
    callCounts: {},
    stages: {},
    ...cacheStats
  };
}

export function checkBudgetGuardrail(runId: string, limit = 2.0): void {
  if (!runId) return;
  const stats = getTelemetryStats(runId);
  if (stats.totalCost > limit) {
    throw new Error(`[BudgetGuardrail] Budget exceeded for run ${runId}: $${stats.totalCost.toFixed(4)} spent (Limit: $${limit.toFixed(2)}). Execution stopped.`);
  }
}

function getMockDataForOperation(operation: string, options: any): any {
  const prompt = options.prompt || '';

  // Extract keyword
  let keyword = 'SEO';
  const kwMatch = prompt.match(/primary target keyword is:\s*"([^"]+)"/i) || 
                  prompt.match(/target keyword is:\s*"([^"]+)"/i) ||
                  prompt.match(/targetKeywords:\s*"([^"]+)"/i) ||
                  prompt.match(/targetKeywords = "([^"]+)"/i) ||
                  prompt.match(/targetKeywords:\s*([^,\n\r]+)/i);
  if (kwMatch) {
    keyword = kwMatch[1].trim();
  } else if (options.cacheKey) {
    const parts = options.cacheKey.split('_');
    if (parts.length >= 3) {
      keyword = parts[2];
    } else {
      keyword = parts[1] || 'SEO';
    }
  }

  // Extract title
  let title = `The Ultimate Guide to ${keyword}`;
  const titleMatch = prompt.match(/blog post title:\s*"([^"]+)"/i) || 
                     prompt.match(/article:\s*"([^"]+)"/i) ||
                     prompt.match(/given the blog post title:\s*"([^"]+)"/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Extract heading for section writing
  let heading = `About ${keyword}`;
  const headingMatch = prompt.match(/section\s*"([^"]+)"/i) ||
                       prompt.match(/writing section\s*"([^"]+)"/i);
  if (headingMatch) {
    heading = headingMatch[1].trim();
  }

  if (operation === 'Core Keyword Extraction') {
    let desc = 'SEO';
    const descMatch = prompt.match(/"([^"]+)"/);
    if (descMatch) {
      desc = descMatch[1].slice(0, 30);
    }
    return {
      text: desc.split(' ').slice(0, 3).join(' ') || 'SEO',
      usage: { promptTokens: 500, completionTokens: 100 }
    };
  }

  if (operation === 'Strategy Generation') {
    return {
      object: {
        coreTakeaway: `Mastering ${keyword} requires a structured topic cluster, high E-E-A-T section content, and targeted search intent alignment.`,
        actionPlan: [
          {
            title: "Plan Architecture",
            description: "Map out the topic clusters",
            tasks: [
              { task: `Identify 10 semantic keywords for ${keyword}`, completed: false },
              { task: `Group into H2/H3 clusters`, completed: false }
            ]
          },
          {
            title: "Content Production",
            description: "Produce the core and supporting articles",
            tasks: [
              { task: `Create the primary ${keyword} guide`, completed: false },
              { task: `Write supporting FAQ sections`, completed: false }
            ]
          }
        ],
        checklist: [
          { task: `Optimize for ${keyword} intent`, reason: "Rank higher on Google" },
          { task: "Include comparison tables", reason: "Increase click-through rate" }
        ],
        mistakes: [
          "Keyword stuffing",
          "Shallow section depth"
        ],
        actionItems: [
          `Generate the primary page for ${keyword}`,
          `Link supporting posts back to the core ${keyword} guide`
        ],
        recommendedPages: [
          {
            title: title,
            keyword: keyword,
            intent: 'commercial',
            role: 'primary',
            format: 'Ultimate Guide'
          },
          {
            title: `How to implement ${keyword}`,
            keyword: `${keyword} guide`,
            intent: 'informational',
            role: 'support',
            format: 'How-To'
          },
          {
            title: `Best ${keyword} software tools`,
            keyword: `best ${keyword} tools`,
            intent: 'commercial',
            role: 'support',
            format: 'Comparison'
          }
        ]
      },
      usage: { promptTokens: 3000, completionTokens: 2000 }
    };
  }
  
  if (operation === 'Keyword Analysis') {
    return {
      object: {
        keywords: [
          { term: `${keyword} strategy`, category: 'basic' },
          { term: `best ${keyword} tools`, category: 'basic' },
          { term: `how to optimize ${keyword}`, category: 'supplementary' },
          { term: `what is ${keyword}`, category: 'supplementary' },
          { term: `top ${keyword} platforms`, category: 'contextual' }
        ],
        clusters: [
          { clusterName: 'Overview', keywords: [`what is ${keyword}`, `${keyword} strategy`] },
          { clusterName: 'Tools & Platforms', keywords: [`best ${keyword} tools`, `top ${keyword} platforms`] }
        ]
      },
      usage: { promptTokens: 2000, completionTokens: 100 }
    };
  }
  
  if (operation === 'Entity Analysis') {
    return {
      object: {
        entities: [
          { name: `${keyword}`, type: 'concept' },
          { name: 'Google Search', type: 'organization' },
          { name: 'SEMrush', type: 'tool' },
          { name: 'Ahrefs', type: 'tool' }
        ],
        relationships: [
          { source: `${keyword}`, target: 'Google Search', type: 'targets' },
          { source: 'SEMrush', target: `${keyword}`, type: 'analyzes' }
        ],
        recommendedConnections: [
          `${keyword} -> Google Search`,
          `SEMrush -> ${keyword}`
        ]
      },
      usage: { promptTokens: 2000, completionTokens: 1000 }
    };
  }
  
  if (operation === 'Intent Analysis') {
    return {
      object: {
        intent: 'informational',
        confidenceScore: 90,
        intentConfidence: {
          informational: 80,
          commercial: 10,
          transactional: 5,
          comparison: 5
        },
        formatRecommendation: 'Guide',
        toneGuidelines: 'Authoritative, clear, and helpful.',
        structureGuidelines: 'Start with definition, explain core concepts, and provide best practices.',
        recommendedOutlineSections: [
          { heading: `What is ${keyword}?`, level: 'H2', purpose: 'Define the concept.' },
          { heading: `Benefits of ${keyword}`, level: 'H2', purpose: 'Explain benefits.' }
        ]
      },
      usage: { promptTokens: 1500, completionTokens: 500 }
    };
  }
  
  if (operation === 'Featured Snippet') {
    return {
      object: {
        hasFeaturedSnippet: true,
        snippetType: 'definition',
        targetQuery: keyword,
        extractedSnippetText: `${keyword} is a critical marketing methodology.`,
        optimizedSnippetRecommendation: `**${keyword}** is the strategic process of optimizing systems to achieve higher efficiency.`,
        generationDirectives: 'Place this H2 definition first, keep it exactly 50 words, use bolding.'
      },
      usage: { promptTokens: 1500, completionTokens: 500 }
    };
  }
  
  if (operation === 'Content Gaps') {
    return {
      object: {
        headingFrequency: [
          { heading: `Introduction to ${keyword}`, competitorRanks: [1, 2, 3] },
          { heading: `Advanced ${keyword} Techniques`, competitorRanks: [1, 4] }
        ],
        tableDetection: {
          recommendedTables: [
            {
              name: `${keyword} Tools Comparison`,
              type: 'Comparison',
              columns: ['Tool', 'Core Feature', 'Pricing'],
              purpose: 'Compare top tools'
            }
          ]
        },
        paaClustered: [
          { question: `How does ${keyword} work?`, frequency: 3 },
          { question: `Why is ${keyword} important?`, frequency: 2 }
        ],
        contentGapReport: {
          commonTopics: [`What is ${keyword}`, `Benefits of ${keyword}`],
          uniqueHeadings: [`Advanced ${keyword} Automation`],
          missingTopics: [`AI in ${keyword}`],
          recommendedNewSections: [
            { heading: `AI-Driven ${keyword}`, level: 'H2', reason: 'Rising competitor interest', suggestedOutline: 'Detail AI models used' }
          ],
          unansweredQuestions: [`Will AI replace ${keyword}?`],
          shouldIncludeFaq: true,
          faqQuestions: [`How do I start with ${keyword}?`, `What is the cost of ${keyword}?`]
        }
      },
      usage: { promptTokens: 2500, completionTokens: 1000 }
    };
  }
  
  if (operation === 'Outline Generation') {
    return {
      object: {
        title: title,
        title_tag: `${keyword} Guide: Boost Your Business Efficiency`,
        slug: `${keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}-guide`,
        intent: 'informational',
        schema_markup: '{"@context": "https://schema.org", "@type": "BlogPosting"}',
        open_graph_tags: [`<meta property="og:title" content="${title}" />`],
        intro: {
          hook: `Looking to master ${keyword}? Here is the exact strategy to win.`,
          transition: 'In this guide, we will break down the core components.',
          thesis: 'Topical authority is the key to ranking.'
        },
        section_outlines: [
          { heading: `What is ${keyword}?`, level: 'H2', core_concept: `Define ${keyword}`, min_word_budget: 150, target_word_budget: 250, target_entities: [`${keyword}`, 'Automation', 'Workflows'], generate_table: false },
          { heading: `Core Benefits of ${keyword}`, level: 'H2', core_concept: 'Explain benefits', min_word_budget: 150, target_word_budget: 250, target_entities: ['Efficiency', 'ROI', 'Scaling'], generate_table: false },
          { heading: `Top ${keyword} Tools Compared`, level: 'H2', core_concept: 'Compare software tools', min_word_budget: 150, target_word_budget: 250, target_entities: ['SEMrush', 'Ahrefs'], generate_table: true },
          { heading: `Frequently Asked Questions`, level: 'H2', core_concept: 'FAQ list', min_word_budget: 150, target_word_budget: 250, target_entities: ['Cost', 'Beginners'], generate_table: false }
        ],
        cta: {
          heading: `Ready to Scale Your ${keyword}?`,
          body: 'Get in touch with our experts today to get started.',
          button_text: 'Contact Us',
          button_url: '/contact'
        }
      },
      usage: { promptTokens: 3000, completionTokens: 2000 }
    };
  }
  
  if (operation === 'Section Content Generation' || operation === 'Section Content Repair') {
    let coreConcept = `Explain ${heading}`;
    const conceptMatch = prompt.match(/Core concept:\s*"([^"]+)"/i);
    if (conceptMatch) {
      coreConcept = conceptMatch[1];
    }

    return {
      object: {
        heading: heading,
        what_it_is: `This section explains what ${heading} is in detail. It covers the history, context, and fundamental rules of ${coreConcept}. Mastery of these basics is required for success.`,
        why_it_works: `Implementing this strategy works because users prioritize high-quality, structured execution. Clear execution budgets and targeted entities ensure high intent alignment.`,
        experience_or_data_point: `According to recent industry benchmarks, teams covering these high-priority concepts see up to a 40% increase in productivity scores.`,
        example_brands: [
          `Brand A: They implement ${keyword} strategies to improve productivity.`,
          `Brand B: They use advanced ${keyword} tools for analysis.`
        ],
        copy_formula: [
          `Identify target goals for ${keyword}.`,
          `Optimize processes and systems.`,
          `Measure overall efficiency.`
        ],
        takeaway: `Always prioritize user intent and depth when optimization is the goal.`,
        rich_media_query: {
          type: 'image',
          suggested_search_query: `${heading} workflow diagram`,
          image_prompt: `High-quality diagram explaining ${heading} workflow`,
          alt_text: `Flowchart showing ${heading} steps`
        },
        outbound_authority_link: {
          anchor_text: 'Industry Guidelines',
          search_query: `${heading} best practices documentation`
        },
        markdown_table: options.prompt?.includes('selected for table generation')
          ? `| Tool Name | Core Feature | Pricing |\n|---|---|---|\n| Tool A | Basic ${keyword} | Free |\n| Tool B | Enterprise ${keyword} | Paid |`
          : ''
      },
      usage: { promptTokens: 2500, completionTokens: 1000 }
    };
  }
  
  if (operation === 'Outreach Pitch Email') {
    return {
      object: {
        subject: `Exclusive Guest Post: The Ultimate Guide to ${keyword}`,
        body: `Dear Editor,\n\nI have written a highly optimized, comprehensive guide on ${keyword} that would be a perfect fit for your publication.\n\nBest regards.`
      },
      usage: { promptTokens: 1000, completionTokens: 500 }
    };
  }
  
  // Default fallback for text operation
  return {
    text: `This is a mock text response for operation: ${operation}. It is generated dynamically in Developer Dry Run Mode to avoid Gemini usage.`,
    usage: { promptTokens: 1500, completionTokens: 500 }
  };
}

function logPromptAndResponse(
  operation: string,
  modelName: string,
  runId: string | undefined,
  prompt: string,
  system: string | undefined,
  response: any
) {
  try {
    const scratchDir = 'c:/Users/Joshua/Desktop/Blog-Generator-main/scratch';
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    // 1. Log prompt
    const promptFile = path.join(scratchDir, 'diagnostic_prompts.log');
    const promptEntry = `=========================================\n` +
      `STAGE: ${operation}\n` +
      `TIME: ${new Date().toISOString()}\n` +
      `MODEL: ${modelName}\n` +
      `RUN_ID: ${runId || 'none'}\n` +
      `SYSTEM: ${system || 'none'}\n` +
      `PROMPT:\n${prompt}\n` +
      `=========================================\n\n`;
    fs.appendFileSync(promptFile, promptEntry, 'utf8');

    // 2. Log raw response
    const rawResponseFile = path.join(scratchDir, 'diagnostic_raw_responses.json');
    let responses: any[] = [];
    if (fs.existsSync(rawResponseFile)) {
      try {
        responses = JSON.parse(fs.readFileSync(rawResponseFile, 'utf8'));
      } catch (e) {
        responses = [];
      }
    }
    responses.push({
      timestamp: new Date().toISOString(),
      operation,
      model: modelName,
      runId: runId || 'none',
      rawResponse: response
    });
    fs.writeFileSync(rawResponseFile, JSON.stringify(responses, null, 2), 'utf8');
  } catch (e) {
    console.error('[Telemetry] Failed to log prompt/response diagnostics:', e);
  }
}

export function logPipelineCheckpoint(stage: string, title: string, keyword: string, passed: boolean) {
  const checkpoint = {
    stage,
    title,
    keyword,
    passed,
    timestamp: new Date().toISOString()
  };
  try {
    const scratchDir = 'c:/Users/Joshua/Desktop/Blog-Generator-main/scratch';
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    const file = path.join(scratchDir, 'pipeline_checkpoints.jsonl');
    fs.appendFileSync(file, JSON.stringify(checkpoint) + '\n', 'utf8');
    console.log(`[Pipeline Checkpoint] ${stage}: Passed=${passed}`);
  } catch (e) {
    console.error(`Failed to write pipeline checkpoint for ${stage}:`, e);
  }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries <= 0) {
      throw err;
    }
    const isRateLimit = err.status === 429 || err.statusCode === 429 || String(err).includes("429") || String(err).includes("Rate limit");
    const isTransient = isRateLimit || err.status >= 500 || String(err).includes("500") || String(err).includes("503");
    
    if (isTransient) {
      console.warn(`[Gemini Retry] Transient error encountered. Retrying in ${delay}ms... (Remaining retries: ${retries})`, err.message || err);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

export async function generateObjectWithTelemetry<T>(
  operation: string,
  options: Parameters<typeof aiGenerateObject>[0] & { cacheKey?: string; runId?: string }
): Promise<any> {
  const startTime = Date.now();
  const modelName = (options.model as any).modelId || 'gemini-2.5-pro';
  const runId = options.runId;

  // Check budget guardrail before executing call
  if (runId) {
    checkBudgetGuardrail(runId);
  }

  // Check cache if cacheKey is provided
  if (options.cacheKey) {
    const cachedData = getLocalCache(options.cacheKey);
    if (cachedData) {
      const duration = Date.now() - startTime;
      logGeminiCall(operation, modelName, cachedData.usage?.promptTokens || 0, cachedData.usage?.completionTokens || 0, duration, true, runId);
      return {
        ...cachedData,
        cached: true,
        dryRun: false
      };
    }
  }

  // Handle dry-run mode
  if (process.env.ENABLE_DRY_RUN === 'true') {
    const mockResult = getMockDataForOperation(operation, options);
    const duration = 100; // simulated latency
    logGeminiCall(operation, modelName, mockResult.usage.promptTokens, mockResult.usage.completionTokens, duration, false, runId, true);
    
    // Log prompt and raw response for dry run
    const promptStr = typeof options.prompt === 'string'
      ? options.prompt
      : options.prompt
      ? JSON.stringify(options.prompt)
      : '';
    const systemStr = typeof options.system === 'string'
      ? options.system
      : options.system
      ? JSON.stringify(options.system)
      : undefined;
    logPromptAndResponse(operation, modelName, runId, promptStr, systemStr, mockResult.object || mockResult);

    // Cache result if cacheKey is provided
    if (options.cacheKey) {
      setLocalCache(options.cacheKey, mockResult);
    }
    return {
      ...mockResult,
      cached: false,
      dryRun: true
    };
  }

  try {
    const result = await retryWithBackoff(() => aiGenerateObject(options));
    const duration = Date.now() - startTime;

    const inputTokens = (result.usage as any)?.promptTokens || 0;
    const outputTokens = (result.usage as any)?.completionTokens || 0;

    logGeminiCall(operation, modelName, inputTokens, outputTokens, duration, false, runId);

    // Log prompt and raw response for live Gemini API call
    const promptStr = typeof options.prompt === 'string'
      ? options.prompt
      : options.prompt
      ? JSON.stringify(options.prompt)
      : '';
    const systemStr = typeof options.system === 'string'
      ? options.system
      : options.system
      ? JSON.stringify(options.system)
      : undefined;
    logPromptAndResponse(operation, modelName, runId, promptStr, systemStr, result.object);

    // Cache result if cacheKey is provided
    if (options.cacheKey) {
      setLocalCache(options.cacheKey, {
        object: result.object,
        usage: result.usage
      });
    }

    return {
      object: result.object,
      usage: result.usage,
      cached: false,
      dryRun: false
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logGeminiCall(`${operation} (failed)`, modelName, 0, 0, duration, false, runId);
    throw err;
  }
}

export async function generateTextWithTelemetry(
  operation: string,
  options: Parameters<typeof aiGenerateText>[0] & { cacheKey?: string; runId?: string }
): Promise<any> {
  const startTime = Date.now();
  const modelName = (options.model as any).modelId || 'gemini-2.5-pro';
  const runId = options.runId;

  // Check budget guardrail before executing call
  if (runId) {
    checkBudgetGuardrail(runId);
  }

  // Check cache if cacheKey is provided
  if (options.cacheKey) {
    const cachedData = getLocalCache(options.cacheKey);
    if (cachedData) {
      const duration = Date.now() - startTime;
      logGeminiCall(operation, modelName, cachedData.usage?.promptTokens || 0, cachedData.usage?.completionTokens || 0, duration, true, runId);
      return {
        ...cachedData,
        cached: true,
        dryRun: false
      };
    }
  }

  // Handle dry-run mode
  if (process.env.ENABLE_DRY_RUN === 'true') {
    const mockResult = getMockDataForOperation(operation, options);
    const duration = 100; // simulated latency
    logGeminiCall(operation, modelName, mockResult.usage.promptTokens, mockResult.usage.completionTokens, duration, false, runId, true);
    
    // Log prompt and raw response for dry run
    const promptStr = typeof options.prompt === 'string'
      ? options.prompt
      : options.prompt
      ? JSON.stringify(options.prompt)
      : '';
    const systemStr = typeof options.system === 'string'
      ? options.system
      : options.system
      ? JSON.stringify(options.system)
      : undefined;
    logPromptAndResponse(operation, modelName, runId, promptStr, systemStr, mockResult.text || mockResult);

    // Cache result if cacheKey is provided
    if (options.cacheKey) {
      setLocalCache(options.cacheKey, mockResult);
    }
    return {
      ...mockResult,
      cached: false,
      dryRun: true
    };
  }

  try {
    const result = await retryWithBackoff(() => aiGenerateText(options));
    const duration = Date.now() - startTime;

    const inputTokens = (result.usage as any)?.promptTokens || 0;
    const outputTokens = (result.usage as any)?.completionTokens || 0;

    logGeminiCall(operation, modelName, inputTokens, outputTokens, duration, false, runId);

    // Log prompt and raw response for live Gemini API call
    const promptStr = typeof options.prompt === 'string'
      ? options.prompt
      : options.prompt
      ? JSON.stringify(options.prompt)
      : '';
    const systemStr = typeof options.system === 'string'
      ? options.system
      : options.system
      ? JSON.stringify(options.system)
      : undefined;
    logPromptAndResponse(operation, modelName, runId, promptStr, systemStr, result.text);

    // Cache result if cacheKey is provided
    if (options.cacheKey) {
      setLocalCache(options.cacheKey, {
        text: result.text,
        usage: result.usage
      });
    }

    return {
      text: result.text,
      usage: result.usage,
      cached: false,
      dryRun: false
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logGeminiCall(`${operation} (failed)`, modelName, 0, 0, duration, false, runId);
    throw err;
  }
}

