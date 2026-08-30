import { DistributionProvider } from '@/core/contracts/distribution-providers';
import { DistributionResult } from '@/core/contracts/schemas';

export class WebhookDistributionProvider implements DistributionProvider {
  public channelName = 'webhook';

  async validate(payload: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (!payload.title) errors.push('Payload is missing title');
    if (!payload.body) errors.push('Payload is missing body markdown content');
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async publish(payload: any, options?: { dryRun?: boolean; jobId?: string }): Promise<DistributionResult> {
    const startTime = Date.now();
    const jobId = options?.jobId || 'job_' + Math.random().toString(36).substring(2, 9);
    
    // 1. Validation check
    const val = await this.validate(payload);
    if (!val.valid) {
      return {
        channel: 'webhook',
        status: 'FAILED',
        error: `Validation failed: ${val.errors?.join(', ')}`,
        telemetry: { durationMs: Date.now() - startTime, attempts: 1 }
      };
    }

    // 2. Respect Dry Run
    if (options?.dryRun || process.env.ENABLE_DISTRIBUTION_DRY_RUN === 'true') {
      console.log(`[WebhookDistributionProvider] Dry-run publication simulated for job ${jobId}`);
      return {
        channel: 'webhook',
        status: 'PUBLISHED',
        externalId: `sim_${jobId}`,
        publishedUrl: `https://simulated-webhook-target.com/posts/${payload.slug || 'slug'}`,
        publishedAt: new Date().toISOString(),
        telemetry: { durationMs: Date.now() - startTime, attempts: 1 }
      };
    }

    // 3. Real Live Publication
    const webhookUrl = process.env.DISTRIBUTION_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        channel: 'webhook',
        status: 'FAILED',
        error: 'Missing DISTRIBUTION_WEBHOOK_URL configuration environment key.',
        telemetry: { durationMs: Date.now() - startTime, attempts: 1 }
      };
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': jobId
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Webhook endpoint returned status ${res.status}`);
      }

      return {
        channel: 'webhook',
        status: 'PUBLISHED',
        externalId: `wh_${jobId}`,
        publishedUrl: webhookUrl,
        publishedAt: new Date().toISOString(),
        telemetry: { durationMs: Date.now() - startTime, attempts: 1 }
      };
    } catch (err: any) {
      return {
        channel: 'webhook',
        status: 'FAILED',
        error: `HTTP Dispatch Error: ${err.message}`,
        telemetry: { durationMs: Date.now() - startTime, attempts: 1 }
      };
    }
  }

  async schedule(payload: any, scheduledAt: string, options?: { dryRun?: boolean; jobId?: string }): Promise<DistributionResult> {
    const startTime = Date.now();
    return {
      channel: 'webhook',
      status: 'SCHEDULED',
      publishedAt: new Date().toISOString(),
      error: undefined,
      externalId: options?.jobId,
      publishedUrl: `https://scheduled-webhook-target.com/jobs/${options?.jobId}`,
      telemetry: { durationMs: Date.now() - startTime, attempts: 1 }
    };
  }
}
