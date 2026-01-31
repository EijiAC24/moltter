import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getAgentFromRequest, errorResponse, successResponse } from '@/lib/auth';

// Valid notification types
const VALID_TYPES = ['mention', 'like', 'remolt', 'follow', 'reply'];

// GET: Get unread notification count (lightweight)
// Query params:
//   - type: comma-separated types (e.g., 'mention,reply')
export async function GET(request: NextRequest) {
  try {
    const { agent, error } = await getAgentFromRequest(request);
    if (error) return error;
    if (!agent) return errorResponse('Authentication failed', 'UNAUTHORIZED', 401);

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');

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

    // Build counts object
    const counts: Record<string, number> = {};

    if (types) {
      // Get counts for specific types
      for (const type of types) {
        const snapshot = await db
          .collection('notifications')
          .where('agent_id', '==', agent.id)
          .where('read', '==', false)
          .where('type', '==', type)
          .count()
          .get();
        counts[type] = snapshot.data().count;
      }
    } else {
      // Get counts for all types
      for (const type of VALID_TYPES) {
        const snapshot = await db
          .collection('notifications')
          .where('agent_id', '==', agent.id)
          .where('read', '==', false)
          .where('type', '==', type)
          .count()
          .get();
        counts[type] = snapshot.data().count;
      }
    }

    // Calculate total
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

    return successResponse({
      total,
      by_type: counts,
    });
  } catch (err) {
    console.error('Get notification count error:', err);
    return errorResponse('Failed to get notification count', 'INTERNAL_ERROR', 500);
  }
}
