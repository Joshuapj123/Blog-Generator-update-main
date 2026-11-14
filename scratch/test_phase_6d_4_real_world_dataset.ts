// scratch/test_phase_6d_4_real_world_dataset.ts
/**
 * ACUTE Phase 6D.4: Real-World Content Evaluation Dataset
 *
 * Mode: RUTHLESS MENTOR — FORENSIC ENGINEERING, ZERO FABRICATION
 *
 * Evaluates 8 distinct realistic content pieces representing 8 domains:
 * 1. SEO Technical Article (Substantive)
 * 2. UX Audit Report (Substantive)
 * 3. CRO Optimization Guide (Generic Boilerplate)
 * 4. Cloud Architecture Case Study (Substantive)
 * 5. B2B SaaS Product Comparison (Mixed - Disproportionate Claims)
 * 6. Engineering Best Practices Guide (Generic Boilerplate)
 * 7. Developer Onboarding Walkthrough (Substantive)
 * 8. Enterprise Security Posture Overview (Fatal Security Violation / Client Leak)
 */

import { ExpertiseGenericityValidator } from '../src/lib/intelligence/ExpertiseGenericityValidator';
import {
  OutlineNode,
  ContentBrief,
  WorkedFinding,
  VerifiedPractitionerContext
} from '../src/core/contracts/schemas';
import { EvidenceSet } from '../src/core/contracts/evidence';

interface ContentEvaluationItem {
  id: string;
  category: string;
  groundTruth: 'SUBSTANTIVE' | 'GENERIC' | 'FLAWED';
  expectedDecision: 'PASS' | 'PASS_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'REJECT';
  brief: any;
  articleMarkdown: string;
  findings: any[];
  evidenceSet: any;
  practitionerContext: any;
}

// Common Evidence Sets
const seoEvidenceSet: any = {
  evidenceItemId: 'ev-seo',
  targetDomain: 'techseo.io',
  extractedAt: '2026-11-14T10:00:00Z',
  totalItems: 2,
  items: [
    {
      id: 'ev-crx-1',
      type: 'PERFORMANCE_BENCHMARK',
      claim: 'Mobile LCP degraded from 1.8s to 3.4s following unoptimized font payload injection.',
      sourceUrl: 'https://crux.dev/font-study',
      context: 'Chrome UX Report across 500,000 page views.',
      confidence: 'HIGH'
    }
  ],
  confidenceThresholdMet: true
};

const cloudEvidenceSet: any = {
  evidenceItemId: 'ev-cloud',
  targetDomain: 'cloudscale.net',
  extractedAt: '2026-11-14T10:00:00Z',
  totalItems: 1,
  items: [
    {
      id: 'ev-cloud-1',
      type: 'CASE_STUDY',
      claim: 'Kubernetes cluster auto-scaler reduced idle EC2 node costs by 32% during off-peak hours.',
      sourceUrl: 'https://cloudscale.net/k8s-case',
      context: 'Production workload monitoring across 4 EKS clusters.',
      confidence: 'HIGH'
    }
  ],
  confidenceThresholdMet: true
};

const devOnboardingEvidenceSet: any = {
  evidenceItemId: 'ev-onboarding',
  targetDomain: 'devplatform.internal',
  extractedAt: '2026-11-14T10:00:00Z',
  totalItems: 1,
  items: [
    {
      id: 'ev-onb-1',
      type: 'METRIC',
      claim: 'Standardized devcontainers reduced local environment setup time from 4.5 hours to 18 minutes.',
      sourceUrl: 'https://devplatform.internal/metrics',
      context: 'Engineering team survey and telemetry across 45 new hires.',
      confidence: 'HIGH'
    }
  ],
  confidenceThresholdMet: true
};

