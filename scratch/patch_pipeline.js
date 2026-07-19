const fs = require('fs');
const filePath = 'src/app/api/generate-blocks/route.ts';

let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for clean regex/string operations
content = content.replace(/\r\n/g, '\n');

// --- 1. INSERT HELPER FUNCTIONS BEFORE Line 1766 ---
const helperFunctions = `          const getChildH3s = (h2Outline: any, flatSections: any[]) => {
            const idx = flatSections.indexOf(h2Outline);
            if (idx === -1) return [];
            const children = [];
            for (let i = idx + 1; i < flatSections.length; i++) {
              if (flatSections[i].level === 'H2') break;
              if (flatSections[i].level === 'H3') {
                children.push(flatSections[i]);
              }
            }
            return children;
          };

          const getParentH2 = (h3Outline: any, flatSections: any[]) => {
            const idx = flatSections.indexOf(h3Outline);
            if (idx === -1) return null;
            for (let i = idx - 1; i >= 0; i--) {
              if (flatSections[i].level === 'H2') {
                return flatSections[i];
              }
            }
            return null;
          };

          const allocateRequirementsToSections = (
            sectionOutlines: any[],
            entities: string[],
            gapTopics: string[],
            faqQuestions: string[]
          ) => {
            const h2Sections = sectionOutlines.filter(s => s.level === 'H2');
            if (h2Sections.length === 0) return;

            h2Sections.forEach(h2 => {
              h2.assignedEntities = [];
              h2.assignedGaps = [];
              h2.assignedFaqs = [];
            });

            // Helper to find the best H2 section for a term
            const findBestH2 = (term: string) => {
              const termLower = term.toLowerCase().trim();
              let bestH2 = h2Sections[0];
              let maxScore = -1;

              h2Sections.forEach(h2 => {
                let score = 0;
                if (h2.heading.toLowerCase().includes(termLower)) score += 10;
                if (h2.core_concept.toLowerCase().includes(termLower)) score += 5;

                const childH3s = getChildH3s(h2, sectionOutlines);
                childH3s.forEach(h3 => {
                  if (h3.heading.toLowerCase().includes(termLower)) score += 8;
                  if (h3.core_concept.toLowerCase().includes(termLower)) score += 4;
                });

                if (score > maxScore) {
                  maxScore = score;
                  bestH2 = h2;
                }
              });

              return bestH2;
            };

            entities.forEach(entity => {
              const bestH2 = findBestH2(entity);
              bestH2.assignedEntities.push(entity);
            });

            gapTopics.forEach(gap => {
              const bestH2 = findBestH2(gap);
              bestH2.assignedGaps.push(gap);
            });

            faqQuestions.forEach(faq => {
              const bestH2 = findBestH2(faq);
              bestH2.assignedFaqs.push(faq);
            });
          };

          const generateDynamicFallbackTable = (heading: string, brands: string[] = [], entities: string[] = []) => {
            const items = brands.length > 0
              ? brands.map(b => b.split(':')[0].trim())
              : ['Option A', 'Option B', 'Option C'];

            const columns = ['Feature/Metric', ...items];
            const row1 = ['Key Advantage', ...items.map((_, idx) => \`Advantage \${idx + 1}\`)];
            const row2 = ['Target Audience', ...items.map((_, idx) => \`Use Case \${idx + 1}\`)];
            const row3 = ['Pricing Model', ...items.map((_, idx) => \`Contact Sales\`)];

            let markdown = \`| \${columns.join(' | ')} |\\n| \${columns.map(() => '---').join(' | ')} |\\n\`;
            markdown += \`| \${row1.join(' | ')} |\\n\`;
            markdown += \`| \${row2.join(' | ')} |\\n\`;
            markdown += \`| \${row3.join(' | ')} |\\n\`;

            return markdown;
          };

          const checkBlueprintCompleteness = (section: any, blueprint: any) => {
            const errors: string[] = [];
            const text = [section.heading, section.what_it_is, section.why_it_works, section.experience_or_data_point].filter(Boolean).join(' ').toLowerCase();

            // 1. Entities
            if (blueprint.required_entities && blueprint.required_entities.length > 0) {
              blueprint.required_entities.forEach((ent: string) => {
                const entLower = ent.toLowerCase().trim();
                const hasEnt = text.includes(entLower) || checkPhraseStemOverlap(text, entLower, 0.85);
                if (!hasEnt) {
                  errors.push(\`Blueprint incomplete: Missing required entity "\${ent}".\`);
                }
              });
            }

            // 2. Gaps
            if (blueprint.required_gap_topics && blueprint.required_gap_topics.length > 0) {
              blueprint.required_gap_topics.forEach((gap: string) => {
                const gapLower = gap.toLowerCase().trim();
                const hasGap = text.includes(gapLower) || checkPhraseStemOverlap(text, gapLower, 0.45);
                if (!hasGap) {
                  errors.push(\`Blueprint incomplete: Missing required competitor gap topic "\${gap}".\`);
                }
              });
            }

            // 3. FAQs
            if (blueprint.required_faq_coverage && blueprint.required_faq_coverage.length > 0) {
              blueprint.required_faq_coverage.forEach((faq: string) => {
                const faqLower = faq.toLowerCase().trim();
                const hasFaq = text.includes(faqLower) || checkPhraseStemOverlap(text, faqLower, 0.45);
                if (!hasFaq) {
                  errors.push(\`Blueprint incomplete: Missing required FAQ/PAA coverage "\${faq}".\`);
                }
              });
            }

            // 4. Practical Example
            const hasExample = text.includes('example') || text.includes('use case') || text.includes('case study') || (section.example_brands && section.example_brands.length > 0);
            if (!hasExample) {
              errors.push(\`Blueprint incomplete: Missing practical example or use case.\`);
            }

            // 5. Expert Insight
            const hasInsight = text.includes('insight') || text.includes('evidence') || text.includes('data') || /\\b\\d+%\\b|\\b\\d{4}\\b/.test(text) || (section.experience_or_data_point && section.experience_or_data_point.length > 15);
            if (!hasInsight) {
              errors.push(\`Blueprint incomplete: Missing expert insight or supporting evidence.\`);
            }

            // 6. Transition
            const hasTransition = section.takeaway && section.takeaway.length > 10;
            if (!hasTransition) {
              errors.push(\`Blueprint incomplete: Missing transition sentence.\`);
            }

            // 7. Required element
            if (blueprint.required_element === 'table') {
              const tableStr = (section.markdown_table || '').trim();
              if (!tableStr.includes('|')) {
                errors.push(\`Blueprint incomplete: Missing required comparison table.\`);
              }
            } else if (blueprint.required_element === 'list') {
              const hasList = text.includes('\\n- ') || text.includes('\\n* ') || text.includes('\\n1. ');
              if (!hasList) {
                errors.push(\`Blueprint incomplete: Missing required bulleted/numbered list.\`);
              }
            } else if (blueprint.required_element === 'code_example') {
              const hasCode = text.includes('\`\`\`');
              if (!hasCode) {
                errors.push(\`Blueprint incomplete: Missing required code example.\`);
              }
            }

            return errors;
          };
`;

