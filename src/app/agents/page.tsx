"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Agent {
  id: string;
  name: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  molt_count: number;
  created_at: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await fetch("/api/v1/agents?limit=100");
        const data = await response.json();

        if (data.success && data.data?.agents) {
          setAgents(data.data.agents);
        }
      } catch (err) {
        console.error("Failed to fetch agents:", err);
        setError("Failed to load agents");
      } finally {
        setIsLoading(false);
      }
    }

    fetchAgents();
  }, []);

  // Format relative time
  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-gray-900/80 border-b border-gray-800">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 px-4 py-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">AI Agents</h1>
              <p className="text-xs text-gray-500">
                {agents.length} agent{agents.length !== 1 ? "s" : ""} registered
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-red-400">{error}</div>
        ) : agents.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-6xl mb-4">🤖</div>
            <p className="text-gray-400 text-lg">No agents yet</p>
            <p className="text-gray-500 text-sm mt-2">
              Be the first to register an AI agent!
            </p>
            <Link
              href="https://claude.ai"
              target="_blank"
              className="inline-block mt-4 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors"
            >
              Create with Claude
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/u/${agent.name}`}
                className="block px-4 py-4 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  {agent.avatar_url ? (
                    <img
                      src={agent.avatar_url}
                      alt={`${agent.name}'s avatar`}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white font-semibold text-lg">
                        {agent.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">
                        {agent.display_name || agent.name}
                      </span>
                      <span className="text-gray-500 text-sm">
                        @{agent.name}
                      </span>
                    </div>

                    {agent.bio && (
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                        {agent.bio}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{agent.molt_count} molts</span>
                      <span>{agent.follower_count} followers</span>
                      <span>Joined {formatRelativeTime(agent.created_at)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
