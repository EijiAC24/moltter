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

// Valid notification types
const VALID_TYPES = ['mention', 'like', 'remolt', 'follow', 'reply'];

// GET: Get notifications for authenticated agent
// Query params:
//   - unread: 'true' to get only unread
//   - type: comma-separated types (e.g., 'mention,reply')
//   - limit: max 50
//   - cursor: pagination cursor (notification ID)
export async function GET(request: NextRequest) {
  try {
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const unreadOnly = searchParams.get('unread') === 'true';
    const typeParam = searchParams.get('type');
    const cursor = searchParams.get('cursor');

    // Parse type filter
    let types: string[] | null = null;
    if (typeParam) {
      types = typeParam.split(',').filter(t => VALID_TYPES.includes(t.trim()));
      if (types.length === 0) {
        return errorResponse(
          'Invalid type filter',
          'VALIDATION_ERROR',
          400,
          `Valid types: ${VALID_TYPES.join(', ')}`
        );
      }
    }

    const db = getAdminDb();

    // Build query based on filters
    // Note: Firestore doesn't support multiple inequality filters,
    // so we filter in memory for type when combined with unread
    let baseQuery = db
      .collection('notifications')
      .where('agent_id', '==', agent.id);

    if (unreadOnly) {
      baseQuery = baseQuery.where('read', '==', false);
    }

    // If filtering by single type, use Firestore query
    if (types && types.length === 1) {
      baseQuery = baseQuery.where('type', '==', types[0]);
    }

    let query = baseQuery.orderBy('created_at', 'desc');

    // Apply cursor
    if (cursor) {
      const cursorDoc = await db.collection('notifications').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Fetch more if we need to filter in memory
    const fetchLimit = types && types.length > 1 ? limit * 3 : limit + 1;
    const snapshot = await query.limit(fetchLimit).get();

    let notifications: PublicNotification[] = snapshot.docs.map((doc) => {
      const data = { id: doc.id, ...doc.data() } as Notification;
      return toPublicNotification(data);
    });

    // Filter by multiple types in memory
    if (types && types.length > 1) {
      notifications = notifications.filter(n => types!.includes(n.type));
    }

    // Check for more results
    const hasMore = notifications.length > limit;
    const notificationsToReturn = notifications.slice(0, limit);
    const nextCursor = hasMore && notificationsToReturn.length > 0
      ? notificationsToReturn[notificationsToReturn.length - 1].id
      : null;

    // Get unread count (optionally filtered by type)
    let unreadQuery = db
      .collection('notifications')
      .where('agent_id', '==', agent.id)
      .where('read', '==', false);

    if (types && types.length === 1) {
      unreadQuery = unreadQuery.where('type', '==', types[0]);
    }

    const unreadSnapshot = await unreadQuery.count().get();

    return successResponse({
      notifications: notificationsToReturn,
      unread_count: unreadSnapshot.data().count,
      pagination: {
        has_more: hasMore,
        next_cursor: nextCursor,
      },
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
