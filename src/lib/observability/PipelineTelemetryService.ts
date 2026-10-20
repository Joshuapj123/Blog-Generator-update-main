// src/lib/observability/PipelineTelemetryService.ts

import {
  PipelineStageName,
  PipelineEventType,
  PipelineOutcome,
  NormalizedFailureCategory,
  PipelineOperationalEvent,
  SanitizedOperationalDetails,
  sanitizeOperationalText,
  classifyPipelineFailure
} from '@/core/contracts/observability';

export interface AggregateOperationalMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  stageFailureCounts: Record<PipelineStageName, number>;
  failureCategoryCounts: Record<NormalizedFailureCategory, number>;
  providerErrorCount: number;
  groundingRejectionCount: number;
  providerVsGroundingRatio: {
    providerErrorFraction: number;
    groundingRejectionFraction: number;
  };
  repairMetrics: {
    totalRepairAttempts: number;
    repairSuccesses: number;
    repairFailures: number;
    revalidationFailures: number;
    repairSuccessRate: number; // 0 to 1
  };
  crawlMetrics: {
    totalCrawls: number;
    sparseEvidenceCount: number;
    crawlFailureCount: number;
    crawlTimeoutCount: number;
  };
  distributionMetrics: {
    totalRequests: number;
    rejectedCount: number;
    successCount: number;
    rejectionRate: number; // 0 to 1
  };
  stageTimeoutCounts: Record<PipelineStageName, number>;
  mostFailingStage: PipelineStageName | 'NONE';
}

export class PipelineTelemetryService {
  private static instance: PipelineTelemetryService;

  private events: PipelineOperationalEvent[] = [];
  private runIndex: Map<string, PipelineOperationalEvent[]> = new Map();

  // Aggregate counters
  private totalRunsSet: Set<string> = new Set();
  private completedRunsSet: Set<string> = new Set();
  private failedRunsSet: Set<string> = new Set();

  private stageFailureCounts: Partial<Record<PipelineStageName, number>> = {};
  private failureCategoryCounts: Partial<Record<NormalizedFailureCategory, number>> = {};
  private stageTimeoutCounts: Partial<Record<PipelineStageName, number>> = {};

  private providerErrorCount = 0;
  private groundingRejectionCount = 0;

  private totalRepairAttempts = 0;
  private repairSuccesses = 0;
  private repairFailures = 0;
  private revalidationFailures = 0;

  private totalCrawls = 0;
  private sparseEvidenceCount = 0;
  private crawlFailureCount = 0;
  private crawlTimeoutCount = 0;

  private totalDistributionRequests = 0;
  private distributionRejectedCount = 0;
  private distributionSuccessCount = 0;

  public static getInstance(): PipelineTelemetryService {
    if (!PipelineTelemetryService.instance) {
      PipelineTelemetryService.instance = new PipelineTelemetryService();
    }
    return PipelineTelemetryService.instance;
  }

  /**
   * Reset all events and metrics. Useful for isolated test suites.
   */
  public reset(): void {
    this.events = [];
    this.runIndex.clear();
    this.totalRunsSet.clear();
    this.completedRunsSet.clear();
    this.failedRunsSet.clear();

    this.stageFailureCounts = {};
    this.failureCategoryCounts = {};
    this.stageTimeoutCounts = {};

    this.providerErrorCount = 0;
    this.groundingRejectionCount = 0;

    this.totalRepairAttempts = 0;
    this.repairSuccesses = 0;
    this.repairFailures = 0;
    this.revalidationFailures = 0;

    this.totalCrawls = 0;
    this.sparseEvidenceCount = 0;
    this.crawlFailureCount = 0;
    this.crawlTimeoutCount = 0;

    this.totalDistributionRequests = 0;
    this.distributionRejectedCount = 0;
    this.distributionSuccessCount = 0;
  }

