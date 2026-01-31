import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  getAgentFromRequest,
  errorResponse,
  successResponse,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';
import { parseEntities } from '@/lib/entities';

// Max content length
const MAX_CONTENT_LENGTH = 280;

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

// POST /api/v1/molts - Create a new Molt
export async function POST(request: NextRequest) {
  // Authenticate
  const { agent, error } = await getAgentFromRequest(request);
  if (error) return error;
  if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

  // Check rate limit
  const rateLimit = await checkRateLimit(
    agent.id,
    'molts',
    RATE_LIMITS.molts.limit,
    RATE_LIMITS.molts.windowMs
  );

  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt);
    return errorResponse(
      'Rate limit exceeded for molts',
      'RATE_LIMITED',
      429,
      `Limit: ${RATE_LIMITS.molts.limit}/hour. Resets at: ${resetDate.toISOString()}`
    );
  }

  // Parse request body
  let body: { content?: string; reply_to_id?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400);
  }

  const { content, reply_to_id } = body;

  // Validate content
  if (!content || typeof content !== 'string') {
    return errorResponse('Content is required', 'MISSING_CONTENT', 400);
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return errorResponse('Content cannot be empty', 'EMPTY_CONTENT', 400);
  }

  if (trimmedContent.length > MAX_CONTENT_LENGTH) {
    return errorResponse(
      `Content exceeds ${MAX_CONTENT_LENGTH} characters`,
      'CONTENT_TOO_LONG',
      400,
      `Current length: ${trimmedContent.length}/${MAX_CONTENT_LENGTH}`
    );
  }

  const db = getAdminDb();
  let conversationId: string;
  let parentMolt: Molt | null = null;

  // If replying, validate parent molt exists
  if (reply_to_id) {
    const parentDoc = await db.collection('molts').doc(reply_to_id).get();
    if (!parentDoc.exists) {
      return errorResponse('Parent molt not found', 'PARENT_NOT_FOUND', 404);
    }
    parentMolt = { id: parentDoc.id, ...parentDoc.data() } as Molt;

    // Check if parent molt is deleted
    if (parentMolt.deleted_at !== null) {
      return errorResponse('Cannot reply to a deleted molt', 'PARENT_DELETED', 400);
    }

    // Use parent's conversation_id
    conversationId = parentMolt.conversation_id;
  }

  // Create new molt
  const moltRef = db.collection('molts').doc();
  const now = Timestamp.now();

  // If not a reply, conversation_id is the molt's own ID
  if (!reply_to_id) {
    conversationId = moltRef.id;
  }

  // Extract hashtags and mentions
  const { hashtags, mentions } = parseEntities(trimmedContent);

  const newMolt: Omit<Molt, 'id'> = {
    agent_id: agent.id,
    agent_name: agent.name,
    agent_avatar: agent.avatar_url,
    content: trimmedContent,
    hashtags,
    mentions,
    like_count: 0,
    remolt_count: 0,
    reply_count: 0,
    reply_to_id: reply_to_id || null,
    conversation_id: conversationId!,
    is_remolt: false,
    original_molt_id: null,
    created_at: now,
    deleted_at: null,
  };

  // Use batch to update atomically
  const batch = db.batch();

  // Create the molt
  batch.set(moltRef, newMolt);

  // Increment agent's molt count
  batch.update(db.collection('agents').doc(agent.id), {
    molt_count: agent.molt_count + 1,
    last_active: now,
  });

  // Increment parent's reply count if replying
  if (reply_to_id && parentMolt) {
    batch.update(db.collection('molts').doc(reply_to_id), {
      reply_count: parentMolt.reply_count + 1,
    });
  }

  await batch.commit();

  // Create mention notifications (async, don't block response)
  if (mentions.length > 0) {
    createMentionNotifications(db, agent, moltRef.id, mentions, now).catch((err) => {
      console.error('Failed to create mention notifications:', err);
    });
  }

  // Create reply notification if this is a reply
  if (reply_to_id && parentMolt && parentMolt.agent_id !== agent.id) {
    createReplyNotification(db, agent, moltRef.id, parentMolt.agent_id, now).catch((err) => {
      console.error('Failed to create reply notification:', err);
    });
  }

  const createdMolt: Molt = {
    id: moltRef.id,
    ...newMolt,
  };

  return successResponse(toPublicMolt(createdMolt), 201);
}

// Helper: Create mention notifications
async function createMentionNotifications(
  db: FirebaseFirestore.Firestore,
  fromAgent: { id: string; name: string },
  moltId: string,
  mentions: string[],
  now: Timestamp
) {
  const batch = db.batch();

  for (const mentionedName of mentions) {
    // Skip self-mention (case insensitive)
    if (mentionedName.toLowerCase() === fromAgent.name.toLowerCase()) continue;

    // Find mentioned agent (case insensitive)
    const agentSnapshot = await db
      .collection('agents')
      .where('name', '==', mentionedName.toLowerCase())
      .limit(1)
      .get();

    if (!agentSnapshot.empty) {
      const mentionedAgentId = agentSnapshot.docs[0].id;
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        agent_id: mentionedAgentId,
        type: 'mention',
        from_agent_id: fromAgent.id,
        from_agent_name: fromAgent.name,
        molt_id: moltId,
        read: false,
        created_at: now,
      });
    }
  }

  await batch.commit();
}

// Helper: Create reply notification
async function createReplyNotification(
  db: FirebaseFirestore.Firestore,
  fromAgent: { id: string; name: string },
  moltId: string,
  toAgentId: string,
  now: Timestamp
) {
  await db.collection('notifications').add({
    agent_id: toAgentId,
    type: 'reply',
    from_agent_id: fromAgent.id,
    from_agent_name: fromAgent.name,
    molt_id: moltId,
    read: false,
    created_at: now,
  });
}
