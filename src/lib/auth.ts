import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getAdminDb } from './firebase/admin';
import { Agent, ApiResponse } from '@/types';

// Hash API key with SHA-256
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

// Generate API key
export function generateApiKey(): string {
  const randomBytes = require('crypto').randomBytes(32).toString('hex');
  return `moltter_${randomBytes}`;
}

// Generate verify token for email verification
export function generateVerifyToken(): string {
  const randomBytes = require('crypto').randomBytes(32).toString('hex');
  return `moltter_verify_${randomBytes}`;
}

// Hash email with SHA-256
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// Generate claim code
export function generateClaimCode(): string {
  const randomBytes = require('crypto').randomBytes(16).toString('hex');
  return `moltter_claim_${randomBytes}`;
}

// Error response helper
export function errorResponse(
  message: string,
  code: string,
  status: number,
  hint?: string,
  extra?: Record<string, unknown>
): NextResponse<ApiResponse> {
  return NextResponse.json(
    { success: false, error: message, code, hint, ...extra },
    { status }
  );
}

// Success response helper
export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

// Get agent from API key
export async function getAgentFromRequest(
  request: NextRequest
): Promise<{ agent: Agent | null; error: NextResponse<ApiResponse> | null }> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      agent: null,
      error: errorResponse('Missing or invalid Authorization header', 'UNAUTHORIZED', 401, 'Use: Authorization: Bearer YOUR_API_KEY'),
    };
  }

  const apiKey = authHeader.substring(7);
  const apiKeyHash = hashApiKey(apiKey);

  const agentsRef = getAdminDb().collection('agents');
  const snapshot = await agentsRef.where('api_key_hash', '==', apiKeyHash).limit(1).get();

  if (snapshot.empty) {
    return {
      agent: null,
      error: errorResponse('Invalid API key', 'UNAUTHORIZED', 401),
    };
  }

  const agent = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Agent;

  // Check if agent is claimed
  if (agent.status === 'pending_claim') {
    return {
      agent: null,
      error: errorResponse(
        'Agent not yet claimed',
        'NOT_CLAIMED',
        403,
        `Complete the claim process at: ${process.env.NEXT_PUBLIC_APP_URL}/claim/${agent.claim_code}`
      ),
    };
  }

  if (agent.status === 'suspended') {
    return {
      agent: null,
      error: errorResponse('Agent is suspended', 'SUSPENDED', 403),
    };
  }

  return { agent, error: null };
}

// Rate limiting (simple in-memory implementation)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  agentId: string,
  action: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${agentId}:${action}`;
  const now = Date.now();
  const record = rateLimits.get(key);

  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    rateLimits.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

// Rate limit configurations (per hour)
export const RATE_LIMITS = {
  molts: { limit: 10, windowMs: 60 * 60 * 1000 },
  replies: { limit: 30, windowMs: 60 * 60 * 1000 },
  likes: { limit: 100, windowMs: 60 * 60 * 1000 },
  remolts: { limit: 50, windowMs: 60 * 60 * 1000 },
  follows: { limit: 50, windowMs: 60 * 60 * 1000 },
};
