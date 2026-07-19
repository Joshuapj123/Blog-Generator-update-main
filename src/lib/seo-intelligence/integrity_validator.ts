import { stem, STOP_WORDS } from '../serp-nlp-processing';
import { SerpEntity, TopicClusterItem, HeadingFrequencyItem } from '@/types/serp';

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  seo: ['seo', 'search engine', 'backlink', 'keyword research', 'search ranking', 'link building', 'domain authority', 'page rank', 'google console', 'ahrefs', 'semrush', 'ranking factor'],
  crypto: ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'solana', 'wallet', 'token', 'cryptocurrency', 'defi', 'nft'],
  fitness: ['fitness', 'workout', 'gym', 'exercise', 'diet', 'nutrition', 'cardio', 'weight loss', 'bodybuilding', 'muscle'],
  travel: ['travel', 'flight', 'hotel', 'tourism', 'itinerary', 'destination', 'vacation', 'trip', 'booking', 'passport'],
  real_estate: ['real estate', 'property', 'mortgage', 'buy house', 'home loan', 'realtor', 'tenant', 'landlord', 'renting']
};

/** Helper to tokenize and clean text */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/** Jaccard similarity of stemmed words excluding stop words */
export function computeJaccardSimilarity(textA: string, textB: string): number {
  const stemsA = tokenize(textA).filter(w => !STOP_WORDS.has(w)).map(stem);
  const stemsB = tokenize(textB).filter(w => !STOP_WORDS.has(w)).map(stem);
  if (stemsA.length === 0 && stemsB.length === 0) return 1.0;
  if (stemsA.length === 0 || stemsB.length === 0) return 0.0;
  const setA = new Set(stemsA);
  const setB = new Set(stemsB);
  let intersection = 0;
  setA.forEach(t => { if (setB.has(t)) intersection++; });
  const union = new Set([...stemsA, ...stemsB]).size;
  return parseFloat((intersection / union).toFixed(4));
}

/** Check phrase stem overlap coefficient */
export function checkPhraseStemOverlap(phraseA: string, phraseB: string, threshold = 0.5): boolean {
  const stemsA = tokenize(phraseA).map(stem);
  const stemsB = tokenize(phraseB).map(stem);
  if (stemsA.length === 0 || stemsB.length === 0) return false;
  const setA = new Set(stemsA);
  const setB = new Set(stemsB);
  let overlap = 0;
  setA.forEach(t => { if (setB.has(t)) overlap++; });
  return overlap / Math.min(setA.size, setB.size) >= threshold;
}

/** Calculate Jaccard-based dynamic domain drift distance */
export function calculateDomainDriftScore(
  headings: string[],
  concepts: string[],
  requestedKeyword: string,
  requestedTitle: string
): { score: number; contaminatedDomains: string[] } {
  const reqKwLower = requestedKeyword.toLowerCase();
  const reqTitleLower = requestedTitle.toLowerCase();

  // 1. Identify authorized domains (mentioned in keyword/title)
  const authorizedDomains = new Set<string>();
  Object.entries(DOMAIN_KEYWORDS).forEach(([domain, keywords]) => {
    const isMentioned = keywords.some(k => reqKwLower.includes(k) || reqTitleLower.includes(k));
    if (isMentioned) {
      authorizedDomains.add(domain);
    }
  });

  let driftOccurrences = 0;
  const contaminated = new Set<string>();

  // 2. Scan headings and concepts for unauthorized domain terms
  headings.forEach((heading) => {
    const hLower = heading.toLowerCase();
    Object.entries(DOMAIN_KEYWORDS).forEach(([domain, keywords]) => {
      if (authorizedDomains.has(domain)) return;
      const matches = keywords.filter(k => hLower.includes(k));
      if (matches.length > 0) {
        driftOccurrences += matches.length;
        contaminated.add(domain);
      }
    });
  });

  concepts.forEach((concept) => {
    const cLower = concept.toLowerCase();
    Object.entries(DOMAIN_KEYWORDS).forEach(([domain, keywords]) => {
      if (authorizedDomains.has(domain)) return;
      const matches = keywords.filter(k => cLower.includes(k));
      if (matches.length > 0) {
        driftOccurrences += matches.length;
        contaminated.add(domain);
      }
    });
  });

  // Calculate semantic Jaccard distance between request topic and outline
  const requestedStems = tokenize(requestedKeyword + " " + requestedTitle)
    .filter(w => !STOP_WORDS.has(w))
    .map(stem);
  const outlineStems = tokenize(headings.join(" ") + " " + concepts.join(" "))
    .filter(w => !STOP_WORDS.has(w))
    .map(stem);

  let intersection = 0;
  const setReq = new Set(requestedStems);
  const setOut = new Set(outlineStems);
  setReq.forEach(t => { if (setOut.has(t)) intersection++; });
  const union = new Set([...requestedStems, ...outlineStems]).size;
  const jaccardSimilarity = union > 0 ? intersection / union : 0;
  const semanticDomainDistance = 1.0 - jaccardSimilarity;

  // Blended drift score: 50% hardcoded contamination + 50% semantic distance
  const hardcodedDrift = driftOccurrences > 0 ? 0.3 : 0.0;
  const finalScore = 0.5 * hardcodedDrift + 0.5 * semanticDomainDistance;

  return {
    score: parseFloat(finalScore.toFixed(4)),
    contaminatedDomains: Array.from(contaminated)
  };
}

