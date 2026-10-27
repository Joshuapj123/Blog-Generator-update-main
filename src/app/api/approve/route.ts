// src/app/api/approve/route.ts
import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { ApprovalAuthorityService } from '@/lib/approval/ApprovalAuthorityService';
import { ApprovalRequestSchema } from '@/lib/approval/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 1. Mandatory Authorization Header Check
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing Authorization header' },
        { status: 401 }
      );
    }

    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch || !bearerMatch[1]) {
      return NextResponse.json(
        { error: 'Unauthorized: Malformed Authorization header. Expected "Bearer <token>"' },
        { status: 401 }
      );
    }

    const idToken = bearerMatch[1].trim();
    let authenticatedUserId: string;

    // 2. Firebase Admin Auth Verification
    try {
      const adminAuth = await getAdminAuth();
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      if (!decodedToken || !decodedToken.uid) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid user credentials' },
          { status: 401 }
        );
      }
      authenticatedUserId = decodedToken.uid.trim();
    } catch (authErr: any) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Token verification failed',
          message: authErr?.message || 'Authentication error'
        },
        { status: 401 }
      );
    }

    // 3. Payload Parsing & Schema Validation
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Bad Request: Invalid JSON body' },
        { status: 400 }
      );
    }

    const parseResult = ApprovalRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Bad Request: Schema validation failed',
          details: parseResult.error.issues.map((i) => i.message)
        },
        { status: 400 }
      );
    }

    const approvalRequest = parseResult.data;

    // 4. Process Decision via Approval Authority Service
    const result = await ApprovalAuthorityService.processDecision(approvalRequest, authenticatedUserId);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          ...(result.existingDecision ? { existingDecision: result.existingDecision } : {})
        },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: result.status,
        record: result.record
      },
      { status: 200 }
    );
  } catch (err: any) {
    // Fail closed without leaking sensitive server environment or keys
    console.error('[API /api/approve] Internal failure:', err?.message || err);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        code: 'ERR_INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
