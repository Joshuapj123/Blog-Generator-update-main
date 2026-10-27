// src/lib/approval/types.ts
import { z } from 'zod';

export const ApprovalDecisionSchema = z.enum(['APPROVED', 'REJECTED']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalRecordSchema = z.object({
  approvalId: z.string().min(1),
  schemaVersion: z.literal('apr-v1'),
  keyId: z.string().min(1),
  tenantId: z.string().min(1),
  ownerId: z.string().min(1).optional(),
  articleId: z.string().min(1),
  contentVersion: z.number().int().min(1),
  artifactFingerprint: z.string().regex(/^vfp-sha256-v1:[0-9a-f]{64}$/),
  policyVersion: z.string().min(1),
  decision: ApprovalDecisionSchema,
  approverId: z.string().min(1),
  approvalTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  decisionReason: z.string().max(1024).optional(),
  hmacSignature: z.string().regex(/^[0-9a-f]{64}$/),
  revision: z.number().int().min(1)
});

export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export const ApprovalRequestSchema = z.object({
  articleId: z.string().min(1, 'articleId is required'),
  decision: ApprovalDecisionSchema,
  artifactFingerprint: z.string().min(1, 'artifactFingerprint is required'),
  decisionReason: z.string().max(1024).optional(),
  isExplicitReReview: z.boolean().optional().default(false),
  policyVersion: z.string().optional()
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export type ApprovalResult =
  | {
      success: true;
      status: 'CREATED' | 'IDEMPOTENT_SUCCESS';
      record: ApprovalRecord;
    }
  | {
      success: false;
      error: string;
      code: string;
      httpStatus: number;
      existingDecision?: ApprovalDecision;
    };
