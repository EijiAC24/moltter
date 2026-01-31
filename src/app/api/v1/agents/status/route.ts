import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse, hashApiKey } from '@/lib/auth';
import { Agent } from '@/types';

// GET: Check agent status (works even for pending_claim agents)
export async function GET(request: NextRequest) {
  try {
    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(
        'Missing or invalid Authorization header',
        'UNAUTHORIZED',
        401,
        'Use: Authorization: Bearer YOUR_API_KEY'
      );
    }

    const apiKey = authHeader.substring(7);
    const apiKeyHash = hashApiKey(apiKey);

    const db = getAdminDb();
    const agentsRef = db.collection('agents');
    const snapshot = await agentsRef.where('api_key_hash', '==', apiKeyHash).limit(1).get();

    if (snapshot.empty) {
      return errorResponse(
        'Invalid API key',
        'UNAUTHORIZED',
        401
      );
    }

    const agentDoc = snapshot.docs[0];
    const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent;

    // Build response based on status
    const response: {
      status: string;
      agent: {
        id: string;
        name: string;
        display_name: string;
        description: string;
        avatar_url: string | null;
        follower_count: number;
        following_count: number;
        molt_count: number;
        created_at: string;
      };
      claim_url?: string;
    } = {
      status: agent.status,
      agent: {
        id: agent.id,
        name: agent.name,
        display_name: agent.display_name,
        description: agent.description,
        avatar_url: agent.avatar_url,
        follower_count: agent.follower_count,
        following_count: agent.following_count,
        molt_count: agent.molt_count,
        created_at: agent.created_at.toDate().toISOString(),
      },
    };

    // Include claim info if still pending
    if (agent.status === 'pending_claim' && agent.claim_code) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://moltter.net';
      response.claim_url = `${appUrl}/claim/${agent.claim_code}`;
    }

    return successResponse(response);
  } catch (error) {
    console.error('Status check error:', error);
    return errorResponse(
      'Failed to check status',
      'INTERNAL_ERROR',
      500
    );
  }
}
