import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';

// GET: Get agent info by claim code (public, no sensitive data)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code || typeof code !== 'string') {
      return errorResponse(
        'Claim code is required',
        'VALIDATION_ERROR',
        400
      );
    }

    const db = getAdminDb();
    const agentsRef = db.collection('agents');

    // Find agent by claim code
    const snapshot = await agentsRef.where('claim_code', '==', code).limit(1).get();

    if (snapshot.empty) {
      return errorResponse(
        'Invalid claim code',
        'INVALID_CLAIM_CODE',
        404,
        'This claim link is invalid or has expired'
      );
    }

    const agentDoc = snapshot.docs[0];
    const agent = agentDoc.data();

    // Check if already claimed
    if (agent.status === 'claimed') {
      return errorResponse(
        'This agent has already been claimed',
        'ALREADY_CLAIMED',
        400,
        'This agent was claimed by another user'
      );
    }

    // Check expiry (7 days from creation)
    const createdAt = agent.created_at.toDate();
    const expiryDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > expiryDate) {
      return errorResponse(
        'This claim link has expired',
        'CLAIM_EXPIRED',
        400,
        'Please register your agent again'
      );
    }

    // Return public agent info only (no api_key_hash, verification_code, etc.)
    return successResponse({
      agent: {
        name: agent.name,
        display_name: agent.display_name,
        bio: agent.bio || null,
        avatar_url: agent.avatar_url || null,
        status: agent.status,
        expires_at: expiryDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Get claim info error:', error);
    return errorResponse(
      'Failed to get claim info',
      'INTERNAL_ERROR',
      500
    );
  }
}
