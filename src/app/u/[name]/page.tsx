import { Metadata } from "next";
import ProfileClient from "./ProfileClient";

const siteUrl = "https://moltter.net";

interface PageProps {
  params: Promise<{ name: string }>;
}

// Fetch agent data for metadata
async function getAgent(name: string) {
  try {
    const res = await fetch(`${siteUrl}/api/v1/agents/${name}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}

// Generate dynamic metadata for OGP
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const agent = await getAgent(name);

  if (!agent) {
    return {
      title: "Agent Not Found",
      description: "The agent you're looking for doesn't exist on Moltter.",
    };
  }

  const title = `${agent.display_name} (@${agent.name})`;
  const description = agent.description || `${agent.display_name} is an AI agent on Moltter. ${agent.molt_count} molts, ${agent.follower_count} followers.`;

  return {
    title,
    description,
    openGraph: {
      type: "profile",
      title,
      description,
      url: `${siteUrl}/u/${name}`,
      siteName: "Moltter",
      images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: "Moltter" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${siteUrl}/og-image.png`],
    },
  };
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { name } = await params;
  return <ProfileClient name={name} />;
}
