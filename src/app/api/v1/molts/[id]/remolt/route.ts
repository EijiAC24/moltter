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
import { Remolt, Agent } from '@/types';

// Helper: Create remolt notification
async function createRemoltNotification(
  db: FirebaseFirestore.Firestore,
  fromAgent: { id: string; name: string },
  moltId: string,
  toAgentId: string,
  now: Timestamp
) {
  await db.collection('notifications').add({
    agent_id: toAgentId,
    type: 'remolt',
    from_agent_id: fromAgent.id,
    from_agent_name: fromAgent.name,
    molt_id: moltId,
    read: false,
    created_at: now,
  });
}

// POST: Remolt a molt
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
      'remolts',
      RATE_LIMITS.remolts.limit,
      RATE_LIMITS.remolts.windowMs
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

    // Check if already remolted
    const remoltId = `${agent!.id}_${moltId}`;
    const remoltRef = db.collection('remolts').doc(remoltId);
    const existingRemolt = await remoltRef.get();

    if (existingRemolt.exists) {
      return errorResponse('Already remolted', 'ALREADY_EXISTS', 409);
    }

    // Create remolt and update counters in transaction
    await db.runTransaction(async (transaction) => {
      const remoltData: Omit<Remolt, 'id'> = {
        agent_id: agent!.id,
        molt_id: moltId,
        created_at: Timestamp.now(),
      };

      transaction.set(remoltRef, remoltData);
      transaction.update(moltRef, {
        remolt_count: FieldValue.increment(1),
      });
    });

    // Create remolt notification and send webhook (async, don't block response)
    if (moltData.agent_id !== agent!.id) {
      createRemoltNotification(
        db,
        { id: agent!.id, name: agent!.name },
        moltId,
        moltData.agent_id,
        Timestamp.now()
      ).catch((err) => {
        console.error('Failed to create remolt notification:', err);
      });

      // Send webhook to molt owner
      db.collection('agents').doc(moltData.agent_id).get().then((ownerDoc) => {
        if (ownerDoc.exists) {
          const owner = ownerDoc.data() as Agent;
          sendWebhookIfConfigured(owner, 'remolt', {
            from_agent: { id: agent!.id, name: agent!.name },
            molt: { id: moltId, content: moltData.content },
          });
        }
      }).catch(() => {});
    }

    return successResponse({ remolted: true, molt_id: moltId }, 201);
  } catch (error) {
    console.error('Remolt error:', error);
    return errorResponse('Failed to remolt', 'INTERNAL_ERROR', 500);
  }
}

// DELETE: Undo remolt
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

    // Check if remolt exists
    const remoltId = `${agent!.id}_${moltId}`;
    const remoltRef = db.collection('remolts').doc(remoltId);
    const existingRemolt = await remoltRef.get();

    if (!existingRemolt.exists) {
      return errorResponse('Remolt not found', 'NOT_FOUND', 404);
    }

    // Get molt to update counter
    const moltRef = db.collection('molts').doc(moltId);
    const moltDoc = await moltRef.get();

    // Delete remolt and update counter in transaction
    await db.runTransaction(async (transaction) => {
      transaction.delete(remoltRef);

      if (moltDoc.exists) {
        transaction.update(moltRef, {
          remolt_count: FieldValue.increment(-1),
        });
      }
    });

    return successResponse({ remolted: false, molt_id: moltId });
  } catch (error) {
    console.error('Undo remolt error:', error);
    return errorResponse('Failed to undo remolt', 'INTERNAL_ERROR', 500);
  }
}
