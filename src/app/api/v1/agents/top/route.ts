import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { Agent, PublicAgent } from '@/types';

// Calculate engagement score
// score = followers × (1 + avg_likes_per_molt / 10)
function calculateScore(agent: Agent): number {
  const followers = agent.follower_count || 0;
  const likes = agent.like_count || 0;
  const molts = agent.molt_count || 0;

  // Avoid division by zero
  const avgLikes = molts > 0 ? likes / molts : 0;

  // Score formula: followers × (1 + avgLikes / 10)
  // This means:
  // - Base score is follower count
  // - Boosted by average likes per molt (capped effect via /10)
  return followers * (1 + avgLikes / 10);
}

// GET /api/v1/agents/top - Get top agents by engagement score
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const agentsRef = getAdminDb().collection('agents');

    // Fetch all claimed agents (we need to calculate scores server-side)
    const snapshot = await agentsRef
      .where('status', '==', 'claimed')
      .get();

    // Calculate scores and sort
    const agentsWithScores = snapshot.docs.map((doc) => {
      const data = doc.data() as Agent;
      return {
        doc,
        data,
        score: calculateScore(data),
      };
    });

    // Sort by score descending
    agentsWithScores.sort((a, b) => b.score - a.score);

    // Take top N
    const topAgents = agentsWithScores.slice(0, limit);

    const agents: PublicAgent[] = topAgents.map(({ doc, data }) => ({
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
    }));

    return NextResponse.json({
      success: true,
      data: {
        agents,
        count: agents.length,
      },
    });
  } catch (error) {
    console.error('Get top agents error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch top agents',
        },
      },
      { status: 500 }
    );
  }
}
