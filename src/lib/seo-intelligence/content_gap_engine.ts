import { google } from '@ai-sdk/google';
import { generateObjectWithTelemetry } from '../gemini-telemetry';
import { z } from 'zod';
import { ContentGapReport, HeadingFrequencyItem, TableDetectionResult, PaaQuestionItem } from '@/types/serp';
import { ScrapedCompetitor } from './serp_collector';

export interface ContentGapEngineResult {
  contentGapReport: ContentGapReport;
  headingFrequency: HeadingFrequencyItem[];
  tableDetection: TableDetectionResult;
  paaQuestions: PaaQuestionItem[];
}

export async function processContentGaps(
  keyword: string,
  competitors: ScrapedCompetitor[],
  initialPaa: PaaQuestionItem[] = [],
  options?: { runId?: string }
): Promise<ContentGapEngineResult> {
  const model = google('gemini-2.5-flash');

  // Competitor structures with rank and weight
  const competitorOutlines = competitors.map((c, i) => {
    const rank = i + 1;
    const weight = c.weight !== undefined ? c.weight : parseFloat(Math.max(0.1, 1.1 - rank * 0.1).toFixed(1));
    return {
      rank,
      weight,
      url: c.url,
      title: c.title,
      hasTable: c.hasTables,
      tableCount: c.tableCount,
      headings: c.headings.map(h => `${h.tag.toUpperCase()}: ${h.text}`)
    };
  });

  const prompt = `You are a senior SEO content gap and search structure engineer.
We are analyzing competitor pages and PAA (People Also Ask) questions for keyword: "${keyword}".

COMPETITOR STRUCTURES (with authority weighting by rank):
${JSON.stringify(competitorOutlines, null, 2)}

INITIAL PAA QUESTIONS:
${JSON.stringify(initialPaa, null, 2)}

Your task:
1. Heading Frequency: Identify the most common headings across these competitors. Group semantically identical headings (e.g. "What is CRM?" and "Understanding CRMs" are the same). List the top headings and specify which competitor ranks (1-10) include each heading theme.
2. Table Detection: Recommend standard HTML comparison table structures if tables are useful for the search query.
3. User Questions (PAA): Cluster the initial PAA questions plus any new relevant questions you identify. Group them by intent and suggest a dedicated FAQ section with 3-5 specific questions to include.
4. Content Gaps:
   - Common Headings: Headings present in most competitors (prioritizing high-weight competitors).
   - Unique Headings: Value-add headings that only 1 or 2 competitors have.
   - Missing Topics: Important concepts or terms that competitors missed or covered poorly.
   - Unanswered Questions: User questions that competitors failed to cover.
   - Recommended New Sections: Sections to add to our article to stand out (heading, level, reason, suggestedOutline).`;

  try {
    const response = await generateObjectWithTelemetry('Content Gaps', {
      model,
      prompt,
      temperature: 0.1,
      cacheKey: 'gaps_' + keyword,
      runId: options?.runId,
      schema: z.object({
        headingFrequency: z.array(z.object({
          heading: z.string().describe('Standardized heading theme (e.g. What is CRM Automation?)'),
          competitorRanks: z.array(z.number()).describe('List of competitor ranks (1-based, e.g. [1, 2, 4]) containing this heading theme.'),
        })),
        tableDetection: z.object({
          recommendedTables: z.array(z.object({
            name: z.string().describe('e.g. CRM Pricing Comparison Table'),
            type: z.string().describe('e.g. Comparison, Pricing, Features'),
            columns: z.array(z.string()).describe('List of headers/columns.'),
            purpose: z.string().describe('Why this table is useful.')
          }))
        }),
        paaClustered: z.array(z.object({
          question: z.string().describe('The user query question.'),
          frequency: z.number().describe('How frequently it appears or priority.'),
          snippet: z.string().optional()
        })),
        contentGapReport: z.object({
          commonTopics: z.array(z.string()),
          uniqueHeadings: z.array(z.string()),
          missingTopics: z.array(z.string()),
          recommendedNewSections: z.array(z.object({
            heading: z.string(),
            level: z.enum(['H2', 'H3']),
            reason: z.string(),
            suggestedOutline: z.string()
          })),
          unansweredQuestions: z.array(z.string()),
          shouldIncludeFaq: z.boolean().describe('True ONLY when: 1. PAA questions exist, 2. Competitors include FAQ content, AND 3. Search intent supports FAQ content. Otherwise false.'),
          faqQuestions: z.array(z.string()).describe('If shouldIncludeFaq is true, list 3-5 clustered FAQ questions to recommend. Otherwise empty.')
        })
      })
    });

    // Compute raw count and weighted score programmatically
    let totalWeight = 0;
    competitors.forEach((c, i) => {
      totalWeight += c.weight !== undefined ? c.weight : Math.max(0.1, 1.1 - (i + 1) * 0.1);
    });
    const totalWeightSum = totalWeight || 1.0;

    const freq: HeadingFrequencyItem[] = response.object.headingFrequency.map((h: any) => {
      const count = h.competitorRanks.length;
      // Calculate weighted score sum
      const weightedScore = h.competitorRanks.reduce((sum: number, rank: number) => {
        const comp = competitors[rank - 1];
        const w = comp && comp.weight !== undefined ? comp.weight : Math.max(0.1, 1.1 - rank * 0.1);
        return sum + w;
      }, 0);
      const competitorPercentage = Math.round((weightedScore / totalWeightSum) * 100);

      return {
        heading: h.heading,
        count,
        competitorPercentage,
        weightedScore: parseFloat(weightedScore.toFixed(2))
      };
    });

    // Sort by weightedScore descending, then count descending
    freq.sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0) || b.count - a.count);

    // Compute table detection programmatically using competitor weights
    let tablesCount = 0;
    let weightedTableCount = 0;
    competitors.forEach((c, i) => {
      const rank = i + 1;
      const weight = c.weight !== undefined ? c.weight : Math.max(0.1, 1.1 - rank * 0.1);
      if (c.hasTables) {
        tablesCount++;
        weightedTableCount += weight;
      }
    });

    const tablePct = Math.round((weightedTableCount / totalWeightSum) * 100);
    const tableDetection: TableDetectionResult = {
      tablesFound: tablePct >= 50,
      competitorTableCount: tablesCount,
      competitorPercentage: tablePct,
      recommendedTables: response.object.tableDetection.recommendedTables
    };

    return {
      contentGapReport: response.object.contentGapReport,
      headingFrequency: freq,
      tableDetection,
      paaQuestions: response.object.paaClustered
    };

  } catch (e) {
    console.error('[content_gap_engine] Content gap analysis failed:', e);
    
    // safe fallbacks
    const common = ['What is CRM Automation?', 'Benefits of CRM Automation'];
    const totalWeight = competitors.reduce((sum, c, i) => sum + (c.weight !== undefined ? c.weight : Math.max(0.1, 1.1 - (i + 1) * 0.1)), 0);
    const headingFreq = common.map(h => ({
      heading: h,
      count: competitors.length,
      competitorPercentage: 100,
      weightedScore: totalWeight
    }));
    
    return {
      contentGapReport: {
        commonTopics: common,
        uniqueHeadings: [],
        missingTopics: [],
        recommendedNewSections: [],
        unansweredQuestions: [],
        shouldIncludeFaq: false,
        faqQuestions: []
      },
      headingFrequency: headingFreq,
      tableDetection: {
        tablesFound: false,
        competitorTableCount: 0,
        competitorPercentage: 0,
        recommendedTables: []
      },
      paaQuestions: initialPaa
    };
  }
}
