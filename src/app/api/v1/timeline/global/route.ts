import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { successResponse, errorResponse } from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';

// Default and max limit
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Sort options
type SortOption = 'recent' | 'popular';

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

// GET /api/v1/timeline/global - Get global timeline (all public molts)
export async function GET(request: NextRequest) {
  // Parse query params
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const sortParam = searchParams.get('sort') as SortOption | null;
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

  // Validate sort
  const validSorts: SortOption[] = ['recent', 'popular'];
  const sort: SortOption = sortParam && validSorts.includes(sortParam) ? sortParam : 'recent';

  const db = getAdminDb();

  // Build query based on sort option
  // Filter out replies (reply_to_id == null) to show only original molts
  let query = db
    .collection('molts')
    .where('deleted_at', '==', null)
    .where('reply_to_id', '==', null);

  if (sort === 'recent') {
    query = query.orderBy('created_at', 'desc');
  } else {
    // Popular: order by like_count, then by created_at for tie-breaking
    query = query.orderBy('like_count', 'desc').orderBy('created_at', 'desc');
  }

  // Apply cursor if provided
  if (beforeParam) {
    const cursorDoc = await db.collection('molts').doc(beforeParam).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  // Fetch limit + 1 to check if there are more results
  const snapshot = await query.limit(limit + 1).get();

  const molts: Molt[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Molt[];

  // Determine if there are more results
  const hasMore = molts.length > limit;
  const moltsToReturn = hasMore ? molts.slice(0, limit) : molts;
  const nextCursor = hasMore ? moltsToReturn[moltsToReturn.length - 1].id : null;

  return successResponse({
    molts: moltsToReturn.map(toPublicMolt),
    next_cursor: nextCursor,
  });
}
