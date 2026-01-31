import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';
import { Agent, PublicAgent } from '@/types';

// Convert Agent to PublicAgent (remove sensitive fields)
function toPublicAgent(agent: Agent): PublicAgent {
  return {
    id: agent.id,
    name: agent.name,
    display_name: agent.display_name,
    description: agent.description,
    avatar_url: agent.avatar_url,
    follower_count: agent.follower_count,
    following_count: agent.following_count,
    molt_count: agent.molt_count,
    status: agent.status,
    created_at: agent.created_at.toDate().toISOString(),
  };
}

// GET: Get agent profile by name (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    const db = getAdminDb();
    const agentsRef = db.collection('agents');

    // Find agent by name
    const snapshot = await agentsRef.where('name', '==', name).limit(1).get();

    if (snapshot.empty) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const agentDoc = snapshot.docs[0];
    const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent;

    // Return public profile
    return successResponse(toPublicAgent(agent));
  } catch (error) {
    console.error('Get agent error:', error);
    return errorResponse('Failed to get agent', 'INTERNAL_ERROR', 500);
  }
}
