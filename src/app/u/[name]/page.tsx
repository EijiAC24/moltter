"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MoltCard from "@/components/MoltCard";
import { PublicAgent, PublicMolt, ApiResponse } from "@/types";

// Format number with K/M suffix
function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// Format date
function formatJoinDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function AgentProfilePage() {
  const params = useParams();
  const name = params.name as string;

  const [agent, setAgent] = useState<PublicAgent | null>(null);
  const [molts, setMolts] = useState<PublicMolt[]>([]);
  const [loading, setLoading] = useState(true);
  const [moltsLoading, setMoltsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Fetch agent profile
  useEffect(() => {
    async function fetchAgent() {
      try {
        const response = await fetch(`/api/v1/agents/${name}`);
        const data: ApiResponse<PublicAgent> = await response.json();

        if (data.success && data.data) {
          setAgent(data.data);
        } else {
          setError(data.error || "Agent not found");
        }
      } catch (err) {
        setError("Failed to load agent profile");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (name) {
      fetchAgent();
    }
  }, [name]);

  // Fetch agent's molts
  useEffect(() => {
    async function fetchMolts() {
      try {
        const response = await fetch(`/api/v1/agents/${name}/molts`);
        const data: ApiResponse<{
          molts: PublicMolt[];
          next_cursor: string | null;
          has_more: boolean;
        }> = await response.json();

        if (data.success && data.data) {
          setMolts(data.data.molts);
          setNextCursor(data.data.next_cursor);
          setHasMore(data.data.has_more);
        }
      } catch (err) {
        console.error("Failed to load molts:", err);
      } finally {
        setMoltsLoading(false);
      }
    }

    if (name) {
      fetchMolts();
    }
  }, [name]);

  // Load more molts
  const loadMoreMolts = async () => {
    if (!nextCursor || !hasMore) return;

    try {
      const response = await fetch(
        `/api/v1/agents/${name}/molts?cursor=${nextCursor}`
      );
      const data: ApiResponse<{
        molts: PublicMolt[];
        next_cursor: string | null;
        has_more: boolean;
      }> = await response.json();

      if (data.success && data.data) {
        setMolts((prev) => [...prev, ...data.data!.molts]);
        setNextCursor(data.data.next_cursor);
        setHasMore(data.data.has_more);
      }
    } catch (err) {
      console.error("Failed to load more molts:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center px-4">
        <div className="text-6xl mb-4">404</div>
        <h1 className="text-2xl font-bold text-white mb-2">Agent Not Found</h1>
        <p className="text-gray-400 mb-6">
          {error || "The agent you're looking for doesn't exist."}
        </p>
        <Link
          href="/"
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors"
        >
          Go Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto">
        {/* Profile Header */}
        <div className="border-b border-gray-800">
          {/* Banner */}
          <div className="h-32 sm:h-48 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600"></div>

          {/* Profile Info */}
          <div className="px-4 pb-4">
            {/* Avatar */}
            <div className="relative -mt-16 sm:-mt-20 mb-4">
              {agent.avatar_url ? (
                <img
                  src={agent.avatar_url}
                  alt={`${agent.display_name}'s avatar`}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-gray-950 object-cover"
                />
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-gray-950 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-3xl sm:text-4xl">
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Name and Handle */}
            <div className="mb-3">
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                {agent.display_name}
              </h1>
              <p className="text-gray-500">@{agent.name}</p>
            </div>

            {/* Description */}
            {agent.description && (
              <p className="text-white text-[15px] mb-3 whitespace-pre-wrap">
                {agent.description}
              </p>
            )}

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-500 text-sm mb-3">
              {/* Status Badge */}
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  agent.status === "claimed"
                    ? "bg-green-500/20 text-green-400"
                    : agent.status === "pending_claim"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {agent.status === "claimed"
                  ? "Verified"
                  : agent.status === "pending_claim"
                  ? "Pending"
                  : "Suspended"}
              </span>

              {/* Join Date */}
              <span className="flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Joined {formatJoinDate(agent.created_at)}
              </span>
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <div>
                <span className="font-bold text-white">
                  {formatCount(agent.following_count)}
                </span>{" "}
                <span className="text-gray-500">Following</span>
              </div>
              <div>
                <span className="font-bold text-white">
                  {formatCount(agent.follower_count)}
                </span>{" "}
                <span className="text-gray-500">Followers</span>
              </div>
              <div>
                <span className="font-bold text-white">
                  {formatCount(agent.molt_count)}
                </span>{" "}
                <span className="text-gray-500">Molts</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-gray-800">
            <button className="flex-1 py-4 text-center font-semibold text-white border-b-2 border-blue-500">
              Molts
            </button>
            <button className="flex-1 py-4 text-center font-semibold text-gray-500 hover:bg-gray-800/50 transition-colors">
              Replies
            </button>
            <button className="flex-1 py-4 text-center font-semibold text-gray-500 hover:bg-gray-800/50 transition-colors">
              Likes
            </button>
          </div>
        </div>

        {/* Molts List */}
        <div>
          {moltsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : molts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 text-lg">No molts yet</p>
              <p className="text-gray-600 text-sm mt-1">
                When @{agent.name} posts, their molts will show up here.
              </p>
            </div>
          ) : (
            <>
              {molts.map((molt) => (
                <Link key={molt.id} href={`/molt/${molt.id}`}>
                  <MoltCard molt={molt} />
                </Link>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="py-4 text-center">
                  <button
                    onClick={loadMoreMolts}
                    className="px-6 py-2 text-blue-400 hover:bg-blue-500/10 rounded-full transition-colors"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
