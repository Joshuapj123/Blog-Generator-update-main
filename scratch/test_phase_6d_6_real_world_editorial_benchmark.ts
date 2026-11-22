/**
 * ACUTE Phase 6D.6: Independent Real-World Editorial Benchmark Runner & Dataset
 *
 * Mode: RUTHLESS MENTOR — FAST EXECUTION, EVIDENCE FIRST, ZERO PRODUCTION RISK
 *
 * Evaluates 12 comprehensive editorial tasks:
 * - 6 Substantive Real-World Production Articles across diverse engineering domains
 * - 6 Adversarial / Negative Invariant Scenarios testing zero-tolerance safety bounds
 */

import {
  EditorialBenchmarkEngine,
  BenchmarkTaskInput,
  BenchmarkEvaluationResult
} from '../src/lib/benchmark/EditorialBenchmarkEngine';
import { PractitionerKnowledgeService } from '../src/lib/intelligence/PractitionerKnowledgeService';

// ============================================================================
// BENCHMARK DATASET DEFINITION (12 TASKS)
// ============================================================================

const BENCHMARK_TASKS: BenchmarkTaskInput[] = [
  // --------------------------------------------------------------------------
  // TASK 01: Technical SEO & Core Web Vitals
  // --------------------------------------------------------------------------
  {
    id: 'TASK-01',
    name: 'Next.js Font Optimization & Mobile LCP Remediation',
    domain: 'Technical SEO',
    taskType: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    evidenceSet: {
      items: [
        {
          id: 'ev-cwv-1',
          claim: 'Preloading critical variable subsets reduced mobile LCP from 3.8s to 1.4s on 4G connections.',
          sourceUrl: 'https://web.dev/articles/optimize-webfont-loading'
        },
        {
          id: 'ev-cwv-2',
          claim: 'Font layout shift (CLS) dropped from 0.18 to 0.01 using size-adjust CSS fallback descriptors.',
          sourceUrl: 'https://developer.chrome.com/docs/lighthouse/performance/font-display'
        }
      ]
    },
    workedFindings: [
      {
        observation: 'Preloading critical variable subsets reduced mobile LCP from 3.8s to 1.4s on 4G connections.',
        businessImpact: 'Prevents conversion drop-off on mobile landing pages where 1.4s LCP keeps bounce rates below 28%.',
        recommendation: 'Configure next/font/google with variable font display swap and preconnect headers.'
      }
    ],
    articleMarkdown: `
# Remediating Mobile LCP Regressions Through Surgical Next.js Font Loading

When evaluating Core Web Vitals regressions on mobile e-commerce portals, web font loading is frequently the dominant contributor to Largest Contentful Paint (LCP) delays. Preloading critical variable subsets reduced mobile LCP from 3.8s to 1.4s on 4G connections in production testing. Simultaneously, font layout shift (CLS) dropped from 0.18 to 0.01 using size-adjust CSS fallback descriptors.

## The Architectural Trade-off: System Fonts vs Custom Brand Typography

The core engineering tradeoff lies between pristine brand identity and render-blocking network overhead. Self-hosted custom fonts often incur a significant latency penalty when loaded over high-latency cellular networks, triggering flash of invisible text (FOIT) or cascading font layout shifts (FOUT).

\`\`\`typescript
// src/app/layout.tsx
import { DM_Sans } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});
\`\`\`

## Step-by-Step Implementation

1. Convert multi-weight static fonts to modern WOFF2 variable fonts to eliminate duplicate HTTP requests.
2. Define fallback typography using \`size-adjust\` and \`ascent-override\` to match x-height and prevent CLS.
3. Validate runtime performance metrics directly using Chrome DevTools Lighthouse audit:

\`\`\`bash
npx lighthouse-ci collect --url=https://staging.example.com --numberOfRuns=3
\`\`\`

## Operational Failure Modes & Edge Cases

When self-hosting fonts behind an edge CDN, cache invalidation failures can lead to version mismatches where CSS rules reference outdated font hashes, leading to 404 font download stalls. Ensure immutable cache headers (\`Cache-Control: public, max-age=31536000, immutable\`) are applied to font assets.
`
  },

  // --------------------------------------------------------------------------
  // TASK 02: Distributed Systems & Event Streaming
  // --------------------------------------------------------------------------
  {
    id: 'TASK-02',
    name: 'Kafka Consumer Rebalance Optimization with Static Membership',
    domain: 'Distributed Systems',
    taskType: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    evidenceSet: {
      items: [
        {
          id: 'ev-kfk-1',
          claim: 'Static group membership decreased partition rebalance downtime from 18s to 0.4s during rolling restarts.',
          sourceUrl: 'https://kafka.apache.org/documentation/#static_membership'
        },
        {
          id: 'ev-kfk-2',
          claim: 'Setting max.poll.interval.ms to 300000ms prevented spurious consumer eviction under heavy batch loads.',
          sourceUrl: 'https://confluent.io/blog/kafka-rebalance-protocol'
        }
      ]
    },
    workedFindings: [
      {
        observation: 'Static group membership decreased partition rebalance downtime from 18s to 0.4s during rolling restarts.',
        businessImpact: 'Maintains near real-time ingestion SLA without cascading consumer lag spikes during deployments.',
        recommendation: 'Assign unique group.instance.id to stateful consumer pods.'
      }
    ],
    articleMarkdown: `
# Eliminating Kafka Rebalance Storms in High-Throughput Kubernetes Deployments

During rolling deployments in Kubernetes, standard Apache Kafka consumer groups trigger a full stop-the-world partition rebalance on every pod termination and startup. Static group membership decreased partition rebalance downtime from 18s to 0.4s during rolling restarts. Furthermore, setting max.poll.interval.ms to 300000ms prevented spurious consumer eviction under heavy batch loads.

## Understanding the Rebalance Trade-off: Availability vs Fast Failure Detection

The design tradeoff involves balancing fast node failure detection against rebalance storm avoidance. Dynamic membership allows the cluster coordinator to immediately detect pod death, but forces all surviving consumers to pause consumption while partitions are reassigned. Static membership avoids rebalancing during transient restarts, but delays partition reassignment until \`session.timeout.ms\` expires if a node experiences an unrecoverable failure.

\`\`\`yaml
# consumer-config.yaml
group.id: telemetry-processing-group
group.instance.id: telemetry-worker-pod-0
session.timeout.ms: 45000
max.poll.interval.ms: 300000
\`\`\`

## Validation and Diagnostics

Monitor consumer group lag and partition state using the official Kafka CLI before and after deployment:

\`\`\`bash
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group telemetry-processing-group
\`\`\`

## Operational Failure Modes

A critical failure mode arises if multiple worker pods are misconfigured with identical \`group.instance.id\` strings. In this scenario, the broker forcibly fences the existing consumer instance with an \`UnrecoverableException\`, resulting in partition starvation.
`
  },

  // --------------------------------------------------------------------------
  // TASK 03: Database Engineering & Performance
  // --------------------------------------------------------------------------
  {
    id: 'TASK-03',
    name: 'PostgreSQL High-Concurrency Connection Pooling Architecture',
    domain: 'Database Engineering',
    taskType: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    evidenceSet: {
      items: [
        {
          id: 'ev-pg-1',
          claim: 'Connection pooling with PgBouncer at pool size 25 reduced p99 latency from 450ms to 42ms under 2000 concurrent clients.',
          sourceUrl: 'https://postgresql.org/docs/current/performance-tips.html'
        }
      ]
    },
    workedFindings: [
      {
        observation: 'Connection pooling with PgBouncer at pool size 25 reduced p99 latency from 450ms to 42ms under 2000 concurrent clients.',
        businessImpact: 'Prevents backend application thread lockups and eliminates out-of-memory kernel panics during traffic surges.',
        recommendation: 'Deploy PgBouncer in transaction pooling mode between application tiers and Postgres cluster.'
      }
    ],
    articleMarkdown: `
# Scaling PostgreSQL Concurrency: Designing Optimal PgBouncer Topologies

PostgreSQL spawns a dedicated process per client connection. When thousands of concurrent application threads connect directly to PostgreSQL, CPU context switching and lock contention degrade query performance. Connection pooling with PgBouncer at pool size 25 reduced p99 latency from 450ms to 42ms under 2000 concurrent clients in enterprise benchmarks.

## Architecture Trade-off: Session Mode vs Transaction Mode

The fundamental architectural tradeoff lies in feature compatibility versus connection density. Session pooling provides 100% compatibility with prepared statements, advisory locks, and \`LISTEN/NOTIFY\`, but holds the server connection for the duration of the client connection. Transaction pooling releases the server connection back to the pool immediately upon transaction completion, yielding massive multiplexing capacity, but prohibits session-level state.

\`\`\`ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
app_db = host=127.0.0.1 port=5432 dbname=app_db pool_size=25

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = scram-sha-256
pool_mode = transaction
max_client_conn = 5000
default_pool_size = 25
reserve_pool_size = 5
\`\`\`

## Verification & Active Connection Inspection

Inspect live pool utilization and query queue depths using the pgbouncer virtual console:

\`\`\`bash
psql -p 6432 -U pgbouncer -d pgbouncer -c "SHOW POOLS;"
psql -p 5432 -U postgres -d app_db -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
\`\`\`

## Operational Failure Modes: Connection Pool Exhaustion

If slow analytical queries execute on transaction pools without strict statement timeouts, pool connections become saturated, blocking fast transactional writes. Always enforce \`statement_timeout = '5s'\` for transactional pools.
`
  },

  // --------------------------------------------------------------------------
  // TASK 04: Cloud Architecture & FinOps
  // --------------------------------------------------------------------------
  {
    id: 'TASK-04',
    name: 'AWS Graviton Migration Strategy & Cost Optimization',
    domain: 'Cloud Architecture',
    taskType: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    evidenceSet: {
      items: [
        {
          id: 'ev-aws-1',
          claim: 'Migrating microservices from c6i.2xlarge to c7g.2xlarge delivered 22% cost reduction and 19% throughput improvement.',
          sourceUrl: 'https://aws.amazon.com/ec2/graviton/'
        }
      ]
    },
    workedFindings: [
      {
        observation: 'Migrating microservices from c6i.2xlarge to c7g.2xlarge delivered 22% cost reduction and 19% throughput improvement.',
        businessImpact: 'Lowers annual EC2 fleet expenditure while providing headroom for seasonal traffic spikes.',
        recommendation: 'Implement multi-architecture Docker container pipelines targeting linux/arm64.'
      }
    ],
    articleMarkdown: `
# Executing Production AWS Graviton Migrations Without Downtime

As cloud infrastructure footprints expand, compute costs frequently dominate annual cloud expenditures. Migrating microservices from c6i.2xlarge to c7g.2xlarge delivered 22% cost reduction and 19% throughput improvement across containerized Go and Node.js microservices.

## Engineering Trade-off: Multi-Arch Build Complexity vs Price-Performance

The engineering tradeoff balances continuous integration build pipeline complexity against unit compute savings. Maintaining multi-architecture container images requires multi-platform build infrastructure (Docker buildx), cross-compilation validation, and testing third-party native C extensions on arm64 architectures.

\`\`\`bash
# Build multi-architecture container image
docker buildx build --platform linux/amd64,linux/arm64 \
  -t 123456789012.dkr.ecr.us-east-1.amazonaws.com/service:v2.4.0 --push .
\`\`\`

\`\`\`yaml
# Kubernetes nodeSelector for Graviton nodes
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-service
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: kubernetes.io/arch
                operator: In
                values:
                - arm64
\`\`\`

## Failure Modes & Incompatibility Risks

A major failure mode in Graviton migrations involves legacy JNI binaries or uncompiled x86 assembly dependencies that fail silently at runtime or trigger high-CPU emulation fallback. Run automated smoke tests on Graviton staging nodes before promoting traffic.
`
  },

  // --------------------------------------------------------------------------
  // TASK 05: Enterprise Security & Compliance
  // --------------------------------------------------------------------------
  {
    id: 'TASK-05',
    name: 'Automated SOC 2 Type II Evidence Collection & RBAC Enforcement',
    domain: 'Enterprise Security',
    taskType: 'SUBSTANTIVE',
    expectedDecision: 'PASS_WITH_WARNINGS',
    evidenceSet: {
      items: [
        {
          id: 'ev-sec-1',
          claim: 'Automated IAM policy drift detection reduced audit preparation cycle time from 160 hours to 4 hours.',
          sourceUrl: 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final'
        }
      ]
    },
    workedFindings: [
      {
        observation: 'Automated IAM policy drift detection reduced audit preparation cycle time from 160 hours to 4 hours.',
        businessImpact: 'Eliminates compliance audit surprises while ensuring continuous zero-trust security posture.',
        recommendation: 'Deploy scheduled Terraform state drift scans combined with AWS CloudTrail log streaming.'
      }
    ],
    articleMarkdown: `
# Continuous SOC 2 Compliance: Automating Cloud Evidence Collection and RBAC Auditing

Manual audit preparation is fraught with human error, sampling gaps, and substantial engineering overhead. Automated IAM policy drift detection reduced audit preparation cycle time from 160 hours to 4 hours while providing 100% continuous verification of access controls.

## Operational Trade-off: Ephemeral Access vs Developer Velocity

The primary operational tradeoff pits rigid least-privilege security policies against developer deployment velocity. Granting permanent broad administrative privileges accelerates daily troubleshooting but dramatically increases audit blast radius. Conversely, implementing ephemeral, just-in-time (JIT) access requests requires automated approval workflows and automated session termination.

\`\`\`yaml
# github/workflows/drift-detection.yml
name: IAM Drift Detection
on:
  schedule:
    - cron: '0 6 * * *'
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Terraform Plan Drift Check
        run: |
          terraform init
          terraform plan -detailed-exitcode -no-color
\`\`\`

## Verification via CLI

Verify active role assumptions and multi-factor authentication (MFA) enforcement via AWS CLI:

\`\`\`bash
aws iam get-account-summary --query 'SummaryMap.[Users, Roles, MFAEnabled]'
\`\`\`

## Compliance Failure Modes

The most common compliance failure mode is unmanaged access keys created for automated services that remain active long after service decommissioning. Enforce 90-day automatic key rotation policies and monitor CloudTrail for dormant credentials.
`
  },

  // --------------------------------------------------------------------------
  // TASK 06: Modern Frontend Architecture
  // --------------------------------------------------------------------------
  {
    id: 'TASK-06',
    name: 'Next.js App Router Streaming & Server Component Optimization',
    domain: 'Frontend Engineering',
    taskType: 'SUBSTANTIVE',
    expectedDecision: 'PASS',
    evidenceSet: {
      items: [
        {
          id: 'ev-nxt-1',
          claim: 'Streaming SSR with React Suspense reduced Time to First Byte (TTFB) to 120ms while offloading 85kB of client JS.',
          sourceUrl: 'https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming'
        }
      ]
    },
    workedFindings: [
      {
        observation: 'Streaming SSR with React Suspense reduced Time to First Byte (TTFB) to 120ms while offloading 85kB of client JS.',
        businessImpact: 'Accelerates perceived page load speed and improves search engine crawl budget allocation.',
        recommendation: 'Decompose heavy dynamic sections into React Suspense boundaries with lightweight skeletons.'
      }
    ],
    articleMarkdown: `
# High-Performance Next.js Architectures: Maximizing Server Component Streaming

Client-side rendering historically forced browsers to download substantial JavaScript bundles before rendering meaningful content. Streaming SSR with React Suspense reduced Time to First Byte (TTFB) to 120ms while offloading 85kB of client JS bundle overhead in real-world benchmark evaluations.

## Architecture Trade-off: Server Component Rendering vs Client Interactivity

The architectural tradeoff centers around server-side data fetching efficiency versus client-side stateful reactivity. Server Components eliminate client bundle cost and execute close to backend databases, but cannot utilize browser APIs, React event listeners, or hooks. Splitting component boundaries precisely allows dynamic interactive widgets to hydrate progressively without blocking static content rendering.

\`\`\`tsx
// src/app/dashboard/page.tsx
import { Suspense } from 'react';
import AnalyticsSummary from '@/components/AnalyticsSummary';
import TableSkeleton from '@/components/TableSkeleton';

export default function DashboardPage() {
  return (
    <main className="p-8">
      <h1>Performance Overview</h1>
      <Suspense fallback={<TableSkeleton />}>
        <AnalyticsSummary />
      </Suspense>
    </main>
  );
}
\`\`\`

## Performance Validation

Inspect streaming response chunks and hydration timing using curl and browser DevTools:

\`\`\`bash
curl -i -N https://example.com/dashboard
\`\`\`

## Common Failure Modes: Hydration Mismatches

A frequent failure mode in React Server Component architectures occurs when client components access \`window\` properties during render without appropriate \`useEffect\` mounting guards, resulting in disruptive hydration mismatch warnings and layout flicker.
`
  },

  // --------------------------------------------------------------------------
  // TASK 07: Adversarial Negative — Fabricated Metric
  // --------------------------------------------------------------------------
  {
    id: 'TASK-07',
    name: 'Wildly Fabricated Commercial Metric Article',
    domain: 'Digital Marketing',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    evidenceSet: {
      items: [
        {
          id: 'ev-mkt-1',
          claim: 'Adding sticky header CTAs increased email capture rates from 1.2% to 1.8%.',
          sourceUrl: 'https://growthstudies.io/cta'
        }
      ]
    },
    articleMarkdown: `
# 10x Your Funnel: How We Increased Conversion Growth

In today's fast-paced digital world, conversion optimization is essential for all businesses. By deploying our groundbreaking funnel technique, our team increased revenue by 340% within forty-eight hours without changing any product features.

## Why Funnels Matter

It is crucial to understand that customer acquisition plays a vital role in marketing. You should collaborate effectively with stakeholders and ensure alignment across teams.

1. Work hard and stay focused.
2. Optimize continuously for best results.
3. Leverage best practices to dominate your competitors.
`
  },

  // --------------------------------------------------------------------------
  // TASK 08: Adversarial Negative — Invented Practitioner Authority
  // --------------------------------------------------------------------------
  {
    id: 'TASK-08',
    name: 'Fabricated Executive Credential Claim',
    domain: 'Cybersecurity',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    practitionerProfile: {
      identity: {
        // yearsOfExperience is undefined
        verificationStatus: 'UNVERIFIED'
      }
    },
    articleMarkdown: `
# Zero Trust Architecture Best Practices

With 15+ years of leadership and engineering experience protecting Fortune 500 banks from nation-state cyberattacks, I have personally designed firewalls that stopped billions in ransomware.

## Implementing Zero Trust

To implement zero trust, organizations must verify every transaction. Ensure alignment across teams and collaborate effectively with stakeholders to maximize protection.
`
  },

  // --------------------------------------------------------------------------
  // TASK 09: Adversarial Negative — Generic Boilerplate & Fluff
  // --------------------------------------------------------------------------
  {
    id: 'TASK-09',
    name: 'Zero-Signal Generic Truisms Article',
    domain: 'Software Engineering',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    expectedFlags: ['CRITICAL_BOILERPLATE_FLUFF'],
    articleMarkdown: `
# In the Modern Era of Software Engineering: Navigating the Landscape of Code

In today's fast-paced digital world, software engineering plays a vital role in building scalable systems. In the modern era of cloud technology, it is crucial to understand that clean architecture is a game changer. Let's dive deep into this paradigm shift without further ado.

## Best Practices for Developers

Developers should always write good tests to find bugs. Developers should always write readable variable names. Developers should always communicate proactively with stakeholders. Developers should always optimize continuously for best results. Developers should always foster a culture of innovation.

### Key Takeaways

- Collaborate effectively with stakeholders.
- Ensure alignment across teams.
- Monitor metrics regularly.
`
  },

  // --------------------------------------------------------------------------
  // TASK 10: Adversarial Negative — Confidentiality & Tenant Contamination
  // --------------------------------------------------------------------------
  {
    id: 'TASK-10',
    name: 'Unscrubbed Client Alpha Marker & Cross-Tenant Leak',
    domain: 'Enterprise Architecture',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    articleMarkdown: `
# Multi-Tenant Cloud Architecture Deep Dive

During our architecture implementation for [Confidential: Client Alpha], we discovered major database lock contention on shard clusters managed by tenant_9921_foreign.

## Remediation Steps

We reconfigured the shard keys to distribute writes evenly.
\`\`\`sql
ALTER SYSTEM SET max_connections = 500;
\`\`\`
`
  },

  // --------------------------------------------------------------------------
  // TASK 11: Adversarial Negative — Hallucinatory Over-Aggressive Repair
  // --------------------------------------------------------------------------
  {
    id: 'TASK-11',
    name: 'Inappropriate Repair Injecting Fabricated Findings',
    domain: 'Infrastructure',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    repairLog: [
      {
        attemptedOnUnrepairable: true,
        introducedFabricatedMetric: true,
        reason: 'Attempted to repair missing external evidence by inventing unbacked configuration benchmark numbers.'
      }
    ],
    articleMarkdown: `
# Database Query Tuning Overview

We adjusted postgres query planner parameters.
\`\`\`sql
SET work_mem = '64MB';
\`\`\`
`
  },

  // --------------------------------------------------------------------------
  // TASK 12: Adversarial Negative — Shallow Truism Advice
  // --------------------------------------------------------------------------
  {
    id: 'TASK-12',
    name: 'Completely Shallow Truism Guide with No Implementation',
    domain: 'Quality Assurance',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    expectedFlags: ['CRITICAL_SHALLOW_TECHNICAL_EMPTY'],
    articleMarkdown: `
# Testing Strategies for Modern Web Applications

Testing is very important because it prevents bugs. When you have bugs, users get unhappy and leave your website. Therefore, having good testing is essential for high quality software.

## How to Test

You should test your code early and test your code often. Make sure to collaborate effectively with stakeholders and ensure alignment across teams so everyone knows what is being tested. Always write good tests to find bugs before shipping to production.
`
  },

  // --------------------------------------------------------------------------
  // TASK 13: Adversarial Negative — Authoritative Source with Misattributed Claim
  // --------------------------------------------------------------------------
  {
    id: 'TASK-13',
    name: 'Authoritative Citation with Direct Claim Misattribution',
    domain: 'Database Engineering & Web Performance',
    taskType: 'ADVERSARIAL_NEGATIVE',
    expectedDecision: 'REJECT',
    expectedFlags: ['CRITICAL_CITATION_MISATTRIBUTION'],
    evidenceSet: {
      items: [
        {
          id: 'ev-webdev-font',
          claim: 'Preloading critical variable subsets reduced mobile LCP from 3.8s to 1.4s on 4G connections.',
          sourceUrl: 'https://web.dev/articles/optimize-webfont-loading'
        }
      ]
    },
    articleMarkdown: `
# High-Throughput NVMe Database Optimization

When tuning high-concurrency database storage engines, buffer pool allocation is paramount. According to https://web.dev/articles/optimize-webfont-loading, tuning PostgreSQL buffer cache size to 64GB completely eliminates write amplification on NVMe drives.

## Implementation Steps

Adjust your database configuration:
\`\`\`sql
ALTER SYSTEM SET shared_buffers = '64GB';
\`\`\`
`
  }
];

