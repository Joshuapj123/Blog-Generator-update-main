import { google } from '@ai-sdk/google';
import { generateObjectWithTelemetry } from '../gemini-telemetry';
import { z } from 'zod';
import { SerpEntity, EntityRelationship } from '@/types/serp';
import { ScrapedCompetitor } from './serp_collector';

export interface EntityEngineResult {
  entities: SerpEntity[];
  entityRelationships: EntityRelationship[];
  recommendedEntityConnections: string[];
}

export async function processEntities(
  keyword: string,
  competitors: ScrapedCompetitor[],
  options?: { runId?: string }
): Promise<EntityEngineResult> {
  const model = google('gemini-2.5-flash');

  // Sample texts to fit into the context window, noting rank and weight
  const combinedTexts = competitors
    .map((c, idx) => {
      const rank = idx + 1;
      const weight = (c.weight !== undefined ? c.weight : Math.max(0.1, 1.1 - rank * 0.1)).toFixed(2);
      return `[Competitor ${rank}] (Weight: ${weight}):\n${c.text.slice(0, 1500)}`;
    })
    .join('\n\n');

  const prompt = `You are a search intelligence entity and semantic relationship extractor. Analyze the text samples from top-ranking competitor articles.
Extract the most prominent entities and define their connections (Entity Graph) to satisfy topical authority.

Extract entities under these types:
1. brand: Named business identities (e.g. HubSpot, Salesforce, Zoho)
2. product: Named items or services sold (e.g. Sales Hub, Zoho Projects)
3. software: Named SaaS, apps, tools or systems (e.g. CRM, Zapier, Make)
4. organization: Groups, standards bodies or committees (e.g. W3C, Google Central)
5. tool: Software tools, utilities, extensions or apps (e.g. Ahrefs, SEMrush)
6. concept: Core industry methodologies, concepts, frameworks or standards (e.g. lead scoring, sales pipeline)

Your tasks:
1. Extract 20-30 prominent entities occurring across competitor samples.
2. Establish strong semantic relationships/edges between the extracted entities (e.g. "CRM -> Lead Management" with relationship type "enables").
3. Generate recommended entity connections that our article should explicitly discuss to display deep topical authority.

COMPETITOR SAMPLES:
${combinedTexts}`;

  let extracted: { name: string; type: string }[] = [];
  let relationships: EntityRelationship[] = [];
  let recommendedConnections: string[] = [];

  try {
    const response = await generateObjectWithTelemetry('Entity Analysis', {
      model,
      prompt,
      temperature: 0.1,
      cacheKey: 'entities_' + keyword,
      runId: options?.runId,
      schema: z.object({
        entities: z.array(z.object({
          name: z.string().describe('The name of the entity.'),
          type: z.enum(['brand', 'product', 'software', 'organization', 'tool', 'concept']).describe('The entity type.')
        })),
        relationships: z.array(z.object({
          source: z.string().describe('The source entity name.'),
          target: z.string().describe('The target entity name.'),
          type: z.string().describe('Connection type (e.g. integrates with, automates, supports, targets).')
        })),
        recommendedConnections: z.array(z.string()).describe('List of recommended connections to weave in (e.g. "CRM -> Sales Pipeline").')
      })
    });
    extracted = response.object.entities || [];
    relationships = response.object.relationships || [];
    recommendedConnections = response.object.recommendedConnections || [];
  } catch (e) {
    console.error('[entity_engine] Gemini entity extraction failed:', e);
    // Fallback
    extracted = [
      { name: 'CRM', type: 'software' },
      { name: 'HubSpot', type: 'brand' },
      { name: 'Salesforce', type: 'brand' },
      { name: 'Zapier', type: 'tool' },
      { name: 'ActiveCampaign', type: 'brand' },
      { name: 'Zoho CRM', type: 'software' },
      { name: 'Lead Management', type: 'concept' },
      { name: 'Workflow Automation', type: 'concept' }
    ];
    relationships = [
      { source: 'CRM', target: 'Lead Management', type: 'automates' },
      { source: 'CRM', target: 'Workflow Automation', type: 'enables' }
    ];
    recommendedConnections = [
      'CRM -> Lead Management',
      'CRM -> Workflow Automation'
    ];
  }

  // Calculate competitor coverage using position authority weighting
  const entities: SerpEntity[] = [];
  const competitorCount = competitors.length || 1;

  for (const item of extracted) {
    const entityName = item.name.trim();
    if (!entityName) continue;

    let matchedDocs = 0;
    let weightedMatchedDocs = 0;
    let totalWeight = 0;
    const competitorExamples: string[] = [];

    const escapedName = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sentenceRegex = new RegExp(`([^.?!]*?\\b${escapedName}\\b[^.?!]*[.?!])`, 'gi');

    let totalProminenceWeight = 0;

    competitors.forEach((comp, idx) => {
      const rank = idx + 1;
      const weight = comp.weight !== undefined ? comp.weight : Math.max(0.1, 1.1 - rank * 0.1);
      totalWeight += weight;

      const isPresent = comp.text.toLowerCase().includes(entityName.toLowerCase()) ||
                        comp.title.toLowerCase().includes(entityName.toLowerCase());
      if (isPresent) {
        matchedDocs++;
        weightedMatchedDocs += weight;

        // Calculate prominence: heading = 3, early text = 2, body = 1
        let prominence = 1;
        const inHeadings = comp.headings.some(h => h.text.toLowerCase().includes(entityName.toLowerCase()));
        if (inHeadings) {
          prominence = 3;
        } else if (comp.text.toLowerCase().indexOf(entityName.toLowerCase()) < 1500) {
          prominence = 2;
        }
        totalProminenceWeight += prominence * weight;
        
        // Grab a nice context sentence from this competitor
        if (competitorExamples.length < 3) {
          const sentences = comp.text.match(sentenceRegex);
          if (sentences && sentences.length > 0) {
            const clean = sentences[0].trim().replace(/\s+/g, ' ').slice(0, 200);
            competitorExamples.push(`[Competitor ${rank}] "${clean}"`);
          }
        }
      }
    });

    const totalWeightSum = totalWeight || 1.0;
    const frequencyScore = (matchedDocs / competitorCount) * 100;
    const authorityScore = (weightedMatchedDocs / totalWeightSum) * 100;
    const prominenceScore = (totalProminenceWeight / (totalWeightSum * 3)) * 100;
    const importanceScore = Math.round(0.4 * frequencyScore + 0.4 * authorityScore + 0.2 * prominenceScore);

    entities.push({
      entityName,
      entityType: item.type,
      relatedTerms: [],
      missingContext: `Ensure that the entity ${entityName} (${item.type}) is covered to match top competitors.`,
      competitorExamples,
      competitorCoverage: weightedMatchedDocs / totalWeightSum, // Use weighted coverage here
      importanceScore: Math.min(100, Math.max(0, importanceScore))
    });
  }

  // Sort entities by competitor coverage in descending order
  entities.sort((a, b) => (b.competitorCoverage ?? 0) - (a.competitorCoverage ?? 0));

  return {
    entities,
    entityRelationships: relationships,
    recommendedEntityConnections: recommendedConnections
  };
}