  /**
   * Record a privacy-safe operational event.
   * Sanitizes all text fields and enforces strict field allowlist.
   */
  public recordEvent(rawEvent: {
    runId: string;
    correlationId?: string;
    parentEventId?: string;
    stage: PipelineStageName;
    eventType: PipelineEventType;
    timestamp?: string;
    durationMs?: number;
    outcome: PipelineOutcome;
    failureCategory?: NormalizedFailureCategory;
    retryCount?: number;
    details?: SanitizedOperationalDetails;
  }): PipelineOperationalEvent {
    try {
      // 1. Sanitize allowlisted details
      let sanitizedDetails: SanitizedOperationalDetails | undefined;
      if (rawEvent.details) {
        sanitizedDetails = {
          reason: rawEvent.details.reason ? sanitizeOperationalText(rawEvent.details.reason) : undefined,
          statusCode: rawEvent.details.statusCode ? Number(rawEvent.details.statusCode) : undefined,
          code: rawEvent.details.code ? sanitizeOperationalText(rawEvent.details.code, 50) : undefined,
          retryAfterSec: rawEvent.details.retryAfterSec !== undefined ? Number(rawEvent.details.retryAfterSec) : undefined,
          durationMs: rawEvent.details.durationMs !== undefined ? Number(rawEvent.details.durationMs) : undefined,
          retryCount: rawEvent.details.retryCount !== undefined ? Number(rawEvent.details.retryCount) : undefined,
          unrepairableClaimsCount: rawEvent.details.unrepairableClaimsCount !== undefined ? Number(rawEvent.details.unrepairableClaimsCount) : undefined,
          groundingFailureBreakdown: rawEvent.details.groundingFailureBreakdown ? { ...rawEvent.details.groundingFailureBreakdown } : undefined,
          channelsCount: rawEvent.details.channelsCount !== undefined ? Number(rawEvent.details.channelsCount) : undefined,
          channel: rawEvent.details.channel ? sanitizeOperationalText(rawEvent.details.channel, 30) : undefined,
          format: rawEvent.details.format ? sanitizeOperationalText(rawEvent.details.format, 20) : undefined,
          sourceKeyword: rawEvent.details.sourceKeyword ? sanitizeOperationalText(rawEvent.details.sourceKeyword, 60) : undefined,
          sanitizedMessage: rawEvent.details.sanitizedMessage ? sanitizeOperationalText(rawEvent.details.sanitizedMessage) : undefined,
          targetDomain: rawEvent.details.targetDomain ? sanitizeOperationalText(rawEvent.details.targetDomain, 60) : undefined,
        };
      }

      const event: PipelineOperationalEvent = {
        runId: rawEvent.runId,
        correlationId: rawEvent.correlationId,
        parentEventId: rawEvent.parentEventId,
        stage: rawEvent.stage,
        eventType: rawEvent.eventType,
        timestamp: rawEvent.timestamp || new Date().toISOString(),
        durationMs: rawEvent.durationMs,
        outcome: rawEvent.outcome,
        failureCategory: rawEvent.failureCategory,
        retryCount: rawEvent.retryCount,
        details: sanitizedDetails,
      };

      // Store in ring buffer (up to 1000 events)
      this.events.push(event);
      if (this.events.length > 1000) {
        this.events.shift();
      }

      // Index by runId
      if (!this.runIndex.has(event.runId)) {
        this.runIndex.set(event.runId, []);
      }
      this.runIndex.get(event.runId)!.push(event);

      // Update aggregate metrics
      this.updateMetricsFromEvent(event);

      return event;
    } catch (telemetryErr) {
      console.warn('[PipelineTelemetryService] Internal telemetry recording safely suppressed:', telemetryErr);
      return {
        runId: rawEvent?.runId || 'unknown',
        stage: rawEvent?.stage || 'INTAKE',
        eventType: rawEvent?.eventType || 'STAGE_FAILED',
        timestamp: new Date().toISOString(),
        outcome: rawEvent?.outcome || 'FAILURE',
        details: { reason: 'Telemetry processing suppressed internal error' }
      };
    }
  }

