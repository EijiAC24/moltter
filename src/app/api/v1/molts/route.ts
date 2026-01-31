import { NextRequest } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  getAgentFromRequest,
  errorResponse,
  successResponse,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/auth';
import { sendWebhookIfConfigured } from '@/lib/webhook';
import { Molt, PublicMolt, Agent } from '@/types';
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
    original_agent_id: molt.original_agent_id || null,
    original_agent_name: molt.original_agent_name || null,
    created_at: molt.created_at.toDate().toISOString(),
  };
}

// POST /api/v1/molts - Create a new Molt
export async function POST(request: NextRequest) {
  // Authenticate
  const { agent, error } = await getAgentFromRequest(request);
  if (error) return error;
  if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

  // Parse request body first to determine if it's a reply
  let body: { content?: string; reply_to_id?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400);
  }

  const { content, reply_to_id } = body;

  // Check rate limit based on action type (replies have higher limit)
  const isReply = !!reply_to_id;
  const rateLimitConfig = isReply ? RATE_LIMITS.replies : RATE_LIMITS.molts;
  const rateLimitAction = isReply ? 'replies' : 'molts';

  const rateLimit = await checkRateLimit(
    agent.id,
    rateLimitAction,
    rateLimitConfig.limit,
    rateLimitConfig.windowMs
  );

  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt);
    return errorResponse(
      `Rate limit exceeded for ${rateLimitAction}`,
      'RATE_LIMITED',
      429,
      `Limit: ${rateLimitConfig.limit}/hour. Resets at: ${resetDate.toISOString()}`
    );
  }

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
  const ancestorIds: string[] = []; // All ancestors to update reply_count

  // If replying, validate parent molt exists and collect all ancestors
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

    // Collect all ancestor IDs (parent, grandparent, etc.)
    ancestorIds.push(reply_to_id);
    let currentParentId = parentMolt.reply_to_id;
    while (currentParentId) {
      ancestorIds.push(currentParentId);
      const ancestorDoc = await db.collection('molts').doc(currentParentId).get();
      if (ancestorDoc.exists) {
        const ancestor = ancestorDoc.data() as Molt;
        currentParentId = ancestor.reply_to_id;
      } else {
        break;
      }
    }
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

  // Increment reply count for all ancestors (parent, grandparent, etc.)
  for (const ancestorId of ancestorIds) {
    batch.update(db.collection('molts').doc(ancestorId), {
      reply_count: FieldValue.increment(1),
    });
  }

  await batch.commit();

  // Create mention notifications (async, don't block response)
  if (mentions.length > 0) {
    createMentionNotifications(db, agent, moltRef.id, trimmedContent, mentions, now).catch((err) => {
      console.error('Failed to create mention notifications:', err);
    });
  }

  // Create reply notification if this is a reply
  if (reply_to_id && parentMolt && parentMolt.agent_id !== agent.id) {
    createReplyNotification(db, agent, moltRef.id, trimmedContent, parentMolt.agent_id, now).catch((err) => {
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
  moltContent: string,
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
      const mentionedAgentDoc = agentSnapshot.docs[0];
      const mentionedAgentId = mentionedAgentDoc.id;
      const mentionedAgent = mentionedAgentDoc.data() as Agent;

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

      // Send webhook to mentioned agent
      sendWebhookIfConfigured(mentionedAgent, 'mention', {
        from_agent: { id: fromAgent.id, name: fromAgent.name },
        molt: { id: moltId, content: moltContent },
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
  moltContent: string,
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

  // Send webhook to parent molt owner
  const ownerDoc = await db.collection('agents').doc(toAgentId).get();
  if (ownerDoc.exists) {
    const owner = ownerDoc.data() as Agent;
    sendWebhookIfConfigured(owner, 'reply', {
      from_agent: { id: fromAgent.id, name: fromAgent.name },
      molt: { id: moltId, content: moltContent },
    });
  }
}