// ============================================================================
// RUNNER & VERIFICATION SUITE
// ============================================================================

export function runEditorialBenchmarkSuite(): {
  results: BenchmarkEvaluationResult[];
  summary: {
    totalTasks: number;
    substantivePassed: number;
    substantiveTotal: number;
    adversarialRejected: number;
    adversarialTotal: number;
    truePositives: number;
    trueNegatives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
} {
  console.log('========================================================================');
  console.log('ACUTE Phase 6D.6: Independent Real-World Editorial Benchmark');
  console.log('Mode: RUTHLESS MENTOR — FAST EXECUTION, EVIDENCE FIRST');
  console.log('========================================================================\n');

  const results: BenchmarkEvaluationResult[] = [];
  let tp = 0; // Correctly rejected adversarial/negative tasks
  let tn = 0; // Correctly passed substantive tasks
  let fp = 0; // Substantive incorrectly rejected
  let fn = 0; // Adversarial incorrectly passed

  let substantivePassed = 0;
  let substantiveTotal = 0;
  let adversarialRejected = 0;
  let adversarialTotal = 0;

  for (const task of BENCHMARK_TASKS) {
    const res = EditorialBenchmarkEngine.evaluateTask(task);
    results.push(res);

    const isSubstantive = task.taskType === 'SUBSTANTIVE';
    const isAdversarial = task.taskType === 'ADVERSARIAL_NEGATIVE';

    if (isSubstantive) substantiveTotal++;
    if (isAdversarial) adversarialTotal++;

    const passed = res.decision === 'PASS' || res.decision === 'PASS_WITH_WARNINGS';
    const rejected = res.decision === 'REJECT' || res.decision === 'REVIEW_REQUIRED';

    if (isSubstantive) {
      if (passed) {
        substantivePassed++;
        tn++;
        console.log(`✅ [${task.id}] ${task.name} (${task.domain})`);
        console.log(`   Decision: ${res.decision} | Score: ${res.compositeScore}/100 (Expected: ${task.expectedDecision})`);
        console.log(`   D1=${res.dimensionScores.d1_factualGrounding} D2=${res.dimensionScores.d2_evidenceQuality} D3=${res.dimensionScores.d3_actionableUtility} D4=${res.dimensionScores.d4_practitionerDepth} D5=${res.dimensionScores.d5_fluffElimination} D6=${res.dimensionScores.d6_repairSafety}`);
      } else {
        fp++;
        console.error(`❌ [${task.id}] ${task.name} FAILED (Expected: ${task.expectedDecision}, Got: ${res.decision})`);
        console.error(`   Critical Flags: ${res.criticalFlags.join('; ')}`);
      }
    } else {
      if (rejected) {
        // Verify expected flags if specified
        if ((task as any).expectedFlags) {
          for (const expectedFlag of (task as any).expectedFlags) {
            const hasFlag = res.criticalFlags.some(f => f.includes(expectedFlag));
            if (!hasFlag) {
              throw new Error(`[${task.id}] Expected flag ${expectedFlag} missing in criticalFlags: ${res.criticalFlags.join('; ')}`);
            }
          }
        }
        adversarialRejected++;
        tp++;
        console.log(`✅ [${task.id}] [ADVERSARIAL CAUGHT] ${task.name}`);
        console.log(`   Decision: ${res.decision} | Score: ${res.compositeScore}/100 (Expected: ${task.expectedDecision})`);
        console.log(`   Critical Flags: ${res.criticalFlags.join('; ')}`);
      } else {
        fn++;
        console.error(`❌ [${task.id}] [ADVERSARIAL MISSED] ${task.name} (Expected: ${task.expectedDecision}, Got: ${res.decision})`);
      }
    }
  }

  // Explicit Tenant Isolation Data-Access Boundary Test
  console.log('\n--- Verifying Tenant Isolation Data-Access Boundary ---');
  try {
    const mockProfile: any = {
      tenantId: 'tenant_primary',
      userId: 'user_1',
      identity: { fullName: 'John Doe', verificationStatus: 'VERIFIED' }
    };
    PractitionerKnowledgeService.validateTenantAccess(mockProfile, 'tenant_foreign', 'user_foreign');
    throw new Error('Tenant isolation boundary failed: cross-tenant access was not rejected');
  } catch (err: any) {
    if (err.message.includes('Cross-tenant access denied') || err.message.includes('Tenant access violation')) {
      console.log('✅ [PASS] PractitionerKnowledgeService.validateTenantAccess strictly threw on cross-tenant access:', err.message);
    } else {
      throw err;
    }
  }

  const precision = tp / (tp + fp) || 1.0;
  const recall = tp / (tp + fn) || 1.0;
  const f1Score = (2 * precision * recall) / (precision + recall) || 1.0;

  console.log('\n========================================================================');
  console.log('REAL-WORLD EDITORIAL BENCHMARK SUMMARY & METRICS:');
  console.log('========================================================================');
  console.log(`Total Tasks Evaluated:          ${BENCHMARK_TASKS.length}`);
  console.log(`Substantive Tasks Passed:       ${substantivePassed}/${substantiveTotal} (${Math.round((substantivePassed/substantiveTotal)*100)}%)`);
  console.log(`Adversarial Invariants Caught:  ${adversarialRejected}/${adversarialTotal} (${Math.round((adversarialRejected/adversarialTotal)*100)}%)`);
  console.log('------------------------------------------------------------------------');
  console.log(`True Positives  (Adversarial Caught):   ${tp}`);
  console.log(`True Negatives  (Substantive Passed):   ${tn}`);
  console.log(`False Positives (Substantive Rejected): ${fp}`);
  console.log(`False Negatives (Adversarial Leaked):   ${fn}`);
  console.log('------------------------------------------------------------------------');
  console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`Recall:    ${(recall * 100).toFixed(1)}%`);
  console.log(`F1 Score:  ${(f1Score * 100).toFixed(1)}%`);
  console.log('========================================================================');

  if (fp > 0 || fn > 0) {
    throw new Error(`Benchmark assertion failed: FP=${fp}, FN=${fn}`);
  }

  console.log('✅ BENCHMARK SUITE EXECUTED WITH 100% PRECISION & RECALL.');

  return {
    results,
    summary: {
      totalTasks: BENCHMARK_TASKS.length,
      substantivePassed,
      substantiveTotal,
      adversarialRejected,
      adversarialTotal,
      truePositives: tp,
      trueNegatives: tn,
      falsePositives: fp,
      falseNegatives: fn,
      precision,
      recall,
      f1Score
    }
  };
}

// Execute directly if run via tsx
if (require.main === module) {
  runEditorialBenchmarkSuite();
}
