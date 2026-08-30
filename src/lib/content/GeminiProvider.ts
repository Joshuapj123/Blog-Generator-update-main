// src/lib/content/GeminiProvider.ts
import { LLMProvider } from '@/core/contracts/providers';
import { google } from '@ai-sdk/google';
import { generateTextWithTelemetry, generateObjectWithTelemetry } from '@/lib/gemini-telemetry';

export class GeminiProvider implements LLMProvider {
  private defaultModel = 'gemini-2.5-flash';

  async generate(
    prompt: string,
    options?: { systemInstruction?: string; temperature?: number; operation?: string; cacheKey?: string; runId?: string; model?: string }
  ): Promise<string> {
    const modelId = options?.model || this.defaultModel;
    const model = google(modelId);
    
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
    const modelId = options?.model || this.defaultModel;
    const model = google(modelId);
    
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