  private updateMetricsFromEvent(event: PipelineOperationalEvent): void {
    this.totalRunsSet.add(event.runId);

    if (event.eventType === 'PIPELINE_COMPLETE') {
      this.completedRunsSet.add(event.runId);
      this.failedRunsSet.delete(event.runId);
    } else if (
      event.eventType === 'PIPELINE_FAILED' ||
      event.outcome === 'FAILURE' ||
      event.outcome === 'REJECTED'
    ) {
      if (!this.completedRunsSet.has(event.runId)) {
        this.failedRunsSet.add(event.runId);
      }
    }

    // Stage failure metrics
    if (event.outcome === 'FAILURE' || event.eventType === 'STAGE_FAILED') {
      this.stageFailureCounts[event.stage] = (this.stageFailureCounts[event.stage] || 0) + 1;
    }

    // Categorized failure metrics
    if (event.failureCategory) {
      this.failureCategoryCounts[event.failureCategory] = (this.failureCategoryCounts[event.failureCategory] || 0) + 1;

      // Provider vs Grounding classification
      if (
        event.failureCategory === 'PROVIDER_RATE_LIMIT' ||
        event.failureCategory === 'PROVIDER_AUTH_FAILURE' ||
        event.failureCategory === 'PROVIDER_QUOTA_EXHAUSTED' ||
        event.failureCategory === 'PROVIDER_TRANSIENT_FAILURE'
      ) {
        this.providerErrorCount++;
      } else if (
        event.failureCategory === 'GROUNDING_REJECTION' ||
        event.failureCategory === 'REPAIR_UNAVAILABLE' ||
        event.failureCategory === 'REPAIR_REVALIDATION_FAILED'
      ) {
        this.groundingRejectionCount++;
      }

      // Timeout metrics
      if (
        event.failureCategory === 'CRAWL_TIMEOUT' ||
        event.failureCategory === 'RESEARCH_TIMEOUT' ||
        event.failureCategory === 'BUDGET_EXCEEDED'
      ) {
        this.stageTimeoutCounts[event.stage] = (this.stageTimeoutCounts[event.stage] || 0) + 1;
      }
    }

    // Repair metrics
    if (event.stage === 'REPAIR' || event.eventType === 'REPAIR_ATTEMPT') {
      this.totalRepairAttempts++;
      if (event.outcome === 'SUCCESS') {
        this.repairSuccesses++;
      } else if (event.outcome === 'FAILURE') {
        this.repairFailures++;
      }
    }

    if (event.failureCategory === 'REPAIR_REVALIDATION_FAILED') {
      this.revalidationFailures++;
    }

    // Crawl metrics
    if (event.stage === 'CRAWL') {
      if (event.eventType === 'STAGE_START') {
        this.totalCrawls++;
      }
      if (event.failureCategory === 'SPARSE_EVIDENCE') {
        this.sparseEvidenceCount++;
      } else if (event.failureCategory === 'CRAWL_FAILURE') {
        this.crawlFailureCount++;
      } else if (event.failureCategory === 'CRAWL_TIMEOUT') {
        this.crawlTimeoutCount++;
      }
    }

    // Distribution metrics
    if (event.stage === 'DISTRIBUTION') {
      if (event.eventType === 'STAGE_START') {
        this.totalDistributionRequests++;
      }
      if (event.outcome === 'REJECTED' || event.failureCategory === 'DISTRIBUTION_FAILURE') {
        this.distributionRejectedCount++;
      } else if (event.outcome === 'SUCCESS') {
        this.distributionSuccessCount++;
      }
    }
  }

  public getEventsForRun(runId: string): PipelineOperationalEvent[] {
    return this.runIndex.get(runId) || [];
  }

  public getAllEvents(): PipelineOperationalEvent[] {
    return [...this.events];
  }

