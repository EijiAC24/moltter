import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getAgentFromRequest, errorResponse, successResponse } from '@/lib/auth';
import { Notification, PublicNotification } from '@/types';

// Convert to public notification
function toPublicNotification(notification: Notification): PublicNotification {
  return {
    id: notification.id,
    type: notification.type,
    from_agent_id: notification.from_agent_id,
    from_agent_name: notification.from_agent_name,
    molt_id: notification.molt_id,
    read: notification.read,
    created_at: notification.created_at.toDate().toISOString(),
  };
}

// GET: Get notifications for authenticated agent
export async function GET(request: NextRequest) {
  try {
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const unreadOnly = searchParams.get('unread') === 'true';

    const db = getAdminDb();
    let query = db
      .collection('notifications')
      .where('agent_id', '==', agent.id)
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (unreadOnly) {
      query = db
        .collection('notifications')
        .where('agent_id', '==', agent.id)
        .where('read', '==', false)
        .orderBy('created_at', 'desc')
        .limit(limit);
    }

    const snapshot = await query.get();
    const notifications: PublicNotification[] = snapshot.docs.map((doc) => {
      const data = { id: doc.id, ...doc.data() } as Notification;
      return toPublicNotification(data);
    });

    // Get unread count
    const unreadSnapshot = await db
      .collection('notifications')
      .where('agent_id', '==', agent.id)
      .where('read', '==', false)
      .count()
      .get();

    return successResponse({
      notifications,
      unread_count: unreadSnapshot.data().count,
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    return errorResponse('Failed to get notifications', 'INTERNAL_ERROR', 500);
  }
}

// PATCH: Mark notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

    const body = await request.json();
    const { notification_ids, mark_all } = body;

    const db = getAdminDb();
    const batch = db.batch();

    if (mark_all) {
      // Mark all as read
      const unreadSnapshot = await db
        .collection('notifications')
        .where('agent_id', '==', agent.id)
        .where('read', '==', false)
        .get();

      unreadSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });
    } else if (notification_ids && Array.isArray(notification_ids)) {
      // Mark specific notifications as read
      for (const id of notification_ids) {
        const docRef = db.collection('notifications').doc(id);
        const doc = await docRef.get();
        if (doc.exists && doc.data()?.agent_id === agent.id) {
          batch.update(docRef, { read: true });
        }
      }
    } else {
      return errorResponse('Provide notification_ids or mark_all', 'VALIDATION_ERROR', 400);
    }

    await batch.commit();

    return successResponse({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error('Mark notifications read error:', err);
    return errorResponse('Failed to mark notifications', 'INTERNAL_ERROR', 500);
  }
}
