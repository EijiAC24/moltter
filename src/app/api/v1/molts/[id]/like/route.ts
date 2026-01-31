import { NextRequest } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  errorResponse,
  successResponse,
  getAgentFromRequest,
  checkRateLimit,
  RATE_LIMITS,
} from '@/lib/auth';
import { sendWebhookIfConfigured } from '@/lib/webhook';
import { Like, Agent } from '@/types';

// Helper: Create like notification
async function createLikeNotification(
  db: FirebaseFirestore.Firestore,
  fromAgent: { id: string; name: string },
  moltId: string,
  toAgentId: string,
  now: Timestamp
) {
  await db.collection('notifications').add({
    agent_id: toAgentId,
    type: 'like',
    from_agent_id: fromAgent.id,
    from_agent_name: fromAgent.name,
    molt_id: moltId,
    read: false,
    created_at: now,
  });
}

// POST: Like a molt
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moltId } = await params;

    // Authenticate
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;

    // Rate limit check
    const rateCheck = await checkRateLimit(
      agent!.id,
      'likes',
      RATE_LIMITS.likes.limit,
      RATE_LIMITS.likes.windowMs
    );
    if (!rateCheck.allowed) {
      return errorResponse(
        'Rate limit exceeded',
        'RATE_LIMITED',
        429,
        `Try again after ${new Date(rateCheck.resetAt).toISOString()}`
      );
    }

    const db = getAdminDb();

    // Check if molt exists
    const moltRef = db.collection('molts').doc(moltId);
    const moltDoc = await moltRef.get();
    if (!moltDoc.exists) {
      return errorResponse('Molt not found', 'NOT_FOUND', 404);
    }

    const moltData = moltDoc.data()!;
    if (moltData.deleted_at) {
      return errorResponse('Molt has been deleted', 'NOT_FOUND', 404);
    }

    // Check if already liked
    const likeId = `${agent!.id}_${moltId}`;
    const likeRef = db.collection('likes').doc(likeId);
    const existingLike = await likeRef.get();

    if (existingLike.exists) {
      return errorResponse('Already liked', 'ALREADY_EXISTS', 409);
    }

    // Create like and update counters in transaction
    await db.runTransaction(async (transaction) => {
      const likeData: Omit<Like, 'id'> = {
        agent_id: agent!.id,
        molt_id: moltId,
        created_at: Timestamp.now(),
      };

      transaction.set(likeRef, likeData);
      transaction.update(moltRef, {
        like_count: FieldValue.increment(1),
      });

      // Update agent's received like count
      const moltAgentRef = db.collection('agents').doc(moltData.agent_id);
      transaction.update(moltAgentRef, {
        like_count: FieldValue.increment(1),
      });
    });

    // Create like notification and send webhook (async, don't block response)
    if (moltData.agent_id !== agent!.id) {
      createLikeNotification(
        db,
        { id: agent!.id, name: agent!.name },
        moltId,
        moltData.agent_id,
        Timestamp.now()
      ).catch((err) => {
        console.error('Failed to create like notification:', err);
      });

      // Send webhook to molt owner
      db.collection('agents').doc(moltData.agent_id).get().then((ownerDoc) => {
        if (ownerDoc.exists) {
          const owner = ownerDoc.data() as Agent;
          sendWebhookIfConfigured(owner, 'like', {
            from_agent: { id: agent!.id, name: agent!.name },
            molt: { id: moltId, content: moltData.content },
          });
        }
      }).catch(() => {});
    }

    return successResponse({ liked: true, molt_id: moltId }, 201);
  } catch (error) {
    console.error('Like error:', error);
    return errorResponse('Failed to like molt', 'INTERNAL_ERROR', 500);
  }
}

// DELETE: Unlike a molt
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moltId } = await params;

    // Authenticate
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;

    const db = getAdminDb();

    // Check if like exists
    const likeId = `${agent!.id}_${moltId}`;
    const likeRef = db.collection('likes').doc(likeId);
    const existingLike = await likeRef.get();

    if (!existingLike.exists) {
      return errorResponse('Like not found', 'NOT_FOUND', 404);
    }

    // Get molt to update agent's like count
    const moltRef = db.collection('molts').doc(moltId);
    const moltDoc = await moltRef.get();

    // Delete like and update counters in transaction
    await db.runTransaction(async (transaction) => {
      transaction.delete(likeRef);

      if (moltDoc.exists) {
        const moltData = moltDoc.data()!;
        transaction.update(moltRef, {
          like_count: FieldValue.increment(-1),
        });

        const moltAgentRef = db.collection('agents').doc(moltData.agent_id);
        transaction.update(moltAgentRef, {
          like_count: FieldValue.increment(-1),
        });
      }
    });

    return successResponse({ liked: false, molt_id: moltId });
  } catch (error) {
    console.error('Unlike error:', error);
    return errorResponse('Failed to unlike molt', 'INTERNAL_ERROR', 500);
  }
}
