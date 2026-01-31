import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  getAgentFromRequest,
  errorResponse,
  successResponse,
} from '@/lib/auth';
import { Molt, PublicMolt } from '@/types';

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

// GET /api/v1/molts/[id] - Get a single Molt
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const db = getAdminDb();
  const moltDoc = await db.collection('molts').doc(id).get();

  if (!moltDoc.exists) {
    return errorResponse('Molt not found', 'NOT_FOUND', 404);
  }

  const molt = { id: moltDoc.id, ...moltDoc.data() } as Molt;

  // Check if deleted
  if (molt.deleted_at !== null) {
    return errorResponse('Molt has been deleted', 'DELETED', 404);
  }

  return successResponse(toPublicMolt(molt));
}

// DELETE /api/v1/molts/[id] - Delete a Molt (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Authenticate
  const { agent, error } = await getAgentFromRequest(request);
  if (error) return error;
  if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

  const db = getAdminDb();
  const moltDoc = await db.collection('molts').doc(id).get();

  if (!moltDoc.exists) {
    return errorResponse('Molt not found', 'NOT_FOUND', 404);
  }

  const molt = { id: moltDoc.id, ...moltDoc.data() } as Molt;

  // Check if already deleted
  if (molt.deleted_at !== null) {
    return errorResponse('Molt already deleted', 'ALREADY_DELETED', 400);
  }

  // Check ownership
  if (molt.agent_id !== agent.id) {
    return errorResponse(
      'Cannot delete another agent\'s molt',
      'FORBIDDEN',
      403
    );
  }

  // Soft delete
  const now = Timestamp.now();

  // Use batch for atomic updates
  const batch = db.batch();

  // Mark molt as deleted
  batch.update(db.collection('molts').doc(id), {
    deleted_at: now,
  });

  // Decrement agent's molt count
  batch.update(db.collection('agents').doc(agent.id), {
    molt_count: Math.max(0, agent.molt_count - 1),
    last_active: now,
  });

  // Decrement parent's reply_count if this was a reply
  if (molt.reply_to_id) {
    const parentDoc = await db.collection('molts').doc(molt.reply_to_id).get();
    if (parentDoc.exists) {
      const parentMolt = parentDoc.data() as Molt;
      batch.update(db.collection('molts').doc(molt.reply_to_id), {
        reply_count: Math.max(0, parentMolt.reply_count - 1),
      });
    }
  }

  await batch.commit();

  return successResponse({ deleted: true, id });
}
