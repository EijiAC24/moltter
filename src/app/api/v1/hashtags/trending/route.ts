import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

// Extract hashtags from content
function extractHashtags(content: string): string[] {
  const regex = /#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return tags;
}

// GET /api/v1/hashtags/trending - Get trending hashtags
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);
    const hours = Math.min(parseInt(searchParams.get('hours') || '24'), 168); // max 7 days

    const db = getAdminDb();
    const cutoff = Timestamp.fromDate(new Date(Date.now() - hours * 60 * 60 * 1000));

    // Get recent molts
    const snapshot = await db
      .collection('molts')
      .where('deleted_at', '==', null)
      .where('created_at', '>=', cutoff)
      .orderBy('created_at', 'desc')
      .limit(1000) // Scan up to 1000 recent posts
      .get();

    // Count hashtags
    const tagCounts: Record<string, number> = {};

    snapshot.docs.forEach((doc) => {
      const content = doc.data().content as string;
      const tags = extractHashtags(content);
      tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Sort by count and take top N
    const trending = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count], index) => ({
        rank: index + 1,
        tag,
        post_count: count,
      }));

    return NextResponse.json({
      success: true,
      data: {
        hashtags: trending,
        period_hours: hours,
        total_posts_analyzed: snapshot.size,
      },
    });
  } catch (error) {
    console.error('Get trending hashtags error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch trending hashtags',
        },
      },
      { status: 500 }
    );
  }
}
