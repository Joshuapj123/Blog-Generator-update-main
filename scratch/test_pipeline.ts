import { computeStructuredScore } from '../src/lib/content-scoring';

const KEYWORD = "AI contract review software";
const URL_EXTRACT = "http://localhost:3000/api/serp-extract";
const URL_GENERATE = "http://localhost:3000/api/generate-blocks";

function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  try {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (text.match(new RegExp(`\\b${esc}\\b`, 'gi')) || []).length;
  } catch { return 0; }
}

async function runPipeline() {
  console.log(`=== STARTING SERP EXTRACTION FOR KEYWORD: "${KEYWORD}" ===`);
  
  const extractRes = await fetch(URL_EXTRACT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword: KEYWORD, locale: "en-US" })
  });

  if (!extractRes.ok) {
    throw new Error(`SERP extraction failed with status ${extractRes.status}`);
  }

  const extractReader = extractRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let serpAnalysis: any = null;

  while (true) {
    const { value, done } = await extractReader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'stage') {
          console.log(`[SERP Extract Progress] ${event.label} (${event.percent}%)`);
        } else if (event.type === 'done') {
          serpAnalysis = event.data;
          console.log(`[SERP Extract Complete] Cached: ${!!event.cached}`);
        } else if (event.type === 'error') {
          console.error(`[SERP Extract Error]`, event.message);
        }
      } catch {}
    }
  }

  if (!serpAnalysis) {
    throw new Error("SERP Extraction did not return analysis data.");
  }

  console.log("\n=== SERP ANALYSIS EXTRACTED ===");
  console.log(`Analyzed Competitors: ${serpAnalysis.analyzedCompetitors}`);
  console.log(`Median Word Count: ${serpAnalysis.medianWordCount}`);
  console.log(`Median H2 Count: ${serpAnalysis.medianH2Count}`);
  console.log(`Topic Clusters Found: ${serpAnalysis.topicClusters?.length || 0}`);
  console.log(`Entities Extracted: ${serpAnalysis.entities?.length || 0}`);

  console.log("\n=== STARTING BLOCK GENERATION ===");
  
  const generatePayload = {
    title: `AI Contract Review Software: Features, Benefits, Use Cases, and Best Tools in 2026`,
    targetKeywords: KEYWORD,
    contentStructureMode: "inspire",
    campaignMode: "own_blog",
    ctaIntent: "Book an AI scaling consultation with us",
    serpTerms: serpAnalysis.terms,
    serpMedianWordCount: serpAnalysis.medianWordCount,
    serpMedianTitleLength: serpAnalysis.medianTitleLength,
    serpMedianH2Count: serpAnalysis.medianH2Count,
    serpEntities: serpAnalysis.entities,
    serpAnalysis: serpAnalysis,
    detectedFormat: "Guide"
  };

  // Import Agent and setGlobalDispatcher from undici to configure custom timeouts globally and prevent UND_ERR_HEADERS_TIMEOUT
  const { Agent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new Agent({
    headersTimeout: 30 * 60 * 1000, // 30 minutes
    bodyTimeout: 30 * 60 * 1000,
    connectTimeout: 30 * 60 * 1000,
  }));

  const genRes = await fetch(URL_GENERATE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(generatePayload)
  });

  if (!genRes.ok) {
    throw new Error(`Outline generation failed with status ${genRes.status}`);
  }

  const genReader = genRes.body!.getReader();
  let genBuffer = '';
  let finalArticle: any = null;

  while (true) {
    const { value, done } = await genReader.read();
    if (done) break;
    genBuffer += decoder.decode(value, { stream: true });

    const lines = genBuffer.split('\n');
    genBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'status') {
          console.log(`[Generation Progress] ${event.message} (${event.progress}%)`);
        } else if (event.type === 'outline') {
          console.log(`[Generation] Outline created with ${event.data.section_outlines.length} sections.`);
          event.data.section_outlines.forEach((s: any, idx: number) => {
            console.log(`  Section ${idx + 1}: ${s.heading} (${s.level}) - Budget: ${s.target_word_budget} words. Entities: ${s.target_entities?.join(', ') || 'none'}`);
          });
        } else if (event.type === 'complete') {
          finalArticle = event.data;
          console.log(`[Generation Complete] Article generated successfully.`);
          if (finalArticle.diagnostics) {
            console.log("\n[Diagnostics from Generator]:");
            console.log(JSON.stringify(finalArticle.diagnostics, null, 2));
          }
        } else if (event.type === 'error') {
          console.error(`[Generation Error]`, event.message);
        }
      } catch {}
    }
  }

  if (!finalArticle) {
    throw new Error("Generation did not return a completed article.");
  }

  console.log("\n=== ASSEMBLING GENERATED CONTENT FOR SCORING ===");

  // Build the markdown content context
  let markdownText = `# ${finalArticle.title}\n\n`;
  
  if (finalArticle.intro) {
    markdownText += `${finalArticle.intro.hook}\n\n${finalArticle.intro.thesis}\n\n${finalArticle.intro.business_context}\n\n`;
  }

  const headings: string[] = [];

  finalArticle.sections.forEach((s: any) => {
    headings.push(s.heading);
    const prefix = s.level === 'H2' ? '##' : '###';
    markdownText += `${prefix} ${s.heading}\n\n`;
    markdownText += `${s.what_it_is}\n\n${s.why_it_works}\n\n${s.experience_or_data_point}\n\n`;
    
    if (s.example_brands && s.example_brands.length > 0) {
      markdownText += `**Real-World Examples:**\n`;
      s.example_brands.forEach((brand: string) => {
        markdownText += `- ${brand}\n`;
      });
      markdownText += `\n`;
    }
    
    if (s.copy_formula && s.copy_formula.length > 0) {
      markdownText += `**Actionable Patterns:**\n`;
      s.copy_formula.forEach((pattern: string) => {
        markdownText += `- ${pattern}\n`;
      });
      markdownText += `\n`;
    }

    if (s.markdown_table) {
      markdownText += `${s.markdown_table}\n\n`;
    }
  });

  if (finalArticle.cta) {
    markdownText += `## ${finalArticle.cta.heading}\n\n${finalArticle.cta.description}\n\n**[${finalArticle.cta.button_text}](${finalArticle.cta.url || '#'})**\n\n`;
  }

  // Calculate live keywords frequency count
  const liveTerms = serpAnalysis.terms.map((t: any) => {
    const currentCount = countOccurrences(markdownText, t.term);
    return {
      ...t,
      currentCount,
      overuseRisk: t.recommendedMax ? currentCount > t.recommendedMax : false
    };
  });

  console.log("\n=== RUNNING SEO SCORING ENGINE ===");

  const scoreResult = computeStructuredScore({
    textContext: markdownText,
    title: finalArticle.title,
    headings: headings,
    liveTerms: liveTerms,
    entities: serpAnalysis.entities,
    topTermsForIntent: serpAnalysis.topTermsForIntent,
    medianWordCount: serpAnalysis.medianWordCount,
    medianTitleLength: serpAnalysis.medianTitleLength,
    medianH2Count: serpAnalysis.medianH2Count,
    contentGapReport: serpAnalysis.contentGapReport,
    headingFrequency: serpAnalysis.headingFrequency,
    topicClusters: serpAnalysis.topicClusters,
    paaQuestions: serpAnalysis.paaQuestions,
    medianLexicalDiversity: serpAnalysis.medianLexicalDiversity,
    featuredSnippetBlueprint: serpAnalysis.featuredSnippetBlueprint
  });

  console.log("\n=================== RESULT METRICS ===================");
  console.log(`Blended SEO Score: ${scoreResult.totalScore} / 100`);
  console.log(`Semantic (S) Score: ${scoreResult.breakdown.S}`);
  console.log(`Entity (E) Score:   ${scoreResult.breakdown.E}`);
  console.log(`Intent (I) Score:   ${scoreResult.breakdown.I}`);
  console.log(`Structure (O) Score: ${scoreResult.breakdown.O}`);
  console.log(`Gap (G) Score:      ${scoreResult.breakdown.G}`);
  console.log(`Readability (R):    ${scoreResult.breakdown.R}`);
  console.log(`Word Count:         ${scoreResult.stats.wordCount}`);
  console.log(`Penalties:          ${scoreResult.penalties} points`);
  if (scoreResult.penaltyReasons.length > 0) {
    console.log(`Penalty Reasons:`);
    scoreResult.penaltyReasons.forEach(reason => console.log(`  - ${reason}`));
  }
  console.log("======================================================");

  // Write article output to file
  const fs = require('fs');
  fs.writeFileSync('scratch/last_generated_article.md', markdownText, 'utf8');
  fs.writeFileSync('scratch/last_generated_article.json', JSON.stringify(finalArticle, null, 2), 'utf8');
  console.log("\nWrote last_generated_article.md and last_generated_article.json to scratch/");

  // Print detailed entity coverage
  const targetEntities = serpAnalysis.entities.filter((e: any) => {
    const coverage = e.competitorCoverage ?? 0;
    const importance = e.importanceScore ?? Math.round(coverage * 100);
    return coverage >= 0.4 || importance >= 40;
  });

  console.log(`\nDetailed Entity Coverage (${scoreResult.stats.entityCovered} covered):`);
  targetEntities.forEach((e: any) => {
    const name = e.entityName.toLowerCase();
    const isCovered = markdownText.toLowerCase().includes(name);
    console.log(`  - [${isCovered ? 'X' : ' '}] ${e.entityName} (importance: ${e.importanceScore}, type: ${e.entityType})`);
  });

  // Assert target metrics
  const maxWordLimit = serpAnalysis.medianWordCount * 2.0;
  const success = 
    scoreResult.breakdown.O >= 85 &&
    scoreResult.breakdown.E >= 90 &&
    scoreResult.breakdown.G >= 90 &&
    scoreResult.breakdown.I >= 85 &&
    scoreResult.totalScore >= 90 &&
    scoreResult.stats.wordCount <= maxWordLimit;

  if (success) {
    console.log("\n🎉 SUCCESS: All target metrics have been met or exceeded!");
    process.exit(0);
  } else {
    console.error("\n❌ FAILURE: One or more target metrics were not satisfied:");
    if (scoreResult.breakdown.O < 85) console.error(` - Structure Score ${scoreResult.breakdown.O} is below 85`);
    if (scoreResult.breakdown.E < 90) console.error(` - Entity Score ${scoreResult.breakdown.E} is below 90`);
    if (scoreResult.breakdown.G < 90) console.error(` - Gap Score ${scoreResult.breakdown.G} is below 90`);
    if (scoreResult.breakdown.I < 85) console.error(` - Intent Score ${scoreResult.breakdown.I} is below 85`);
    if (scoreResult.totalScore < 90) console.error(` - Overall SEO Score ${scoreResult.totalScore} is below 90`);
    if (scoreResult.stats.wordCount > maxWordLimit) console.error(` - Word count ${scoreResult.stats.wordCount} exceeds 1.5x median (${maxWordLimit})`);
    process.exit(1);
  }
}

runPipeline().catch(err => {
  console.error("Pipeline run error:", err);
  process.exit(1);
});