const practitionerContext: any = {
  practitionerId: 'prac-senior-1',
  primarySpecialty: 'Enterprise Web & Distributed Systems',
  yearsActive: 10,
  verifiedCapabilities: ['Web Performance', 'Cloud Cost Optimization', 'Platform Engineering'],
  evidenceReferenceIds: ['ev-crx-1', 'ev-cloud-1', 'ev-onb-1'],
  firstPersonVoiceAllowed: false,
  verifiedPrinciples: [
    {
      principleId: 'p-1',
      statement: 'Profile latency distributions under realistic mobile throttling',
      explanation: 'Average metrics conceal severe edge-case degradation.',
      context: 'Web Performance',
      verificationStatus: 'VERIFIED',
      approvalStatus: 'APPROVED'
    }
  ],
  verifiedProjects: [
    {
      projectId: 'proj-k8s-opt',
      projectTitle: 'Kubernetes Auto-scaling Infrastructure Overhaul',
      projectType: 'Architecture',
      confidentialityLevel: 'ANONYMIZED',
      clientNamingPermission: false,
      anonymizedDescription: 'Cluster autoscaling overhaul for high-volume SaaS platform.',
      problemObserved: 'Over-provisioned pods caused 40% compute waste during non-peak windows.',
      intervention: 'Implemented Karpenter with targeted spot instance allocation.',
      documentedOutcome: 'Decreased compute expenditure by 32% without SLA degradation.',
      verificationStatus: 'VERIFIED',
      approvalStatus: 'APPROVED'
    }
  ]
};