const landmark1 = `          // Helper to check and validate generated sections`;
if (content.includes(landmark1)) {
  content = content.replace(landmark1, helperFunctions + '\n' + landmark1);
  console.log('1. Helper functions injected successfully.');
} else {
  console.error('Failed to locate Helper functions insertion point!');
  process.exit(1);
}

// --- 2. INTEGRATE checkBlueprintCompleteness IN validateGeneratedSections ---
const targetValidationErrors = `              if (errors.length > 0) {
                sectionErrors[i] = errors;
              }`;

const replacementValidationErrors = `              // Blueprint completeness check
              if (secOutline.level === 'H2' && secOutline.blueprint) {
                const bpErrors = checkBlueprintCompleteness(section, secOutline.blueprint);
                errors.push(...bpErrors);
              }

              if (errors.length > 0) {
                sectionErrors[i] = errors;
              }`;

if (content.includes(targetValidationErrors)) {
  content = content.replace(targetValidationErrors, replacementValidationErrors);
  console.log('2. Blueprint completeness check integrated in validateGeneratedSections successfully.');
} else {
  console.error('Failed to locate targetValidationErrors in validateGeneratedSections!');
  process.exit(1);
}

// --- 3. STAGE 2: ALLOCATE REQUIREMENTS & CONCURRENT BLUEPRINT GENERATION ---
const stage2Landmark = `          // Map sorted outlines to sectionTasks`;

