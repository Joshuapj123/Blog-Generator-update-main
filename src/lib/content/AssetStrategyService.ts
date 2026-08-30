import { AssetStrategy, AssetStrategySchema } from '@/core/contracts/schemas';
import { z } from 'zod';

export class AssetStrategyService {
  static determineStrategy(
    saasProfile: any,
    opportunity: any,
    geoIntelligence?: any
  ): z.infer<typeof AssetStrategySchema> {
    const keyword = opportunity.keyword;
    const intent = opportunity.intent || 'Informational';
    const contentTypeRec = opportunity.contentType || 'Guide';
    const recAssetRec = opportunity.recommendedAssetType || '';

    // 1. Determine Asset Type deterministically
    let assetType: 'ARTICLE' | 'COMPARISON' | 'ALTERNATIVE' | 'USE_CASE_LANDING_PAGE' | 'GUIDE' | 'FAQ' = 'ARTICLE';

    const kLower = keyword.toLowerCase();
    if (kLower.includes('alternative') || kLower.includes('similar') || recAssetRec.toLowerCase().includes('alternative')) {
      assetType = 'ALTERNATIVE';
    } else if (kLower.includes(' vs ') || kLower.includes('compare') || intent === 'Comparison') {
      assetType = 'COMPARISON';
    } else if (kLower.includes('for students') || kLower.includes('for developers') || kLower.includes('for designers') || recAssetRec.toLowerCase().includes('use-case')) {
      assetType = 'USE_CASE_LANDING_PAGE';
    } else if (kLower.startsWith('how to') || kLower.includes('tutorial') || recAssetRec.toLowerCase().includes('guide')) {
      assetType = 'GUIDE';
    } else if (kLower.includes('faq') || kLower.includes('question') || kLower.startsWith('what is') || kLower.startsWith('why does')) {
      assetType = 'FAQ';
    } else {
      if (contentTypeRec === 'Comparison') {
        assetType = 'COMPARISON';
      } else if (contentTypeRec === 'Listicle') {
        assetType = 'ARTICLE';
      } else if (contentTypeRec === 'How-To') {
        assetType = 'GUIDE';
      }
    }

    // 2. Recommend structure based on assetType
    let recommendedStructure: string[] = [];
    let primaryGoal = '';
    if (assetType === 'COMPARISON') {
      recommendedStructure = ['Introduction', 'Comparison Criteria', 'Feature Comparison Matrix', 'SaaS Differentiators', 'Pricing & Value Analysis', 'Final Verdict'];
      primaryGoal = 'Compare competing solutions objectively while demonstrating our product value.';
    } else if (assetType === 'ALTERNATIVE') {
      recommendedStructure = ['Introduction', 'Why Look for Alternatives', 'Top Alternatives Overview', 'Deep Dive Comparison', 'When to Switch'];
      primaryGoal = 'Provide alternatives to industry tools while showing why our SaaS is the superior modern solution.';
    } else if (assetType === 'USE_CASE_LANDING_PAGE') {
      recommendedStructure = ['Problem / Pain Point', 'Target Audience Challenge', 'Our Solution Workflow', 'Key Features & Benefits', 'Social Proof / Case Study', 'Actionable CTA'];
      primaryGoal = 'Address specific target persona challenges and show how our product solves them.';
    } else if (assetType === 'GUIDE') {
      recommendedStructure = ['Introduction', 'Core Concept Definition', 'Step-by-Step Instructions', 'Examples & Walkthrough', 'Common Mistakes', 'Summary & Checklist'];
      primaryGoal = 'Educate the audience with structured, actionable steps.';
    } else if (assetType === 'FAQ') {
      recommendedStructure = ['Introduction', 'Frequently Asked Questions', 'Direct Q&A Table', 'Supporting Details', 'CTA'];
      primaryGoal = 'Provide immediate answers to highly specific long-tail entity queries.';
    } else {
      recommendedStructure = ['Introduction', 'Key Concepts', 'Analysis & Insights', 'Actionable Recommendations', 'Conclusion'];
      primaryGoal = 'Establish topical authority and answer search intent exhaustively.';
    }

    const requiredEntities = opportunity.rankingDomains || [];
    const requiredTopics = opportunity.searchFeatures || [];
    const differentiationRequirements = opportunity.contentGap ? [opportunity.contentGap] : [];
    const geoRequirements = geoIntelligence?.geoOpportunities
      ? geoIntelligence.geoOpportunities.map((o: any) => o.recommendedAction)
      : [];

    return AssetStrategySchema.parse({
      assetType,
      targetKeyword: keyword,
      searchIntent: intent,
      recommendedStructure,
      targetAudience: saasProfile?.targetAudience || 'SaaS Target Users',
      primaryGoal,
      requiredEntities,
      requiredTopics,
      competitorReferences: requiredEntities.slice(0, 3),
      differentiationRequirements,
      geoRequirements,
      estimatedWordCount: assetType === 'FAQ' ? 600 : 1200,
      priority: opportunity.priority || 'Medium',
      reasoning: opportunity.explanation || 'Determined by target opportunity landscape.'
    });
  }
}
