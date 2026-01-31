import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';

// Default pagination
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
    created_at: molt.created_at.toDate().toISOString(),
  };
}

// GET /api/v1/molts/[id]/replies - Get replies to a Molt
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const db = getAdminDb();

  // First, verify the parent molt exists
  const parentDoc = await db.collection('molts').doc(id).get();

  if (!parentDoc.exists) {
    return errorResponse('Molt not found', 'NOT_FOUND', 404);
  }

  const parentMolt = { id: parentDoc.id, ...parentDoc.data() } as Molt;

  // Check if parent is deleted
  if (parentMolt.deleted_at !== null) {
    return errorResponse('Molt has been deleted', 'DELETED', 404);
  }

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const cursor = searchParams.get('cursor'); // ISO timestamp for pagination

  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  // Build query for replies
  let query = db
    .collection('molts')
    .where('reply_to_id', '==', id)
    .where('deleted_at', '==', null)
    .orderBy('created_at', 'asc')
    .limit(limit + 1); // Fetch one extra to check if there's more

  // Apply cursor if provided
  if (cursor) {
    try {
      const cursorDate = new Date(cursor);
      query = db
        .collection('molts')
        .where('reply_to_id', '==', id)
        .where('deleted_at', '==', null)
        .orderBy('created_at', 'asc')
        .startAfter(cursorDate)
        .limit(limit + 1);
    } catch {
      return errorResponse('Invalid cursor format', 'INVALID_CURSOR', 400);
    }
  }

  const snapshot = await query.get();
  const replies: PublicMolt[] = [];
  let hasMore = false;
  let nextCursor: string | null = null;

  snapshot.docs.forEach((doc, index) => {
    if (index < limit) {
      const molt = { id: doc.id, ...doc.data() } as Molt;
      replies.push(toPublicMolt(molt));
    } else {
      hasMore = true;
    }
  });

  // Set next cursor to the last item's created_at
  if (replies.length > 0 && hasMore) {
    nextCursor = replies[replies.length - 1].created_at;
  }

  return successResponse({
    replies,
    pagination: {
      has_more: hasMore,
      next_cursor: nextCursor,
      limit,
    },
  });
}