const blueprintGenerationCode = `          // --- Redesign the generation pipeline around H2 section blueprints ---
          const AVAILABLE_PATTERNS = [
            'workflow',
            'comparison',
            'case_study',
            'best_practices',
            'tutorial',
            'checklist',
            'decision_framework',
            'common_mistakes',
            'implementation_guide'
          ];

          // 1. Programmatically allocate all required entities, content gaps, and FAQs to H2 sections
          const allRequiredEntities = [...tier1Concepts, ...tier2Brands];
          const allGapTopics = [
            ...(contentGapReport?.missingTopics || []),
            ...(contentGapReport?.unansweredQuestions || []).map((q: string) => q.replace(/[?]/g, ''))
          ];
          const allFaqs = shouldIncludeFaq ? faqQuestions : [];

          allocateRequirementsToSections(outline.section_outlines, allRequiredEntities, allGapTopics, allFaqs);

          // 2. Generate structured H2 section blueprints in parallel before writing
          sendChunk({ type: 'status', message: 'Generating structured H2 section blueprints...', progress: 35 });
          
          let h2Count = 0;
          const h2BlueprintPromises = outline.section_outlines.map(async (secOutline: any, idx: number) => {
            if (secOutline.level !== 'H2') return null;

            const currentH2Index = h2Count++;
            const pattern = AVAILABLE_PATTERNS[currentH2Index % AVAILABLE_PATTERNS.length];
            const childH3s = getChildH3s(secOutline, outline.section_outlines);

            const h2MinBudget = 350; // Enforce minimum section depth
            const h2MaxBudget = Math.max(500, Math.round((serpMedianWordCount || 2000) / outline.section_outlines.filter((s: any) => s.level === 'H2').length));

            const blueprintPrompt = \`You are a professional SEO content strategist.
Design a detailed, high-depth H2 section blueprint for section: "\${secOutline.heading}".
Core Concept: "\${secOutline.core_concept}".
Child H3 sub-headings: \${childH3s.map(c => c.heading).join(', ') || 'None'}.

PRE-ASSIGNED REQUIREMENTS FOR THIS H2 SECTION:
- Required Entities (Must be naturally woven into the content): \${secOutline.assignedEntities?.join(', ') || 'None'}
- Required Competitor Gaps (Must be covered): \${secOutline.assignedGaps?.join(', ') || 'None'}
- Required FAQs/PAAs (Must be covered): \${secOutline.assignedFaqs?.join(', ') || 'None'}

DIVERSIFICATION AND ROTATION DIRECTIVE:
The pre-assigned structural pattern for this section is: "\${pattern}". Format this section using the "\${pattern.replace('_', ' ')}" pattern.
Determine the minimum and target word counts (at least \${h2MinBudget} words, up to \${h2MaxBudget} words) appropriate for this section.
Also determine if a comparison table, list, or code example is required. Provide the details for the practical example, expert insight, and transition sentence.\`;

            try {
              const bpResult = await generateObjectWithTelemetry('Section Blueprint Generation', {
                model,
                schema: z.object({
                  min_word_count: z.number().int(),
                  target_word_count: z.number().int(),
                  practical_example_or_use_case: z.string(),
                  expert_insight_or_evidence: z.string(),
                  transition_sentence: z.string(),
                  required_element: z.enum(['table', 'list', 'code_example', 'none']),
                }),
                prompt: blueprintPrompt,
                runId
              });

              secOutline.blueprint = {
                ...bpResult.object,
                required_entities: secOutline.assignedEntities || [],
                required_gap_topics: secOutline.assignedGaps || [],
                required_faq_coverage: secOutline.assignedFaqs || [],
                structure_pattern: pattern,
              };

              console.log(\`[Blueprint Generation] Generated blueprint for H2: "\${secOutline.heading}" with pattern "\${pattern}"\`);
            } catch (err) {
              console.error(\`[Blueprint Generation Error] Failed for H2: "\${secOutline.heading}", using fallback blueprint.\`, err);
              // Fallback blueprint
              secOutline.blueprint = {
                min_word_count: h2MinBudget,
                target_word_count: h2MaxBudget,
                required_entities: secOutline.assignedEntities || [],
                required_gap_topics: secOutline.assignedGaps || [],
                required_faq_coverage: secOutline.assignedFaqs || [],
                practical_example_or_use_case: \`Use case for \${secOutline.heading}\`,
                expert_insight_or_evidence: \`Factual evidence for \${secOutline.heading}\`,
                transition_sentence: \`Moving to the next section.\`,
                structure_pattern: pattern,
                required_element: 'none',
              };
            }
          });

          await Promise.all(h2BlueprintPromises);

`;

