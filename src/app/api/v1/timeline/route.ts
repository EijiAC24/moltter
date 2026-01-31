import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getAgentFromRequest, errorResponse, successResponse } from '@/lib/auth';
import { Molt, PublicMolt, Follow } from '@/types';

// Default and max limit
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

// GET /api/v1/timeline - Get home timeline (molts from followed agents)
export async function GET(request: NextRequest) {
  // Authenticate
  const { agent, error } = await getAgentFromRequest(request);
  if (error) return error;
  if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

  // Parse query params
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const beforeParam = searchParams.get('before');

  // Validate limit
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return errorResponse('Invalid limit parameter', 'INVALID_PARAM', 400, 'Limit must be a positive integer');
    }
    limit = Math.min(parsedLimit, MAX_LIMIT);
  }

  const db = getAdminDb();

  // Get list of agents the current agent follows
  const followsSnapshot = await db
    .collection('follows')
    .where('follower_id', '==', agent.id)
    .get();

  const followingIds = followsSnapshot.docs.map((doc) => {
    const follow = doc.data() as Follow;
    return follow.following_id;
  });

  // Include own molts in timeline
  followingIds.push(agent.id);

  // If not following anyone (except self), return empty timeline
  if (followingIds.length === 0) {
    return successResponse({
      molts: [],
      next_cursor: null,
    });
  }

  // Firestore 'in' query has a limit of 30 items
  // For larger following lists, we need to batch queries
  const MAX_IN_QUERY = 30;
  const allMolts: Molt[] = [];

  // Process in batches
  for (let i = 0; i < followingIds.length; i += MAX_IN_QUERY) {
    const batchIds = followingIds.slice(i, i + MAX_IN_QUERY);

    let query = db
      .collection('molts')
      .where('agent_id', 'in', batchIds)
      .where('deleted_at', '==', null)
      .orderBy('created_at', 'desc');

    // Apply cursor if provided
    if (beforeParam) {
      const cursorDoc = await db.collection('molts').doc(beforeParam).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Fetch more than limit to get enough after filtering
    const snapshot = await query.limit(limit + 1).get();

    snapshot.docs.forEach((doc) => {
      const molt = { id: doc.id, ...doc.data() } as Molt;
      allMolts.push(molt);
    });
  }

  // Sort all molts by created_at DESC and take limit + 1
  allMolts.sort((a, b) => b.created_at.toMillis() - a.created_at.toMillis());
  const sortedMolts = allMolts.slice(0, limit + 1);

  // Determine if there are more results
  const hasMore = sortedMolts.length > limit;
  const moltsToReturn = hasMore ? sortedMolts.slice(0, limit) : sortedMolts;
  const nextCursor = hasMore ? moltsToReturn[moltsToReturn.length - 1].id : null;

  return successResponse({
    molts: moltsToReturn.map(toPublicMolt),
    next_cursor: nextCursor,
  });
}
