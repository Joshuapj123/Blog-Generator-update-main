// src/lib/content/GeminiProvider.ts
import { LLMProvider } from '@/core/contracts/providers';
import { google } from '@ai-sdk/google';
import { generateTextWithTelemetry, generateObjectWithTelemetry } from '@/lib/gemini-telemetry';

export class GeminiProvider implements LLMProvider {
  private defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  public getModel(): string {
    return process.env.GEMINI_MODEL || this.defaultModel;
  }

  async generate(
    prompt: string,
    options?: { systemInstruction?: string; temperature?: number; operation?: string; cacheKey?: string; runId?: string; model?: string }
  ): Promise<string> {
    const modelId = options?.model || this.getModel();
    const model = google(modelId);
    
    console.log(`[GeminiProvider] Using model: ${modelId} for operation: "${options?.operation || 'Generic Text Generation'}"`);

    const result = await generateTextWithTelemetry(options?.operation || 'Generic Text Generation', {
      model,
      prompt,
      system: options?.systemInstruction,
      temperature: options?.temperature,
      cacheKey: options?.cacheKey,
      runId: options?.runId,
    });
    
    return result.text;
  }

  async structuredGenerate<T>(
    prompt: string,
    schema: any,
    options?: { systemInstruction?: string; temperature?: number; operation?: string; cacheKey?: string; runId?: string; model?: string }
  ): Promise<T> {
    const modelId = options?.model || this.getModel();
    const model = google(modelId);
    
    console.log(`[GeminiProvider] Using model: ${modelId} for operation: "${options?.operation || 'Generic Structured Generation'}"`);

    const result = await generateObjectWithTelemetry(options?.operation || 'Generic Structured Generation', {
      model,
      schema,
      prompt,
      system: options?.systemInstruction,
      temperature: options?.temperature,
      cacheKey: options?.cacheKey,
      runId: options?.runId,
    });
    
    return result.object as T;
  }
}
