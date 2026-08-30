import { AIAnswer } from '@/core/contracts/schemas';
import { LLMProvider } from '@/core/contracts/providers';

export interface AIVisibilityProvider {
  providerName: string;
  query(prompt: string, options?: { runId?: string }): Promise<AIAnswer>;
}

export class GeminiVisibilityProvider implements AIVisibilityProvider {
  public providerName = 'Gemini';
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async query(prompt: string, options?: { runId?: string }): Promise<AIAnswer> {
    const startTime = Date.now();
    try {
      const answer = await this.llm.generate(prompt, {
        operation: 'GEO AI Answer Generation',
        runId: options?.runId,
        temperature: 0.2
      });
      return {
        provider: this.providerName,
        model: 'gemini-2.5-flash',
        prompt,
        answer,
        timestamp: new Date().toISOString(),
        success: true,
        latency: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        provider: this.providerName,
        model: 'gemini-2.5-flash',
        prompt,
        answer: `Provider query failed: ${err.message}`,
        timestamp: new Date().toISOString(),
        success: false,
        latency: Date.now() - startTime
      };
    }
  }
}

export class PerplexityVisibilityProvider implements AIVisibilityProvider {
  public providerName = 'Perplexity';

  async query(prompt: string, options?: { runId?: string }): Promise<AIAnswer> {
    const startTime = Date.now();
    return {
      provider: this.providerName,
      model: 'sonar-reasoning',
      prompt,
      answer: 'Provider unavailable: No API credentials configured.',
      timestamp: new Date().toISOString(),
      success: false,
      latency: Date.now() - startTime
    };
  }
}
