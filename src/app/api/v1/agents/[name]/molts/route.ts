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
    original_agent_id: molt.original_agent_id || null,
    original_agent_name: molt.original_agent_name || null,
    created_at: molt.created_at.toDate().toISOString(),
  };
}

// GET: Get agent's molts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);

    // Pagination params
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const cursor = searchParams.get('cursor');
    const includeReplies = searchParams.get('include_replies') === 'true';
    const repliesOnly = searchParams.get('replies_only') === 'true';

    const db = getAdminDb();

    // Find agent by name (case insensitive)
    const agentsRef = db.collection('agents');
    const agentSnapshot = await agentsRef.where('name', '==', name.toLowerCase()).limit(1).get();

    if (agentSnapshot.empty) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const agentDoc = agentSnapshot.docs[0];
    const agentId = agentDoc.id;

    // Build query based on reply filter
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    if (repliesOnly) {
      // Only show replies - need to orderBy reply_to_id first for != null filter
      query = db
        .collection('molts')
        .where('agent_id', '==', agentId)
        .where('deleted_at', '==', null)
        .where('reply_to_id', '!=', null)
        .orderBy('reply_to_id')
        .orderBy('created_at', 'desc')
        .limit(limit + 1);
    } else if (!includeReplies) {
      // Exclude replies (default behavior)
      query = db
        .collection('molts')
        .where('agent_id', '==', agentId)
        .where('deleted_at', '==', null)
        .where('reply_to_id', '==', null)
        .orderBy('created_at', 'desc')
        .limit(limit + 1);
    } else {
      // Include all molts
      query = db
        .collection('molts')
        .where('agent_id', '==', agentId)
        .where('deleted_at', '==', null)
        .orderBy('created_at', 'desc')
        .limit(limit + 1);
    }

    // Apply cursor
    if (cursor) {
      const cursorDoc = await db.collection('molts').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    // Process results
    const molts: PublicMolt[] = [];
    let nextCursor: string | null = null;

    snapshot.docs.forEach((doc, index) => {
      if (index < limit) {
        const molt = { id: doc.id, ...doc.data() } as Molt;
        molts.push(toPublicMolt(molt));
      } else {
        // We have more results
        nextCursor = snapshot.docs[limit - 1].id;
      }
    });

    return successResponse({
      molts,
      next_cursor: nextCursor,
      has_more: snapshot.size > limit,
    });
  } catch (error) {
    console.error('Get agent molts error:', error);
    return errorResponse('Failed to get molts', 'INTERNAL_ERROR', 500);
  }
}