if (content.includes(stage2Landmark)) {
  content = content.replace(stage2Landmark, blueprintGenerationCode + '\n' + stage2Landmark);
  console.log('3. Blueprint generation injected successfully.');
} else {
  console.error('Failed to locate Blueprint generation insertion point!');
  process.exit(1);
}

// --- 4. REDESIGN SECTION CONTENT GENERATION PROMPT AND TASK PARAMETERS ---
const targetSectionTaskBlockStart = `              const targetEntities = (secOutline as any).target_entities || [];
              const secEntityContext = targetEntities.length > 0
                ? \`\\nREQUIRED_ENTITIES (MANDATORY):
You MUST explicitly, naturally, and contextually weave the following entities into this section's body text: \${targetEntities.join(', ')}.
This is a strict validation constraint. Ensure each of these concepts or brands appears exactly as written in this section.\`
                : '';

              const sectionTargetWords = secOutline.target_word_budget || (secOutline.level === 'H3' ? 80 : Math.round(targetLength / totalSections));
              const sectionMinWords = Math.round(sectionTargetWords * 0.8);
              const maxSectionWords = Math.round(sectionTargetWords * 1.10);
              const targetPromptWords = Math.round(sectionTargetWords * 0.90);

              const wordCountContext = \`\\nSECTION WORD COUNT TARGET:
This section MUST contain at least \${sectionMinWords} words. Write detailed, fully developed paragraphs to meet this minimum length requirement. Expand the concepts fully, provide detailed examples, frameworks, and deep explanations to achieve this depth.
Do NOT limit paragraph lengths to 3 sentences; write fully developed paragraphs to cover all required subtopics and details.
CRITICAL CONSTRAINT: Target around \${targetPromptWords} words. Do NOT exceed the target budget of \${sectionTargetWords} words under any circumstance. Exceeding this budget will trigger keyword stuffing and over-optimization penalties. Be concise, dense, and stay focused on the core concept without fluff.\`;

              const generateTable = (secOutline as any).generate_table || false;
              const tablePromptContext = generateTable
                ? \`\\nTABLE GENERATION DIRECTIVE (CRITICAL):
This section has been selected for table generation. You MUST generate a markdown comparison/pricing/feature table in the 'markdown_table' field of the schema.
\${recommendedTables && recommendedTables.length > 0
  ? \`The recommended table structure is:\\n\${JSON.stringify(recommendedTables[0], null, 2)}\`
  : \`Create a comparison table comparing the top 3 options or alternatives. Use columns: Platform/Tool, Key Features, Pros, Cons, and Pricing.\`}
Always use standard markdown table syntax (e.g., | Tool Name | Features | Pricing |) and populate it with realistic, non-placeholder data.\`
                : \`\\nTABLE GENERATION DIRECTIVE:
Do NOT generate a markdown table for this section. Leave the 'markdown_table' field empty.\`;

              const sectionResult = await generateObjectWithTelemetry('Section Content Generation', {
                model,
                schema: SectionSchema,
                prompt: \`\${authorContext}

You are writing section "\${secOutline.heading}" (\${secOutline.level}) for the article: "\${title}".
Core concept: "\${secOutline.core_concept}".
\${keywordContext}
\${lsiContextSection}
\${secEntityContext}
\${wordCountContext}
\${tablePromptContext}
\${guestPostContext}
\${internalLinksContext}
\${externalLinksContext}
\${customInsightsContext}
\${competitorContext}
\${planRoleContext}
\${intentConfidenceContext}
\${entityRelationshipContext}
\${featuredSnippetContext}
\${gapTopicsContext}
\${contentStructureMode === 'mirror' && referenceContext ? \`
STRUCTURE MODE: MIRROR — This section corresponds to a heading in the reference article.
Your content approach, depth and coverage must EXCEED the reference article's ambition — not just match it.
Identify anything the reference page covers shallowly and go deeper. ALL wording must be entirely original.
\` : ''}
STRICT HOUSE STYLE — follow every rule:
CRITICAL RULE: You are writing the ACTUAL CONTENT for the end reader. NEVER explain what the section is doing or why the section's format is useful (e.g., do not write "This section compares..." or "A comparison table saves time"). Explain the core concept itself.

1. WHAT IT IS / OVERVIEW: Explain the topic or core concept of this section directly to the reader. Use **bold** for key concepts. Keep it crisp and direct.
2. WHY IT MATTERS / HOW IT WORKS: Explain the value, mechanics, or impact of the concept. Persuasive, data-driven tone. Use **bold** for emphasis.
3. EXPERIENCE / DATA POINT: Include a specific expert insight, statistic, or piece of original reasoning that demonstrates genuine expertise (E-E-A-T). Be specific — cite a real trend, a benchmark, or a verified fact.
4. EXAMPLES: 2-3 real brand examples only.
5. COPY FORMULA: A short, actionable, repeatable structure like a template or framework.
6. TAKEAWAY: One powerful sentence that summarizes the key lesson.
7. RICH MEDIA: Decide if this section is best served by an explanatory YouTube video (set type='youtube') or a custom image/diagram (set type='image').
   - If type='youtube': provide a suggested_search_query for YouTube.
   - If type='image': provide a suggested_search_query (for alt text/fallback) and a detailed, context-aware 'image_prompt' describing the custom graphic or diagram (e.g. "Professional workflow diagram showing lead capture, CRM integration, automated email sequence, sales pipeline tracking and analytics dashboard"). Do not use generic keywords. Add an alt_text as well.
8. OUTBOUND LINK: Suggest a Google search query to find an authoritative external source the reader could reference for this section.
9. KEYWORD DENSITY CONSTRAINT: The primary keyword is "\${primaryKeyword}". Limit its repetition to avoid over-optimization. Do NOT repeat the exact phrase "\${primaryKeyword}" more than once in this section's body text (and ideally 0 times). Instead, use natural variations or synonyms (such as "AI contract review tools", "automated contract analysis software", "contract evaluation platforms", "legal review technology", "automated review solutions", "the tool", "the software", or "the platform"). Prefer introducing new entities, concepts, examples, frameworks, tools, and use cases over repeating target keyword phrases.

Use bullet points where it makes the content more scannable. Write detailed, fully developed paragraphs (no strict 3-sentence limits) to meet the section word count target of \${targetPromptWords} words.\`,
                cacheKey: 'section_' + title + '_' + secOutline.originalIndex,
                runId
              });`;

