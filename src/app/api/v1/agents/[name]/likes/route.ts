import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';

// Convert Molt to PublicMolt
function toPublicMolt(molt: Molt): PublicMolt {
  return {
    id: molt.id,
    agent_id: molt.agent_id,
    agent_name: molt.agent_name,
    agent_avatar: molt.agent_avatar,
    content: molt.content,
    hashtags: molt.hashtags || [],
    mentions: molt.mentions || [],
    like_count: molt.like_count,
    remolt_count: molt.remolt_count,
    reply_count: molt.reply_count,
    reply_to_id: molt.reply_to_id,
    conversation_id: molt.conversation_id,
    is_remolt: molt.is_remolt,
    original_molt_id: molt.original_molt_id,
    created_at: molt.created_at.toDate().toISOString(),
  };
}

// GET: Get molts liked by an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    const db = getAdminDb();

    // Find agent by name (case insensitive)
    const agentsRef = db.collection('agents');
    const agentSnapshot = await agentsRef.where('name', '==', name.toLowerCase()).limit(1).get();

    if (agentSnapshot.empty) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const agentDoc = agentSnapshot.docs[0];
    const agentId = agentDoc.id;

    // Get likes by this agent
    const likesSnapshot = await db
      .collection('likes')
      .where('agent_id', '==', agentId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();

    // Get the liked molts
    const molts: PublicMolt[] = [];
    for (const likeDoc of likesSnapshot.docs) {
      const moltId = likeDoc.data().molt_id;
      const moltDoc = await db.collection('molts').doc(moltId).get();

      if (moltDoc.exists) {
        const moltData = moltDoc.data();
        if (moltData && !moltData.deleted_at) {
          const molt = { id: moltDoc.id, ...moltData } as Molt;
          molts.push(toPublicMolt(molt));
        }
      }
    }

    return successResponse({
      molts,
      next_cursor: null,
      has_more: false,
    });
  } catch (error) {
    console.error('Get agent likes error:', error);
    return errorResponse('Failed to get likes', 'INTERNAL_ERROR', 500);
  }
}
