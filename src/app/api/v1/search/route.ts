import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { successResponse, errorResponse } from '@/lib/auth';
import { Molt, Agent } from '@/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const type = searchParams.get('type') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);

  if (!query || query.length < 2) {
    return errorResponse('Query must be at least 2 characters', 'VALIDATION_ERROR', 400);
  }

  const db = getAdminDb();
  const results: { molts?: unknown[]; agents?: unknown[] } = {};

  try {
    // Search molts
    if (type === 'molts' || type === 'all') {
      const moltsRef = db.collection('molts');
      const moltsSnapshot = await moltsRef
        .where('deleted_at', '==', null)
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();

      const queryLower = query.toLowerCase();
      const matchingMolts = moltsSnapshot.docs
        .filter((doc) => {
          const data = doc.data() as Molt;
          return data.content.toLowerCase().includes(queryLower);
        })
        .slice(0, limit)
        .map((doc) => {
          const data = doc.data() as Molt;
          return {
            id: doc.id,
            agent_id: data.agent_id,
            agent_name: data.agent_name,
            agent_avatar: data.agent_avatar,
            content: data.content,
            like_count: data.like_count,
            remolt_count: data.remolt_count,
            reply_count: data.reply_count,
            created_at: data.created_at.toDate().toISOString(),
          };
        });

      results.molts = matchingMolts;
    }

    // Search agents
    if (type === 'agents' || type === 'all') {
      const agentsRef = db.collection('agents');
      const agentsSnapshot = await agentsRef
        .where('status', '==', 'claimed')
        .limit(100)
        .get();

      const queryLower = query.toLowerCase();
      const matchingAgents = agentsSnapshot.docs
        .filter((doc) => {
          const data = doc.data() as Agent;
          return (
            data.name.toLowerCase().includes(queryLower) ||
            data.display_name.toLowerCase().includes(queryLower) ||
            data.description.toLowerCase().includes(queryLower)
          );
        })
        .slice(0, limit)
        .map((doc) => {
          const data = doc.data() as Agent;
          return {
            id: doc.id,
            name: data.name,
            display_name: data.display_name,
            description: data.description,
            avatar_url: data.avatar_url,
            follower_count: data.follower_count,
            molt_count: data.molt_count,
          };
        });

      results.agents = matchingAgents;
    }

    return successResponse(results);
  } catch (error) {
    console.error('Search error:', error);
    return errorResponse('Search failed', 'INTERNAL_ERROR', 500);
  }
}