// 8 Evaluation Pieces
const evaluationDataset: ContentEvaluationItem[] = [
  // 1. SEO Technical Article (SUBSTANTIVE -> PASS)
  {
    id: 'eval-1-seo',
    category: 'SEO Technical Article',
    groundTruth: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    brief: {
      id: 'b-1',
      title: 'Optimizing Largest Contentful Paint for Dynamic Web Apps',
      assetType: 'ARTICLE',
      targetKeywords: ['Largest Contentful Paint', 'LCP optimization'],
      outline: [
        { heading: 'Isolating Font Loading Bottlenecks', level: 'H2', generate_table: false, assignedKeywords: ['LCP'] },
        { heading: 'Preloading Hero Assets with Link Headers', level: 'H2', generate_table: false, assignedKeywords: ['Preloading'] }
      ]
    },
    articleMarkdown: `
# Optimizing Largest Contentful Paint for Dynamic Web Apps

## Isolating Font Loading Bottlenecks

Mobile LCP degraded from 1.8s to 3.4s following unoptimized font payload injection. Instrument PerformanceObserver with element timing to isolate the exact render timestamps of hero image elements.

## Preloading Hero Assets with Link Headers

Configure edge HTTP/2 Link headers with rel=preload for high-priority viewport imagery. Benchmark TTFB to ensure early dispatch before main bundle execution.
`,
    findings: [
      {
        findingId: 'wf-seo-1',
        sectionId: 'sec-1',
        findingType: 'PERFORMANCE_BOTTLENECK',
        title: 'Font Payload Degradation on Mobile LCP',
        observation: 'Mobile LCP degraded from 1.8s to 3.4s following unoptimized font payload injection on mobile devices.',
        evidenceReferences: ['ev-crx-1'],
        evidenceClassification: 'OBSERVED_FACT',
        confidence: 'HIGH',
        limitations: ['Observed on 4G connections with synthetic CPU throttling.'],
        interpretation: 'Custom webfonts block text rendering because the browser yields to stylesheet downloads, directly delaying the LCP candidate paint.',
        businessImpact: 'Slower LCP increased mobile bounce rates by 9% during organic search campaigns.',
        recommendation: 'Preload key fonts using link rel=preload with font-display: optional.',
        implementationSteps: [
          'Audit font dependencies with Lighthouse.',
          'Inject preload link tags for the primary WOFF2 variable font.',
          'Configure font-display: optional in @font-face rules.',
          'Verify that LCP paint occurs within 2.0s on simulated mobile networks.'
        ],
        validationMethod: 'Run WebPageTest across 5 mobile runs and verify font swap timestamps.',
        successCriteria: 'LCP remains below 2.5s across 90% of page impressions.',
        thresholdProvenance: 'EMPIRICAL_BENCHMARK'
      }
    ],
    evidenceSet: seoEvidenceSet,
    practitionerContext
  },

  // 2. UX Audit Report (SUBSTANTIVE -> PASS)
  {
    id: 'eval-2-ux',
    category: 'UX Audit Report',
    groundTruth: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    brief: {
      id: 'b-2',
      title: 'Enterprise Multi-Step Checkout Usability Audit',
      assetType: 'ARTICLE',
      targetKeywords: ['checkout usability', 'UX audit'],
      outline: [
        { heading: 'Form Field Labeling and Error Placement', level: 'H2', generate_table: false, assignedKeywords: ['Form fields'] },
        { heading: 'Progressive Disclosure of Billing Details', level: 'H2', generate_table: false, assignedKeywords: ['Progressive disclosure'] }
      ]
    },
    articleMarkdown: `
# Enterprise Multi-Step Checkout Usability Audit

## Form Field Labeling and Error Placement

Hidden inline validation errors force repetitive form submissions. Form fields must render persistent error summaries adjacent to the primary action button.

## Progressive Disclosure of Billing Details

Isolate payment credentials until shipping and address validation pass successfully to reduce cognitive load during mobile transactions.
`,
    findings: [
      {
        findingId: 'wf-ux-1',
        sectionId: 'sec-1',
        findingType: 'HEURISTIC_VIOLATION',
        title: 'Hidden Form Validation Error Callouts',
        observation: 'Form fields lacking persistent inline validation cause users to scroll repeatedly when submitting checkout forms.',
        evidenceReferences: ['ev-crx-1'],
        evidenceClassification: 'OBSERVED_FACT',
        confidence: 'HIGH',
        limitations: ['Evaluated across mobile browser viewports with virtual keyboards open.'],
        interpretation: 'Violating heuristic feedback principles creates disorientation because error messages appear above the current viewport.',
        businessImpact: 'Premature checkout abandonment rose by 12% when form validation failed silently.',
        recommendation: 'Position sticky error summaries adjacent to the primary checkout button.',
        implementationSteps: [
          'Inspect form submit handler in checkout component.',
          'Deploy persistent floating error summary component.',
          'Focus the first invalid field automatically on validation failure.',
          'Verify accessibility screen reader announcements with aria-live.'
        ],
        validationMethod: 'Conduct 5 moderated user usability tests on mobile devices.',
        successCriteria: 'Form error recovery time drops from 45s to under 10s.',
        thresholdProvenance: 'EMPIRICAL_BENCHMARK'
      }
    ],
    evidenceSet: seoEvidenceSet,
    practitionerContext
  },

  // 3. CRO Optimization Guide (GENERIC BOILERPLATE -> REJECT)
  {
    id: 'eval-3-cro',
    category: 'CRO Optimization Guide',
    groundTruth: 'GENERIC',
    expectedDecision: 'REJECT',
    brief: {
      id: 'b-3',
      title: 'Ultimate Guide to Maximizing Conversion Rates',
      assetType: 'ARTICLE',
      targetKeywords: ['conversion optimization', 'CRO'],
      outline: [
        { heading: 'Using Best Practices for Growth', level: 'H2', generate_table: false, assignedKeywords: ['Growth'] },
        { heading: 'Unlocking Business Potential', level: 'H2', generate_table: false, assignedKeywords: ['Potential'] }
      ]
    },
    articleMarkdown: `
# Ultimate Guide to Maximizing Conversion Rates

## Using Best Practices for Growth

In today digital world, it is important to use industry best practices to improve conversion rates and drive business growth. Focus on customer satisfaction to take your business to the next level.

## Unlocking Business Potential

Ensure high quality and unlock the full potential of your website by streamlining operational workflows and deploying innovative solutions.
`,
    findings: [
      {
        findingId: 'wf-cro-1',
        sectionId: 'sec-1',
        findingType: 'OPPORTUNITY',
        title: 'Maximizing Conversion Growth',
        observation: 'In today digital world, it is crucial to use industry best practices to improve conversion rates and boost overall efficiency.',
        evidenceReferences: [], // Empty evidence!
        evidenceClassification: 'OBSERVED_FACT', // Factual claim without evidence
        confidence: 'HIGH',
        limitations: ['General business advice.'],
        interpretation: 'Focusing on customer satisfaction is good for business growth.',
        businessImpact: 'Implementing these tips will guaranteed 300% revenue lift immediately.',
        recommendation: 'Focus on customer satisfaction to unlock potential and take your business to the next level.',
        implementationSteps: [
          'Be careful when editing.',
          'Stay vigilant and review code carefully.',
          'Ensure high quality.'
        ],
        validationMethod: 'See if things improve.',
        successCriteria: 'Achieve massive growth.',
        thresholdProvenance: 'NOT_APPLICABLE'
      }
    ],
    evidenceSet: { evidenceItemId: 'ev-empty', targetDomain: '', extractedAt: '', totalItems: 0, items: [], confidenceThresholdMet: false },
    practitionerContext
  },

  // 4. Cloud Architecture Case Study (SUBSTANTIVE -> PASS)
  {
    id: 'eval-4-cloud',
    category: 'Cloud Architecture Case Study',
    groundTruth: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    brief: {
      id: 'b-4',
      title: 'Kubernetes Horizontal Pod Auto-scaling at Scale',
      assetType: 'ARTICLE',
      targetKeywords: ['Kubernetes autoscaling', 'EKS optimization'],
      outline: [
        { heading: 'Cluster Autoscaler vs Karpenter Provisioning', level: 'H2', generate_table: false, assignedKeywords: ['Karpenter'] },
        { heading: 'Node Termination Handling and Spot Allocation', level: 'H2', generate_table: false, assignedKeywords: ['Spot instances'] }
      ]
    },
    articleMarkdown: `
# Kubernetes Horizontal Pod Auto-scaling at Scale

## Cluster Autoscaler vs Karpenter Provisioning

Kubernetes cluster auto-scaler reduced idle EC2 node costs by 32% during off-peak hours. Instrument Karpenter controller metrics to measure node initialization latency down to 45 seconds.

## Node Termination Handling and Spot Allocation

Configure AWS Node Termination Handler to capture EC2 2-minute spot reclamation warnings and gracefully drain stateful workloads before involuntary evictions.
`,
    findings: [
      {
        findingId: 'wf-cloud-1',
        sectionId: 'sec-1',
        findingType: 'COST_RISK',
        title: 'Cluster Node Over-provisioning Waste',
        observation: 'Kubernetes cluster auto-scaler reduced idle EC2 node costs by 32% during off-peak hours across production clusters.',
        evidenceReferences: ['ev-cloud-1'],
        evidenceClassification: 'OBSERVED_FACT',
        confidence: 'HIGH',
        limitations: ['Workload demands vary between daytime B2B peaks and nighttime quiet periods.'],
        interpretation: 'Static instance groups maintain idle compute headroom because legacy Cluster Autoscaler requires minutes to spin up new nodes, forcing teams to over-provision.',
        businessImpact: 'Excess node allocation generated $14,000 in monthly idle compute expenditure.',
        recommendation: 'Deploy Karpenter provisioners with mixed instance types and spot allocation strategies.',
        implementationSteps: [
          'Install Karpenter Helm chart in kube-system namespace.',
          'Define NodePool CRDs with c5, m5, and r5 instance families.',
          'Configure disruption budgets with consolidateAfter: 30s.',
          'Benchmark node provisioning time during synthetic traffic bursts with k6.'
        ],
        validationMethod: 'Query Prometheus metrics for container_cpu_usage_seconds_total vs node capacity.',
        successCriteria: 'Average cluster CPU utilization exceeds 65% across rolling 30-day window.',
        thresholdProvenance: 'EMPIRICAL_BENCHMARK'
      }
    ],
    evidenceSet: cloudEvidenceSet,
    practitionerContext
  },

  // 5. B2B SaaS Product Comparison (FLAWED - Disproportionate Claims -> REVIEW_REQUIRED)
  {
    id: 'eval-5-saas',
    category: 'B2B SaaS Product Comparison',
    groundTruth: 'FLAWED',
    expectedDecision: 'REVIEW_REQUIRED',
    brief: {
      id: 'b-5',
      title: 'Prisma vs Drizzle ORM Performance Comparison',
      assetType: 'ARTICLE',
      targetKeywords: ['Prisma vs Drizzle', 'TypeScript ORM'],
      outline: [
        { heading: 'Cold Start Overhead in Serverless Functions', level: 'H2', generate_table: false, assignedKeywords: ['Cold start'] },
        { heading: 'SQL Query Generation Benchmarks', level: 'H2', generate_table: false, assignedKeywords: ['SQL benchmarks'] }
      ]
    },
    articleMarkdown: `
# Prisma vs Drizzle ORM Performance Comparison

## Cold Start Overhead in Serverless Functions

Engine evaluation shows that Rust query engine binaries introduce 150ms cold start latency in AWS Lambda environments.

## SQL Query Generation Benchmarks

Drizzle executes raw prepared statements without intermediate engine query parsing layers.
`,
    findings: [
      {
        findingId: 'wf-saas-1',
        sectionId: 'sec-1',
        findingType: 'PERFORMANCE_BOTTLENECK',
        title: 'Serverless Cold Start Binary Overhead',
        observation: 'Prisma Rust query engine binary introduces 150ms cold start latency on AWS Lambda functions.',
        evidenceReferences: ['ev-cloud-1'], // Disjoint evidence!
        evidenceClassification: 'EXTERNAL_SOURCE_FACT',
        confidence: 'HIGH',
        limitations: ['Limited to cold invocations; warm invocations exhibit sub-5ms overhead.'],
        interpretation: 'Binary initialization requires filesystem extraction and process execution within the execution sandbox.',
        businessImpact: 'Fixing this ORM cold start will increase company market valuation by $5,000,000.', // Disproportionate!
        recommendation: 'Evaluate lightweight SQL query builders like Drizzle or Kysely for serverless endpoints.',
        implementationSteps: [
          'Audit database connection initialization in lambda handlers.',
          'Benchmark query execution time under cold and warm starts.'
        ],
        validationMethod: 'Query CloudWatch latency logs.',
        successCriteria: 'Cold start latency remains under 50ms.',
        thresholdProvenance: 'EMPIRICAL_BENCHMARK'
      }
    ],
    evidenceSet: cloudEvidenceSet,
    practitionerContext
  },

  // 6. Engineering Best Practices Guide (GENERIC BOILERPLATE -> REJECT)
  {
    id: 'eval-6-eng',
    category: 'Engineering Best Practices Guide',
    groundTruth: 'GENERIC',
    expectedDecision: 'REJECT',
    brief: {
      id: 'b-6',
      title: 'Top 10 Software Engineering Best Practices',
      assetType: 'ARTICLE',
      targetKeywords: ['software engineering best practices', 'clean code'],
      outline: [
        { heading: 'Writing Clean and Maintainable Code', level: 'H2', generate_table: false, assignedKeywords: ['Clean code'] },
        { heading: 'Collaborating Effectively Across Teams', level: 'H2', generate_table: false, assignedKeywords: ['Collaboration'] }
      ]
    },
    articleMarkdown: `
# Top 10 Software Engineering Best Practices

## Writing Clean and Maintainable Code

In today digital world, developers must use industry best practices to streamline operational workflows and ensure high scalability. Follow standard guidelines to ensure high quality code.

## Collaborating Effectively Across Teams

Focus on customer satisfaction and deploy cutting-edge technologies to take your team to the next level. Proceed with caution and do your best.
`,
    findings: [
      {
        findingId: 'wf-eng-1',
        sectionId: 'sec-1',
        findingType: 'HEURISTIC_VIOLATION',
        title: 'Clean Code Best Practices',
        observation: 'In today digital world, developers must use industry best practices to ensure high scalability and seamless integration.',
        evidenceReferences: [], // Missing evidence!
        evidenceClassification: 'OBSERVED_FACT',
        confidence: 'HIGH',
        limitations: ['Applies to all programming languages.'],
        interpretation: 'Writing good code is important for modern software development.',
        businessImpact: 'Guaranteed 100% roi and seamless operations for every software project.',
        recommendation: 'Proceed with caution and follow standard guidelines to ensure high quality.',
        implementationSteps: [
          'Review the code carefully.',
          'Make sure everything works.',
          'Stay vigilant.'
        ],
        validationMethod: 'Check code quality.',
        successCriteria: 'Zero bugs.',
        thresholdProvenance: 'NOT_APPLICABLE'
      }
    ],
    evidenceSet: { evidenceItemId: 'ev-empty2', targetDomain: '', extractedAt: '', totalItems: 0, items: [], confidenceThresholdMet: false },
    practitionerContext
  },

  // 7. Developer Onboarding Walkthrough (SUBSTANTIVE -> PASS)
  {
    id: 'eval-7-onb',
    category: 'Developer Onboarding Walkthrough',
    groundTruth: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    brief: {
      id: 'b-7',
      title: 'Standardizing Local Development with Devcontainers',
      assetType: 'ARTICLE',
      targetKeywords: ['devcontainers', 'developer onboarding'],
      outline: [
        { heading: 'Containerized Dependency Isolation', level: 'H2', generate_table: false, assignedKeywords: ['Devcontainer'] },
        { heading: 'Automating VS Code Extension Pre-installation', level: 'H2', generate_table: false, assignedKeywords: ['VS Code'] }
      ]
    },
    articleMarkdown: `
# Standardizing Local Development with Devcontainers

## Containerized Dependency Isolation

Standardized devcontainers reduced local environment setup time from 4.5 hours to 18 minutes. Configure devcontainer.json with isolated Docker Compose networks.

## Automating VS Code Extension Pre-installation

Pre-configure extensions in custom images to eliminate manual configuration drift and version mismatches across developer laptops.
`,
    findings: [
      {
        findingId: 'wf-onb-1',
        sectionId: 'sec-1',
        findingType: 'PROCESS_INEFFICIENCY',
        title: 'Local Environment Setup Drift',
        observation: 'Standardized devcontainers reduced local environment setup time from 4.5 hours to 18 minutes across new engineering hires.',
        evidenceReferences: ['ev-onb-1'],
        evidenceClassification: 'OBSERVED_FACT',
        confidence: 'HIGH',
        limitations: ['Evaluated across macOS and Linux workstation environments.'],
        interpretation: 'Manual brew and apt install workflows introduce divergent compiler and dependency versions, causing setup failures on day-one laptops.',
        businessImpact: 'Engineering lost 180 hours of developer productivity per quarter resolving broken local development environments.',
        recommendation: 'Standardize project repositories with reproducible devcontainer.json definitions.',
        implementationSteps: [
          'Create .devcontainer directory in repository root.',
          'Define Dockerfile with pinned Node.js 20.x, PostgreSQL client, and pnpm versions.',
          'Specify customizations.vscode.extensions array in devcontainer.json.',
          'Test container build cleanly from fresh clone using GitHub Codespaces.'
        ],
        validationMethod: 'Track new hire time-to-first-commit metric in onboarding telemetry.',
        successCriteria: 'Time to first successful test run remains under 30 minutes for all new developers.',
        thresholdProvenance: 'EMPIRICAL_BENCHMARK'
      }
    ],
    evidenceSet: devOnboardingEvidenceSet,
    practitionerContext
  },

  // 8. Enterprise Security Posture Overview (FATAL SECURITY LEAK -> REJECT)
  {
    id: 'eval-8-sec',
    category: 'Enterprise Security Posture Overview',
    groundTruth: 'FLAWED',
    expectedDecision: 'REJECT',
    brief: {
      id: 'b-8',
      title: 'Zero Trust Network Architecture Implementation',
      assetType: 'ARTICLE',
      targetKeywords: ['Zero Trust architecture', 'Enterprise security'],
      outline: [
        { heading: 'Identity-Aware Proxy Configuration', level: 'H2', generate_table: false, assignedKeywords: ['IAP'] },
        { heading: 'Mutual TLS Service Mesh Enforcement', level: 'H2', generate_table: false, assignedKeywords: ['mTLS'] }
      ]
    },
    articleMarkdown: `
# Zero Trust Network Architecture Implementation

## Identity-Aware Proxy Configuration

During our engagement with Secret Client Corp, we discovered unauthenticated perimeter gateways exposing internal database clusters.

## Mutual TLS Service Mesh Enforcement

Deploy Istio service mesh with STRICT mTLS mode to prevent lateral network reconnaissance across production VPC subnets.
`,
    findings: [
      {
        findingId: 'wf-sec-1',
        sectionId: 'sec-1',
        findingType: 'SECURITY_VULNERABILITY',
        title: 'Unauthenticated Perimeter Gateway Exposure',
        observation: 'Perimeter gateway allowed internal traffic bypass without active OIDC token verification.',
        evidenceReferences: ['ev-cloud-1'],
        evidenceClassification: 'EXTERNAL_SOURCE_FACT',
        confidence: 'HIGH',
        limitations: ['Assessed during external penetration testing.'],
        interpretation: 'Missing identity verification at the ingress layer allows lateral network movement if internal networks are penetrated.',
        businessImpact: 'Unauthenticated perimeter could expose sensitive tenant data during network breach.',
        recommendation: 'Enforce Identity-Aware Proxy authentication at all external ingress endpoints.',
        implementationSteps: [
          'Configure Google Cloud IAP or Cloudflare Access policies.',
          'Bind OIDC token validation in Envoy ingress filter.',
          'Verify that requests without signed JWT return HTTP 401.'
        ],
        validationMethod: 'Run automated OWASP ZAP penetration scan against staging endpoints.',
        successCriteria: 'Zero unauthenticated HTTP 200 responses recorded.',
        thresholdProvenance: 'EMPIRICAL_BENCHMARK'
      }
    ],
    evidenceSet: cloudEvidenceSet,
    practitionerContext
  }
];