/** Calculate topic integrity score based on relevance rates and domain drift */
export function calculateTopicIntegrityScore(
  headings: string[],
  concepts: string[],
  keyword: string,
  title: string,
  domainDriftScore: number
): number {
  let relatedCount = 0;
  const total = headings.length;
  if (total === 0) return 1.0;

  headings.forEach((heading, idx) => {
    const hLower = heading.toLowerCase();
    const cLower = (concepts[idx] || '').toLowerCase();

    const isStructural = ['faq', 'frequently asked', 'q&a', 'introduction', 'conclusion', 'cta', 'summary', 'about'].some(t => hLower.includes(t));
    if (isStructural) {
      relatedCount++;
      return;
    }

    const hasOverlap = checkPhraseStemOverlap(hLower, keyword, 0.15) || 
                       checkPhraseStemOverlap(cLower, keyword, 0.15) ||
                       checkPhraseStemOverlap(hLower, title, 0.15) ||
                       checkPhraseStemOverlap(cLower, title, 0.15);
    if (hasOverlap) {
      relatedCount++;
    }
  });

  const baseScore = relatedCount / total;
  return parseFloat(Math.max(0, baseScore - domainDriftScore).toFixed(4));
}

/** Calculate section-level topic similarity score */
export function computeSectionTopicSimilarity(
  sectionText: string,
  heading: string,
  coreConcept: string,
  overallKeyword: string
): number {
  const textStems = new Set(tokenize(sectionText.toLowerCase()).map(stem));
  const topicStems = tokenize((heading + " " + coreConcept + " " + overallKeyword).toLowerCase())
    .filter(w => !STOP_WORDS.has(w))
    .map(stem);

  if (topicStems.length === 0) return 1.0;

  let matches = 0;
  topicStems.forEach(s => { if (textStems.has(s)) matches++; });
  return parseFloat((matches / topicStems.length).toFixed(4));
}

/** Calculate weighted SERP alignment score based on competitor weights */
export function calculateSerpAlignmentScore(params: {
  headings: string[];
  sectionsText: string;
  entities: SerpEntity[];
  topicClusters: TopicClusterItem[];
  headingFrequency: HeadingFrequencyItem[];
}): number {
  const allTextLower = (params.headings.join(' ') + ' ' + params.sectionsText).toLowerCase();
  const textStems = new Set(tokenize(allTextLower).map(stem));

  // 1. Weighted Entity Coverage (40% weight)
  const targetEntities = params.entities.filter(e => {
    const coverage = e.competitorCoverage ?? 0;
    const importance = e.importanceScore ?? Math.round(coverage * 100);
    return importance >= 40;
  });

  let coveredEntityWeight = 0;
  let totalEntityWeight = 0;

  targetEntities.forEach(e => {
    const nameLower = (e.entityName || (e as any).name || '').toLowerCase();
    const weight = e.competitorCoverage || 0.1;
    totalEntityWeight += weight;

    if (allTextLower.includes(nameLower) || checkPhraseStemOverlap(allTextLower, nameLower, 0.75)) {
      coveredEntityWeight += weight;
    }
  });
  const entityCoverage = totalEntityWeight > 0 ? coveredEntityWeight / totalEntityWeight : 1.0;

  // 2. Topic Cluster Coverage (40% weight)
  let coveredClusters = 0;
  params.topicClusters.forEach(tc => {
    const nameLower = tc.clusterName.toLowerCase();
    const keywords = (tc.keywords || []).map(k => k.toLowerCase());
    const isCovered = params.headings.some(h => {
      const hLower = h.toLowerCase();
      return hLower.includes(nameLower) || keywords.some(k => hLower.includes(k)) || 
             checkPhraseStemOverlap(hLower, tc.clusterName, 0.4);
    });
    if (isCovered) {
      coveredClusters++;
    }
  });
  const clusterCoverage = params.topicClusters.length > 0 ? coveredClusters / params.topicClusters.length : 1.0;

  // 3. Weighted Heading Frequency Coverage (20% weight)
  let coveredHeadingWeight = 0;
  let totalHeadingWeight = 0;

  params.headingFrequency.forEach(h => {
    const weight = h.weightedScore || h.count || 1;
    totalHeadingWeight += weight;
    const hLower = h.heading.toLowerCase();
    const isCovered = params.headings.some(ah => {
      const ahLower = ah.toLowerCase();
      return ahLower.includes(hLower) || hLower.includes(ahLower) || checkPhraseStemOverlap(ahLower, h.heading, 0.5);
    });
    if (isCovered) {
      coveredHeadingWeight += weight;
    }
  });
  const headingCoverage = totalHeadingWeight > 0 ? coveredHeadingWeight / totalHeadingWeight : 1.0;

  const score = 0.40 * entityCoverage + 0.40 * clusterCoverage + 0.20 * headingCoverage;
  return parseFloat((score * 100).toFixed(2));
}

/** Calculate overall integrity score */
export function computeOverallIntegrityScore(
  topicScore: number,
  titleScore: number,
  keywordScore: number
): number {
  const overall = 0.40 * (topicScore * 100) + 0.30 * (titleScore * 100) + 0.30 * (keywordScore * 100);
  return parseFloat(overall.toFixed(2));
}

/** Calculate keyword integrity/match score */
export function computeKeywordIntegrityScore(title: string, keyword: string): number {
  const titleLower = title.toLowerCase();
  const kwLower = keyword.toLowerCase().trim();
  if (titleLower.includes(kwLower)) return 1.0;

  // Check stem overlap
  const kwStems = tokenize(kwLower).filter(w => !STOP_WORDS.has(w)).map(stem);
  if (kwStems.length === 0) return 1.0;
  const titleStems = new Set(tokenize(titleLower).map(stem));
  let matches = 0;
  kwStems.forEach(s => { if (titleStems.has(s)) matches++; });
  return parseFloat((matches / kwStems.length).toFixed(4));
}
