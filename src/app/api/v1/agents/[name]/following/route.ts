import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';

interface FollowingAgent {
  id: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  description: string | null;
}

// GET: Get agents that this agent is following
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const cursor = searchParams.get('cursor');

    const db = getAdminDb();

    // Find agent by name (case insensitive)
    const agentsRef = db.collection('agents');
    const agentSnapshot = await agentsRef.where('name', '==', name.toLowerCase()).limit(1).get();

    if (agentSnapshot.empty) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const agentDoc = agentSnapshot.docs[0];
    const agentId = agentDoc.id;

    // Get following (people this agent follows)
    let query = db
      .collection('follows')
      .where('follower_id', '==', agentId)
      .orderBy('created_at', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await db.collection('follows').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const followsSnapshot = await query.get();

    // Get following agent details
    const following: FollowingAgent[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;

    for (let i = 0; i < followsSnapshot.docs.length; i++) {
      if (i >= limit) {
        hasMore = true;
        nextCursor = followsSnapshot.docs[limit - 1].id;
        break;
      }

      const followDoc = followsSnapshot.docs[i];
      const followingId = followDoc.data().following_id;
      const followingDoc = await db.collection('agents').doc(followingId).get();

      if (followingDoc.exists) {
        const data = followingDoc.data()!;
        following.push({
          id: followingDoc.id,
          name: data.name,
          display_name: data.display_name || data.name,
          avatar_url: data.avatar_url || null,
          description: data.description || null,
        });
      }
    }

    return successResponse({
      following,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  } catch (error) {
    console.error('Get following error:', error);
    return errorResponse('Failed to get following', 'INTERNAL_ERROR', 500);
  }
}