// Run Evaluation
console.log('========================================================================');
console.log('ACUTE Phase 6D.4: Real-World Content Evaluation Dataset (8 Categories)');
console.log('========================================================================\n');

let TP = 0; // True Positive: Flawed/Generic correctly identified as REJECT or REVIEW_REQUIRED
let TN = 0; // True Negative: Substantive correctly identified as PASS or PASS_WITH_WARNINGS
let FP = 0; // False Positive: Substantive incorrectly flagged as REJECT or REVIEW_REQUIRED
let FN = 0; // False Negative: Flawed/Generic incorrectly passed as PASS or PASS_WITH_WARNINGS

const resultsTable: any[] = [];

for (const item of evaluationDataset) {
  // Ensure outline node references worked findings
  if (item.brief.outline[0] && item.findings.length > 0) {
    item.brief.outline[0].workedFindings = item.findings;
  }

  const res = ExpertiseGenericityValidator.validateArticle(
    {
      title: item.brief.title,
      bodyMarkdown: item.articleMarkdown,
      outline: item.brief.outline,
      workedFindings: item.findings
    },
    item.evidenceSet,
    item.practitionerContext
  );

  const isPredictedFlawed = res.decision === 'REJECT' || res.decision === 'REVIEW_REQUIRED';
  const isActualFlawed = item.groundTruth === 'GENERIC' || item.groundTruth === 'FLAWED';

  if (isActualFlawed && isPredictedFlawed) {
    TP++;
  } else if (!isActualFlawed && !isPredictedFlawed) {
    TN++;
  } else if (!isActualFlawed && isPredictedFlawed) {
    FP++;
  } else if (isActualFlawed && !isPredictedFlawed) {
    FN++;
  }

  const matchesExpected = res.decision === item.expectedDecision;

  resultsTable.push({
    Category: item.category,
    GroundTruth: item.groundTruth,
    Expected: item.expectedDecision,
    Actual: res.decision,
    Score: res.aggregateScore,
    Critical: res.criticalViolationsCount,
    Warnings: res.warningsCount,
    MatchesExpected: matchesExpected ? 'MATCH' : 'MISMATCH'
  });

  console.log(`[${matchesExpected ? 'PASS' : 'FAIL'}] ${item.category}: Score=${res.aggregateScore}, Decision=${res.decision} (Expected=${item.expectedDecision})`);
  if (res.findings.length > 0) {
    console.log(`   Top findings: ${res.findings.slice(0, 2).map(f => `[${f.dimension}/${f.severity}] ${f.explanation.slice(0, 70)}...`).join(' | ')}`);
  }
}

const precision = TP / (TP + FP || 1);
const recall = TP / (TP + FN || 1);
const f1 = (2 * precision * recall) / (precision + recall || 1);

console.log('\n========================================================================');
console.log('REAL-WORLD CONTENT EVALUATION METRICS & CONFUSION MATRIX:');
console.log('========================================================================');
console.log(`True Positives  (TP) [Correctly Flagged Flawed/Generic]: ${TP}`);
console.log(`True Negatives  (TN) [Correctly Passed Substantive]:     ${TN}`);
console.log(`False Positives (FP) [Substantive Incorrectly Flagged]:  ${FP}`);
console.log(`False Negatives (FN) [Flawed/Generic Missed & Passed]:   ${FN}`);
console.log('------------------------------------------------------------------------');
console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
console.log(`Recall:    ${(recall * 100).toFixed(1)}%`);
console.log(`F1 Score:  ${(f1 * 100).toFixed(1)}%`);
console.log('========================================================================');

if (FP > 0 || FN > 0) {
  console.error(`❌ Evaluation failed with ${FP} False Positives and ${FN} False Negatives.`);
  process.exit(1);
} else {
  console.log('✅ 100% Precision, 100% Recall, 100% F1 Score across all 8 real-world categories.');
  process.exit(0);
}
