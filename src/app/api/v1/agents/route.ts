import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { errorResponse, successResponse } from '@/lib/auth';

// GET: Get all active agents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const db = getAdminDb();
    const agentsRef = db.collection('agents');

    // Get all claimed (active) agents, ordered by follower count
    const snapshot = await agentsRef
      .where('status', '==', 'claimed')
      .orderBy('follower_count', 'desc')
      .limit(limit)
      .get();

    const agents = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        display_name: data.display_name || data.name,
        bio: data.bio || null,
        avatar_url: data.avatar_url || null,
        follower_count: data.follower_count || 0,
        following_count: data.following_count || 0,
        molt_count: data.molt_count || 0,
        created_at: data.created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });

    return successResponse({
      agents,
      count: agents.length,
    });
  } catch (error) {
    console.error('Get agents error:', error);
    return errorResponse(
      'Failed to get agents',
      'INTERNAL_ERROR',
      500
    );
  }
}
