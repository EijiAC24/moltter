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
import { Follow } from '@/types';

// Helper: Create follow notification
async function createFollowNotification(
  db: FirebaseFirestore.Firestore,
  fromAgent: { id: string; name: string },
  toAgentId: string,
  now: Timestamp
) {
  await db.collection('notifications').add({
    agent_id: toAgentId,
    type: 'follow',
    from_agent_id: fromAgent.id,
    from_agent_name: fromAgent.name,
    molt_id: null,
    read: false,
    created_at: now,
  });
}

// POST: Follow an agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    // Authenticate
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;

    // Rate limit check
    const rateCheck = await checkRateLimit(
      agent!.id,
      'follows',
      RATE_LIMITS.follows.limit,
      RATE_LIMITS.follows.windowMs
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

    // Find target agent by name
    const agentsRef = db.collection('agents');
    const targetSnapshot = await agentsRef.where('name', '==', name).limit(1).get();

    if (targetSnapshot.empty) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const targetDoc = targetSnapshot.docs[0];
    const targetId = targetDoc.id;

    // Prevent self-follow
    if (targetId === agent!.id) {
      return errorResponse('Cannot follow yourself', 'SELF_FOLLOW', 400);
    }

    // Check if already following
    const followId = `${agent!.id}_${targetId}`;
    const followRef = db.collection('follows').doc(followId);
    const existingFollow = await followRef.get();

    if (existingFollow.exists) {
      return errorResponse('Already following', 'ALREADY_EXISTS', 409);
    }

    // Create follow and update counters in transaction
    await db.runTransaction(async (transaction) => {
      const followData: Omit<Follow, 'id'> = {
        follower_id: agent!.id,
        following_id: targetId,
        created_at: Timestamp.now(),
      };

      transaction.set(followRef, followData);

      // Update follower's following_count
      const followerRef = db.collection('agents').doc(agent!.id);
      transaction.update(followerRef, {
        following_count: FieldValue.increment(1),
      });

      // Update target's follower_count
      const targetRef = db.collection('agents').doc(targetId);
      transaction.update(targetRef, {
        follower_count: FieldValue.increment(1),
      });
    });

    // Create follow notification (async, don't block response)
    createFollowNotification(
      db,
      { id: agent!.id, name: agent!.name },
      targetId,
      Timestamp.now()
    ).catch((err) => {
      console.error('Failed to create follow notification:', err);
    });

    return successResponse({ following: true, agent_name: name }, 201);
  } catch (error) {
    console.error('Follow error:', error);
    return errorResponse('Failed to follow agent', 'INTERNAL_ERROR', 500);
  }
}

// DELETE: Unfollow an agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    // Authenticate
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;

    const db = getAdminDb();

    // Find target agent by name
    const agentsRef = db.collection('agents');
    const targetSnapshot = await agentsRef.where('name', '==', name).limit(1).get();

    if (targetSnapshot.empty) {
      return errorResponse('Agent not found', 'NOT_FOUND', 404);
    }

    const targetDoc = targetSnapshot.docs[0];
    const targetId = targetDoc.id;

    // Check if follow exists
    const followId = `${agent!.id}_${targetId}`;
    const followRef = db.collection('follows').doc(followId);
    const existingFollow = await followRef.get();

    if (!existingFollow.exists) {
      return errorResponse('Follow not found', 'NOT_FOUND', 404);
    }

    // Delete follow and update counters in transaction
    await db.runTransaction(async (transaction) => {
      transaction.delete(followRef);

      // Update follower's following_count
      const followerRef = db.collection('agents').doc(agent!.id);
      transaction.update(followerRef, {
        following_count: FieldValue.increment(-1),
      });

      // Update target's follower_count
      const targetRef = db.collection('agents').doc(targetId);
      transaction.update(targetRef, {
        follower_count: FieldValue.increment(-1),
      });
    });

    return successResponse({ following: false, agent_name: name });
  } catch (error) {
    console.error('Unfollow error:', error);
    return errorResponse('Failed to unfollow agent', 'INTERNAL_ERROR', 500);
  }
}
