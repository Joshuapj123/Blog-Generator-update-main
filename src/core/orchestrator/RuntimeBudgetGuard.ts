// src/core/orchestrator/RuntimeBudgetGuard.ts

export interface RuntimeBudgetOptions {
  requestStartTs?: number;
  configuredLimitMs?: number;
  reservedFinalizeMs?: number;
}

export interface RuntimeBudgetDiagnostics {
  configuredLimit: number;
  softLimit: number;
  elapsedMs: number;
  remainingMs: number;
  reservedFinalizeMs: number;
  stageDurations: Record<string, number>;
  sectionDurations: Record<string, number>;
  llmCallCount: number;
  budgetGuardTriggered: boolean;
  guardAction?: string;
  geminiModel?: string;
}

export class RuntimeBudgetGuard {
  private startTime: number;
  private configuredLimitMs: number;
  private reservedFinalizeMs: number;
  private softLimitMs: number;
  private stageDurations: Record<string, number> = {};
  private sectionDurations: Record<string, number> = {};
  private llmCallCount: number = 0;
  private budgetGuardTriggered: boolean = false;
  private guardAction?: string;

  constructor(options?: RuntimeBudgetOptions) {
    this.startTime = options?.requestStartTs || Date.now();
    // Default 270s allows 30s buffer before Vercel 300s wall
    this.configuredLimitMs = options?.configuredLimitMs ?? 270000;
    // Reserved 45s ensures REVIEW, LQE, FINALIZE, and SSE complete event always finish safely
    this.reservedFinalizeMs = options?.reservedFinalizeMs ?? 45000;
    this.softLimitMs = Math.max(0, this.configuredLimitMs - this.reservedFinalizeMs);
  }

  public getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  public getRemainingMs(): number {
    return Math.max(0, this.configuredLimitMs - this.getElapsedMs());
  }

  public getSoftLimitMs(): number {
    return this.softLimitMs;
  }

  public getConfiguredLimitMs(): number {
    return this.configuredLimitMs;
  }

  public getReservedFinalizeMs(): number {
    return this.reservedFinalizeMs;
  }

  public incrementLLMCalls(): void {
    this.llmCallCount++;
  }

  public recordStageDuration(stage: string, durationMs: number): void {
    this.stageDurations[stage] = Math.round(durationMs);
  }

  public recordSectionDuration(heading: string, durationMs: number): void {
    this.sectionDurations[heading] = Math.round(durationMs);
  }

  /**
   * Checks whether there is sufficient remaining budget to execute a stage
   * without endangering the reserved finalization headroom.
   */
  public hasBudgetForStage(stage: string, estimatedCostMs: number = 20000): boolean {
    const remaining = this.getRemainingMs();
    const needed = this.reservedFinalizeMs + estimatedCostMs;
    const allowed = remaining >= needed;
    if (!allowed && !this.budgetGuardTriggered) {
      this.triggerGuard(`STAGE_SKIPPED_${stage}_REMAINING_${remaining}MS_NEEDED_${needed}MS`);
    }
    return allowed;
  }

  /**
   * Checks whether there is sufficient remaining budget to generate another section draft.
   */
  public hasBudgetForSection(estimatedSecCostMs: number = 15000): boolean {
    const remaining = this.getRemainingMs();
    const needed = this.reservedFinalizeMs + estimatedSecCostMs;
    const allowed = remaining >= needed;
    if (!allowed && !this.budgetGuardTriggered) {
      this.triggerGuard(`SECTIONS_BOUNDED_REMAINING_${remaining}MS_NEEDED_${needed}MS`);
    }
    return allowed;
  }

  /**
   * Checks whether there is sufficient remaining budget to execute an optional repair iteration.
   */
  public hasBudgetForRepair(estimatedRepairCostMs: number = 20000): boolean {
    const remaining = this.getRemainingMs();
    const needed = this.reservedFinalizeMs + estimatedRepairCostMs;
    const allowed = remaining >= needed;
    if (!allowed && !this.budgetGuardTriggered) {
      this.triggerGuard(`REPAIR_BYPASSED_REMAINING_${remaining}MS_NEEDED_${needed}MS`);
    }
    return allowed;
  }

  public triggerGuard(action: string): void {
    this.budgetGuardTriggered = true;
    this.guardAction = action;
    console.warn(`[RuntimeBudgetGuard] Guard activated: ${action}. Preserving ${this.reservedFinalizeMs}ms finalization headroom.`);
  }

  public isGuardTriggered(): boolean {
    return this.budgetGuardTriggered;
  }

  public getDiagnostics(): RuntimeBudgetDiagnostics {
    return {
      configuredLimit: this.configuredLimitMs,
      softLimit: this.softLimitMs,
      elapsedMs: this.getElapsedMs(),
      remainingMs: this.getRemainingMs(),
      reservedFinalizeMs: this.reservedFinalizeMs,
      stageDurations: { ...this.stageDurations },
      sectionDurations: { ...this.sectionDurations },
      llmCallCount: this.llmCallCount,
      budgetGuardTriggered: this.budgetGuardTriggered,
      guardAction: this.guardAction,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    };
  }
}
