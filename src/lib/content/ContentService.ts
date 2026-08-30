// src/lib/content/ContentService.ts
import { ContentBriefBuilder } from './ContentBriefBuilder';
import { WritingService } from './WritingService';
import { ContentRepairService } from './ContentRepairService';
import { LLMProvider } from '@/core/contracts/providers';

export class ContentService {
  public briefBuilder: ContentBriefBuilder;
  public writer: WritingService;
  public repairer: ContentRepairService;

  constructor(llmProvider: LLMProvider) {
    this.briefBuilder = new ContentBriefBuilder(llmProvider);
    this.writer = new WritingService(llmProvider);
    this.repairer = new ContentRepairService(llmProvider);
  }
}