const replacementSectionTaskBlock = `              const parentH2 = secOutline.level === 'H3' ? getParentH2(secOutline, outline.section_outlines) : null;
              const bp = secOutline.level === 'H2' ? secOutline.blueprint : (parentH2 as any)?.blueprint;

              // Enforce a minimum section depth based on section blueprints
              let sectionTargetWords = secOutline.target_word_budget;
              let sectionMinWords = secOutline.min_word_budget;

              if (secOutline.level === 'H2' && bp) {
                const childH3s = getChildH3s(secOutline, outline.section_outlines);
                if (childH3s.length > 0) {
                  sectionTargetWords = Math.max(150, Math.round(bp.target_word_count * 0.4));
                  sectionMinWords = Math.max(100, Math.round(bp.min_word_count * 0.4));
                } else {
                  sectionTargetWords = bp.target_word_count;
                  sectionMinWords = bp.min_word_count;
                }
              } else if (secOutline.level === 'H3' && bp) {
                const childH3s = getChildH3s(parentH2, outline.section_outlines);
                const h2Target = Math.max(150, Math.round(bp.target_word_count * 0.4));
                const h2Min = Math.max(100, Math.round(bp.min_word_count * 0.4));
                const remainingTarget = bp.target_word_count - h2Target;
                const remainingMin = bp.min_word_count - h2Min;

                sectionTargetWords = Math.max(120, Math.round(remainingTarget / (childH3s.length || 1)));
                sectionMinWords = Math.max(100, Math.round(remainingMin / (childH3s.length || 1)));
              }

              if (!sectionTargetWords) {
                sectionTargetWords = secOutline.level === 'H3' ? 120 : 350;
              }
              if (!sectionMinWords) {
                sectionMinWords = Math.round(sectionTargetWords * 0.8);
              }

              const maxSectionWords = Math.round(sectionTargetWords * 1.15);
              const targetPromptWords = Math.round(sectionTargetWords * 0.95);

              // 1. Required entities verified natural occurrence injection
              const targetEntities = bp?.required_entities || secOutline.target_entities || [];
              const secEntityContext = targetEntities.length > 0
                ? \`\\nREQUIRED_ENTITIES (MANDATORY):
You MUST explicitly, naturally, and contextually weave the following entities into this section's body text: \${targetEntities.join(', ')}.
Ensure each of these concepts or brands appears exactly as written in this section.\`
                : '';

              const wordCountContext = \`\\nSECTION WORD COUNT TARGET:
This section MUST contain at least \${sectionMinWords} words. Write detailed, fully developed paragraphs to meet this minimum length requirement. Expand the concepts fully, provide detailed examples, frameworks, and deep explanations to achieve this depth.
Do NOT limit paragraph lengths to 3 sentences. Target around \${targetPromptWords} words. Do NOT exceed the target budget of \${sectionTargetWords} words.\`;

              const generateTable = (secOutline as any).generate_table || (bp?.required_element === 'table');
              const tablePromptContext = generateTable
                ? \`\\nTABLE GENERATION DIRECTIVE (CRITICAL):
This section has been selected for table generation. You MUST generate a markdown comparison/pricing/feature table in the 'markdown_table' field of the schema.
Always use standard markdown table syntax (e.g., | Tool Name | Features | Pricing |) and populate it with realistic, non-placeholder data.\`
                : \`\\nTABLE GENERATION DIRECTIVE:
Do NOT generate a markdown table for this section. Leave the 'markdown_table' field empty.\`;

              // Diversified section structure & rotation logic
              let blueprintContext = '';
              let structurePatternInstruction = '';
              if (secOutline.level === 'H2' && bp) {
                blueprintContext = \`
MANDATORY SECTION BLUEPRINT CONSTRAINTS (YOU MUST SATISFY EVERY ITEM):
1. STRUCTURE FORMAT: Design this section as a "\${bp.structure_pattern.toUpperCase().replace('_', ' ')}" pattern.
2. REQUIRED ENTITIES: You must naturally weave in: \${bp.required_entities.join(', ') || 'None'}.
3. COMPETITOR GAPS: You must explicitly address: \${bp.required_gap_topics.join(', ') || 'None'}.
4. FAQ/PAA COVERAGE: You must answer: \${bp.required_faq_coverage.join(', ') || 'None'}.
5. PRACTICAL USE CASE: Include this specific brand example/use case: "\${bp.practical_example_or_use_case}".
6. EXPERT INSIGHT/EVIDENCE: Cite this expert insight or statistic: "\${bp.expert_insight_or_evidence}".
7. TRANSITION SENTENCE: End this section's takeaway transitioning to the next concept using or inspired by: "\${bp.transition_sentence}".
8. REQUIRED FORMAT ELEMENT: \${bp.required_element === 'table' ? 'Generate a markdown comparison table in the markdown_table field.' : bp.required_element === 'list' ? 'Include a markdown bulleted or numbered list in the text.' : bp.required_element === 'code_example' ? 'Include a code block (\`\`\`lang ... \`\`\`) in the text.' : 'No special format elements required.'}
\`;

                const pattern = bp.structure_pattern;
                if (pattern === 'tutorial') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: TUTORIAL\\nFormat this section as a step-by-step tutorial. Avoid generic definitions. Guide the reader through the actions required to complete the task. Use ordered lists or steps.\`;
                } else if (pattern === 'comparison') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: COMPARISON\\nFormat this section as a comparison of options/solutions. Detail pros, cons, and selection criteria. Ensure the comparison table is generated.\`;
                } else if (pattern === 'case_study') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: CASE STUDY\\nFormat this section as a case study of a real company/brand. Describe the initial challenge, the action taken, and the measurable results/ROI achieved.\`;
                } else if (pattern === 'checklist') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: CHECKLIST\\nFormat this section as an actionable checklist. Provide checkboxes [ ] and explain each item the reader needs to verify.\`;
                } else if (pattern === 'workflow') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: WORKFLOW\\nFormat this section as a procedural workflow. Detail the inputs, triggers, actions, and outputs of each phase.\`;
                } else if (pattern === 'decision_framework') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: DECISION FRAMEWORK\\nFormat this section as a decision framework or matrix. Give the reader concrete criteria to choose the right path or tool for their needs.\`;
                } else if (pattern === 'common_mistakes') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: COMMON MISTAKES\\nFormat this section around typical pitfalls and common mistakes. Explain why they happen and how to avoid/fix them.\`;
                } else if (pattern === 'implementation_guide') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: IMPLEMENTATION GUIDE\\nFormat this section as a technical or operational implementation guide. Detail setup, configuration, and launch steps.\`;
                } else if (pattern === 'best_practices') {
                  structurePatternInstruction = \`\\nSTRUCTURE PATTERN: BEST PRACTICES\\nFormat this section as a set of optimized best practices. Provide industry-standard rules and optimization techniques.\`;
                }
              } else if (secOutline.level === 'H3' && bp) {
                blueprintContext = \`
MANDATORY CONTEXT FROM PARENT H2 BLUEPRINT:
1. PARENT STRUCTURE FORMAT: "\${bp.structure_pattern.toUpperCase().replace('_', ' ')}". Keep your sub-section aligned with this format.
2. REQUIRED ENTITIES (SHARED): You must naturally weave in: \${bp.required_entities.join(', ') || 'None'}.
\`;
              }

              const sectionResult = await generateObjectWithTelemetry('Section Content Generation', {
                model,
                schema: SectionSchema,
                prompt: \`\${authorContext}

You are writing section "\${secOutline.heading}" (\${secOutline.level}) for the article: "\${title}".
Core concept: "\${secOutline.core_concept}".
\${keywordContext}
\${lsiContextSection}
\${secEntityContext}
\${wordCountContext}
\${tablePromptContext}
\${blueprintContext}
\${structurePatternInstruction}
\${guestPostContext}
\${internalLinksContext}
\${externalLinksContext}
\${customInsightsContext}
\${competitorContext}
\${planRoleContext}
\${intentConfidenceContext}
\${entityRelationshipContext}
\${featuredSnippetContext}
\${gapTopicsContext}
\${contentStructureMode === 'mirror' && referenceContext ? \`
STRUCTURE MODE: MIRROR — This section corresponds to a heading in the reference article.
Your content approach, depth and coverage must EXCEED the reference article's ambition — not just match it.
Identify anything the reference page covers shallowly and go deeper. ALL wording must be entirely original.
\` : ''}
STRICT HOUSE STYLE — follow every rule:
CRITICAL RULE: You are writing the ACTUAL CONTENT for the end reader. NEVER explain what the section is doing or why the section's format is useful. Explain the core concept itself.

1. WHAT IT IS / OVERVIEW: Explain the topic or core concept of this section directly to the reader. Use **bold** for key concepts. Keep it crisp and direct.
2. WHY IT MATTERS / HOW IT WORKS: Explain the value, mechanics, or impact of the concept. Persuasive, data-driven tone. Use **bold** for emphasis.
3. EXPERIENCE / DATA POINT: Include a specific expert insight, statistic, or piece of original reasoning that demonstrates genuine expertise (E-E-A-T). Be specific — cite a real trend, a benchmark, or a verified fact.
4. EXAMPLES: 2-3 real brand examples only.
5. COPY FORMULA: A short, actionable, repeatable structure like a template or framework.
6. TAKEAWAY: One powerful sentence that summarizes the key lesson.
7. RICH MEDIA: Decide if this section is best served by an explanatory YouTube video (set type='youtube') or a custom image/diagram (set type='image').
8. OUTBOUND LINK: Suggest a Google search query to find an authoritative external source the reader could reference for this section.
9. KEYWORD DENSITY CONSTRAINT: The primary keyword is "\${primaryKeyword}". Limit its repetition to avoid over-optimization. Do NOT repeat the exact phrase "\${primaryKeyword}" more than once in this section's body text (and ideally 0 times). Instead, use natural variations or synonyms.

Use bullet points where it makes the content more scannable. Write detailed, fully developed paragraphs to meet the section word count target of \${targetPromptWords} words. You MUST satisfy every blueprint requirement. Do NOT complete the section until all blueprint items are fulfilled.\`,
                cacheKey: 'section_' + title + '_' + secOutline.originalIndex,
                runId
              });`;

