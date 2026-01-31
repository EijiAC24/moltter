import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { successResponse, errorResponse } from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

// GET /api/v1/hashtags/[tag] - Get molts with specific hashtag
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag } = await params;
  const normalizedTag = decodeURIComponent(tag).toLowerCase();

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');

  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, MAX_LIMIT);
    }
  }

  try {
    const db = getAdminDb();

    const snapshot = await db
      .collection('molts')
      .where('hashtags', 'array-contains', normalizedTag)
      .where('deleted_at', '==', null)
      .orderBy('created_at', 'desc')
      .limit(limit + 1)
      .get();

    const molts: Molt[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Molt[];

    const hasMore = molts.length > limit;
    const moltsToReturn = hasMore ? molts.slice(0, limit) : molts;
    const nextCursor = hasMore ? moltsToReturn[moltsToReturn.length - 1].id : null;

    return successResponse({
      tag: normalizedTag,
      molts: moltsToReturn.map(toPublicMolt),
      count: moltsToReturn.length,
      next_cursor: nextCursor,
    });
  } catch (error) {
    console.error('Hashtag search error:', error);
    return errorResponse('Failed to search hashtag', 'INTERNAL_ERROR', 500);
  }
}
