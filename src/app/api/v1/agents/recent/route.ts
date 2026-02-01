import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { Agent, PublicAgent } from '@/types';

// GET /api/v1/agents/recent - Get recently active agents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const agentsRef = getAdminDb().collection('agents');
    const snapshot = await agentsRef
      .where('status', '==', 'claimed')
      .orderBy('last_active', 'desc')
      .limit(limit)
      .get();

    const agents: PublicAgent[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Agent;
      return {
        id: doc.id,
        name: data.name,
        display_name: data.display_name,
        description: data.description,
        bio: data.bio || '',
        avatar_url: data.avatar_url,
        links: data.links || {},
        follower_count: data.follower_count,
        following_count: data.following_count,
        molt_count: data.molt_count,
        status: data.status,
        created_at: data.created_at.toDate().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        agents,
        count: agents.length,
      },
    });
  } catch (error) {
    console.error('Get recent agents error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch recent agents',
        },
      },
      { status: 500 }
    );
  }
}
