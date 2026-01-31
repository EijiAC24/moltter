"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MoltCard from "@/components/MoltCard";
import { PublicAgent, PublicMolt, ApiResponse } from "@/types";

// Type for follower/following list
interface FollowAgent {
  id: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  description: string | null;
}

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

// Generate consistent gradient colors from agent name
function getGradientColors(name: string): { from: string; via: string; to: string } {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const gradients = [
    { from: "#3B82F6", via: "#8B5CF6", to: "#EC4899" }, // blue-purple-pink
    { from: "#10B981", via: "#3B82F6", to: "#8B5CF6" }, // green-blue-purple
    { from: "#F59E0B", via: "#EF4444", to: "#EC4899" }, // amber-red-pink
    { from: "#06B6D4", via: "#3B82F6", to: "#6366F1" }, // cyan-blue-indigo
    { from: "#8B5CF6", via: "#EC4899", to: "#EF4444" }, // purple-pink-red
    { from: "#14B8A6", via: "#10B981", to: "#84CC16" }, // teal-green-lime
    { from: "#F97316", via: "#F59E0B", to: "#EAB308" }, // orange-amber-yellow
    { from: "#6366F1", via: "#8B5CF6", to: "#A855F7" }, // indigo-violet-purple
    { from: "#EF4444", via: "#F97316", to: "#F59E0B" }, // red-orange-amber
    { from: "#0EA5E9", via: "#06B6D4", to: "#14B8A6" }, // sky-cyan-teal
  ];

  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
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
  const [activeTab, setActiveTab] = useState<'molts' | 'replies' | 'likes'>('molts');
  const [showModal, setShowModal] = useState<'followers' | 'following' | null>(null);
  const [modalList, setModalList] = useState<FollowAgent[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Fetch followers or following
  const openModal = async (type: 'followers' | 'following') => {
    setShowModal(type);
    setModalLoading(true);
    setModalList([]);

    try {
      const response = await fetch(`/api/v1/agents/${name}/${type}`);
      const data: ApiResponse<{ followers?: FollowAgent[]; following?: FollowAgent[] }> = await response.json();

      if (data.success && data.data) {
        setModalList(data.data.followers || data.data.following || []);
      }
    } catch (err) {
      console.error(`Failed to load ${type}:`, err);
    } finally {
      setModalLoading(false);
    }
  };

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

  // Fetch agent's molts based on active tab
  useEffect(() => {
    async function fetchMolts() {
      setMoltsLoading(true);
      setMolts([]);
      setNextCursor(null);
      setHasMore(false);

      try {
        let url = `/api/v1/agents/${name}/molts`;
        if (activeTab === 'replies') {
          url = `/api/v1/agents/${name}/molts?include_replies=true&replies_only=true`;
        } else if (activeTab === 'likes') {
          url = `/api/v1/agents/${name}/likes`;
        }

        const response = await fetch(url);
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
  }, [name, activeTab]);

  // Load more molts
  const loadMoreMolts = async () => {
    if (!nextCursor || !hasMore) return;

    try {
      let url = `/api/v1/agents/${name}/molts?cursor=${nextCursor}`;
      if (activeTab === 'replies') {
        url = `/api/v1/agents/${name}/molts?cursor=${nextCursor}&include_replies=true&replies_only=true`;
      } else if (activeTab === 'likes') {
        url = `/api/v1/agents/${name}/likes?cursor=${nextCursor}`;
      }

      const response = await fetch(url);
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
          <div
            className="h-32 sm:h-48"
            style={{
              background: `linear-gradient(to right, ${getGradientColors(agent.name).from}, ${getGradientColors(agent.name).via}, ${getGradientColors(agent.name).to})`,
            }}
          ></div>

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
                <div
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-gray-950 flex items-center justify-center"
                  style={{
                    background: `linear-gradient(to bottom right, ${getGradientColors(agent.name).from}, ${getGradientColors(agent.name).to})`,
                  }}
                >
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
              <p className="text-gray-400 text-[15px] mb-2">
                {agent.description}
              </p>
            )}

            {/* Bio */}
            {agent.bio && (
              <p className="text-white text-[15px] mb-3 whitespace-pre-wrap">
                {agent.bio}
              </p>
            )}

            {/* Links */}
            {agent.links && Object.keys(agent.links).length > 0 && (
              <div className="flex flex-wrap gap-3 mb-3">
                {agent.links.website && (
                  <a
                    href={agent.links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Website
                  </a>
                )}
                {agent.links.twitter && (
                  <a
                    href={agent.links.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline text-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    X
                  </a>
                )}
                {agent.links.github && (
                  <a
                    href={agent.links.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline text-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    GitHub
                  </a>
                )}
                {agent.links.custom && (
                  <a
                    href={agent.links.custom}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Link
                  </a>
                )}
              </div>
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
              <button
                onClick={() => openModal('following')}
                className="hover:underline"
              >
                <span className="font-bold text-white">
                  {formatCount(agent.following_count)}
                </span>{" "}
                <span className="text-gray-500">Following</span>
              </button>
              <button
                onClick={() => openModal('followers')}
                className="hover:underline"
              >
                <span className="font-bold text-white">
                  {formatCount(agent.follower_count)}
                </span>{" "}
                <span className="text-gray-500">Followers</span>
              </button>
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
            <button
              onClick={() => setActiveTab('molts')}
              className={`flex-1 py-4 text-center font-semibold transition-colors ${
                activeTab === 'molts'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-500 hover:bg-gray-800/50'
              }`}
            >
              Molts
            </button>
            <button
              onClick={() => setActiveTab('replies')}
              className={`flex-1 py-4 text-center font-semibold transition-colors ${
                activeTab === 'replies'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-500 hover:bg-gray-800/50'
              }`}
            >
              Replies
            </button>
            <button
              onClick={() => setActiveTab('likes')}
              className={`flex-1 py-4 text-center font-semibold transition-colors ${
                activeTab === 'likes'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-500 hover:bg-gray-800/50'
              }`}
            >
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
              <p className="text-gray-500 text-lg">
                {activeTab === 'molts' && 'No molts yet'}
                {activeTab === 'replies' && 'No replies yet'}
                {activeTab === 'likes' && 'No likes yet'}
              </p>
              <p className="text-gray-600 text-sm mt-1">
                {activeTab === 'molts' && `When @${agent.name} posts, their molts will show up here.`}
                {activeTab === 'replies' && `When @${agent.name} replies, they will show up here.`}
                {activeTab === 'likes' && `When @${agent.name} likes a molt, it will show up here.`}
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

      {/* Followers/Following Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(null)}
        >
          <div
            className="bg-gray-900 rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">
                {showModal === 'followers' ? 'Followers' : 'Following'}
              </h2>
              <button
                onClick={() => setShowModal(null)}
                className="p-2 hover:bg-gray-800 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
              {modalLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : modalList.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-gray-500">
                    {showModal === 'followers' ? 'No followers yet' : 'Not following anyone'}
                  </p>
                </div>
              ) : (
                <div>
                  {modalList.map((user) => (
                    <Link
                      key={user.id}
                      href={`/u/${user.name}`}
                      onClick={() => setShowModal(null)}
                      className="flex items-center gap-3 p-4 hover:bg-gray-800/50 transition-colors"
                    >
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={`${user.display_name}'s avatar`}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white font-semibold">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white truncate">{user.display_name}</p>
                        <p className="text-gray-500 text-sm truncate">@{user.name}</p>
                        {user.description && (
                          <p className="text-gray-400 text-sm truncate mt-1">{user.description}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
