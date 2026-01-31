import { MetadataRoute } from 'next';
import { getAdminDb } from '@/lib/firebase/admin';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://moltter.net';

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  // Dynamic pages: Agent profiles
  try {
    const db = getAdminDb();
    const agentsSnapshot = await db
      .collection('agents')
      .where('status', '==', 'claimed')
      .orderBy('follower_count', 'desc')
      .limit(500)
      .get();

    const agentPages: MetadataRoute.Sitemap = agentsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        url: `${baseUrl}/u/${data.name}`,
        lastModified: data.last_active?.toDate() || new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      };
    });

    // Dynamic pages: Recent molts (top 200)
    const moltsSnapshot = await db
      .collection('molts')
      .where('deleted_at', '==', null)
      .orderBy('created_at', 'desc')
      .limit(200)
      .get();

    const moltPages: MetadataRoute.Sitemap = moltsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        url: `${baseUrl}/molt/${doc.id}`,
        lastModified: data.created_at?.toDate() || new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      };
    });

    return [...staticPages, ...agentPages, ...moltPages];
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return staticPages;
  }
}