if (content.includes(targetSectionTaskBlockStart)) {
  content = content.replace(targetSectionTaskBlockStart, replacementSectionTaskBlock);
  console.log('4. Redesigned section content generation successfully.');
} else {
  console.error('Failed to locate targetSectionTaskBlockStart insertion point!');
  process.exit(1);
}

// --- 5. FALLBACK TABLE RUNS BEFORE ASSEMBLY ---
const stage3Landmark = `          assemblyStart = Date.now();
          // ─── Stage 3: Media and Authority Link Enrichment ────────────────`;

const fallbackTableAssemblyCode = `          // Ensure fallback table generation executes before assembly whenever table intent is detected
          completedSections.forEach((item: any) => {
            const secOutline = item.outline;
            const section = item.section;
            const hasTableIntent = secOutline.generate_table === true || 
                                   secOutline.blueprint?.required_element === 'table' ||
                                   /\\b(vs|versus|compare|comparison|pricing|tools|alternatives)\\b/i.test(secOutline.heading);
            
            if (hasTableIntent) {
              const tableStr = (section.markdown_table || '').trim();
              const tableLines = tableStr.split('\\n').filter(Boolean);
              const hasValidTable = tableStr.includes('|') && tableLines.length >= 3;
              if (!hasValidTable) {
                console.log(\`[Assembly Table Hardening] Table intent detected for "\${secOutline.heading}" but no valid table found. Generating dynamic fallback table.\`);
                const entities = secOutline.target_entities || [];
                const brands = section.example_brands || [];
                section.markdown_table = generateDynamicFallbackTable(secOutline.heading, brands, entities);
              }
            }
          });
`;

if (content.includes(stage3Landmark)) {
  content = content.replace(stage3Landmark, fallbackTableAssemblyCode + '\n' + stage3Landmark);
  console.log('5. Fallback table check before assembly injected successfully.');
} else {
  console.error('Failed to locate Stage 3 insertion point!');
  process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('ALL PATCHES APPLIED TO route.ts SUCCESSFULLY!');