  public getOperationalMetrics(): AggregateOperationalMetrics {
    const totalRuns = this.totalRunsSet.size;
    const completedRuns = this.completedRunsSet.size;
    const failedRuns = this.failedRunsSet.size;

    // Fill all stage failure counts with 0 defaults
    const allStages: PipelineStageName[] = [
      'INTAKE', 'CRAWL', 'DISCOVER', 'SEARCH_OPPORTUNITY', 'RESEARCH',
      'ANALYZE', 'GEO_INTELLIGENCE', 'PLAN', 'ASSET_STRATEGY', 'GENERATE',
      'REVIEW', 'REPAIR', 'FINALIZE', 'STORAGE', 'EXPORT', 'DISTRIBUTION'
    ];
    const fullStageFailures: Record<PipelineStageName, number> = {} as any;
    let mostFailingStage: PipelineStageName | 'NONE' = 'NONE';
    let maxStageFailures = 0;

    for (const st of allStages) {
      const count = this.stageFailureCounts[st] || 0;
      fullStageFailures[st] = count;
      if (count > maxStageFailures) {
        maxStageFailures = count;
        mostFailingStage = st;
      }
    }

    // Fill failure categories
    const allCategories: NormalizedFailureCategory[] = [
      'CRAWL_TIMEOUT', 'CRAWL_FAILURE', 'SPARSE_EVIDENCE', 'RESEARCH_TIMEOUT',
      'RESEARCH_FAILURE', 'PROVIDER_RATE_LIMIT', 'PROVIDER_AUTH_FAILURE',
      'PROVIDER_QUOTA_EXHAUSTED', 'PROVIDER_TRANSIENT_FAILURE', 'DRAFTING_FAILURE',
      'GROUNDING_REJECTION', 'REPAIR_UNAVAILABLE', 'REPAIR_REVALIDATION_FAILED',
      'EXPORT_FAILURE', 'PUBLICATION_REJECTED', 'DISTRIBUTION_FAILURE',
      'BUDGET_EXCEEDED', 'UNKNOWN_FAILURE'
    ];
    const fullFailureCategories: Record<NormalizedFailureCategory, number> = {} as any;
    for (const cat of allCategories) {
      fullFailureCategories[cat] = this.failureCategoryCounts[cat] || 0;
    }

    // Ratio of Provider vs Grounding
    const totalAttributed = this.providerErrorCount + this.groundingRejectionCount;
    const providerErrorFraction = totalAttributed > 0 ? this.providerErrorCount / totalAttributed : 0;
    const groundingRejectionFraction = totalAttributed > 0 ? this.groundingRejectionCount / totalAttributed : 0;

    // Repair success rate
    const repairAttempts = Math.max(this.totalRepairAttempts, this.repairSuccesses + this.repairFailures);
    const repairSuccessRate = repairAttempts > 0 ? this.repairSuccesses / repairAttempts : 0;

    // Distribution rejection rate
    const distTotal = Math.max(this.totalDistributionRequests, this.distributionRejectedCount + this.distributionSuccessCount);
    const rejectionRate = distTotal > 0 ? this.distributionRejectedCount / distTotal : 0;

    // Timeouts
    const fullTimeouts: Record<PipelineStageName, number> = {} as any;
    for (const st of allStages) {
      fullTimeouts[st] = this.stageTimeoutCounts[st] || 0;
    }

    return {
      totalRuns,
      completedRuns,
      failedRuns,
      stageFailureCounts: fullStageFailures,
      failureCategoryCounts: fullFailureCategories,
      providerErrorCount: this.providerErrorCount,
      groundingRejectionCount: this.groundingRejectionCount,
      providerVsGroundingRatio: {
        providerErrorFraction: parseFloat(providerErrorFraction.toFixed(4)),
        groundingRejectionFraction: parseFloat(groundingRejectionFraction.toFixed(4)),
      },
      repairMetrics: {
        totalRepairAttempts: repairAttempts,
        repairSuccesses: this.repairSuccesses,
        repairFailures: this.repairFailures,
        revalidationFailures: this.revalidationFailures,
        repairSuccessRate: parseFloat(repairSuccessRate.toFixed(4)),
      },
      crawlMetrics: {
        totalCrawls: this.totalCrawls,
        sparseEvidenceCount: this.sparseEvidenceCount,
        crawlFailureCount: this.crawlFailureCount,
        crawlTimeoutCount: this.crawlTimeoutCount,
      },
      distributionMetrics: {
        totalRequests: distTotal,
        rejectedCount: this.distributionRejectedCount,
        successCount: this.distributionSuccessCount,
        rejectionRate: parseFloat(rejectionRate.toFixed(4)),
      },
      stageTimeoutCounts: fullTimeouts,
      mostFailingStage,
    };
  }
}
