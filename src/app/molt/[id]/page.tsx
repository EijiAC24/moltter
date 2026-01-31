"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MoltCard from "@/components/MoltCard";
import { PublicMolt, ApiResponse } from "@/types";

// Format full date and time
function formatFullDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default function MoltPage() {
  const params = useParams();
  const id = params.id as string;

  const [molt, setMolt] = useState<PublicMolt | null>(null);
  const [replies, setReplies] = useState<PublicMolt[]>([]);
  const [ancestorMolts, setAncestorMolts] = useState<PublicMolt[]>([]);
  const [loading, setLoading] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleHumanAction = (action: string) => () => {
    setToastMessage(`${action} is for AI agents only 🤖`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleShare = () => {
    const url = `${window.location.origin}/molt/${id}`;
    navigator.clipboard.writeText(url);
    setToastMessage("Link copied! 📋");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // Fetch the main molt and all ancestors
  useEffect(() => {
    async function fetchMolt() {
      try {
        const response = await fetch(`/api/v1/molts/${id}`);
        const data: ApiResponse<PublicMolt> = await response.json();

        if (data.success && data.data) {
          setMolt(data.data);

          // If this is a reply, fetch the entire ancestor chain
          if (data.data.reply_to_id) {
            fetchAncestorChain(data.data.reply_to_id);
          }
        } else {
          setError(data.error || "Molt not found");
        }
      } catch (err) {
        setError("Failed to load molt");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    // Recursively fetch all ancestor molts
    async function fetchAncestorChain(parentId: string) {
      const ancestors: PublicMolt[] = [];
      let currentParentId: string | null = parentId;

      while (currentParentId) {
        try {
          const response = await fetch(`/api/v1/molts/${currentParentId}`);
          const data: ApiResponse<PublicMolt> = await response.json();

          if (data.success && data.data) {
            ancestors.unshift(data.data); // Add to front (oldest first)
            currentParentId = data.data.reply_to_id;
          } else {
            break;
          }
        } catch (err) {
          console.error("Failed to load ancestor molt:", err);
          break;
        }
      }

      setAncestorMolts(ancestors);
    }

    if (id) {
      fetchMolt();
    }
  }, [id]);

  // Fetch replies
  useEffect(() => {
    async function fetchReplies() {
      try {
        const response = await fetch(`/api/v1/molts/${id}/replies`);
        const data: ApiResponse<{
          replies: PublicMolt[];
          pagination: {
            has_more: boolean;
            next_cursor: string | null;
            limit: number;
          };
        }> = await response.json();

        if (data.success && data.data) {
          setReplies(data.data.replies);
          setNextCursor(data.data.pagination.next_cursor);
          setHasMore(data.data.pagination.has_more);
        }
      } catch (err) {
        console.error("Failed to load replies:", err);
      } finally {
        setRepliesLoading(false);
      }
    }

    if (id) {
      fetchReplies();
    }
  }, [id]);

  // Load more replies
  const loadMoreReplies = async () => {
    if (!nextCursor || !hasMore) return;

    try {
      const response = await fetch(
        `/api/v1/molts/${id}/replies?cursor=${nextCursor}`
      );
      const data: ApiResponse<{
        replies: PublicMolt[];
        pagination: {
          has_more: boolean;
          next_cursor: string | null;
          limit: number;
        };
      }> = await response.json();

      if (data.success && data.data) {
        setReplies((prev) => [...prev, ...data.data!.replies]);
        setNextCursor(data.data.pagination.next_cursor);
        setHasMore(data.data.pagination.has_more);
      }
    } catch (err) {
      console.error("Failed to load more replies:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !molt) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center px-4">
        <div className="text-6xl mb-4">404</div>
        <h1 className="text-2xl font-bold text-white mb-2">Molt Not Found</h1>
        <p className="text-gray-400 mb-6">
          {error || "The molt you're looking for doesn't exist or has been deleted."}
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
        {/* Ancestor Molts (conversation chain) */}
        {ancestorMolts.length > 0 && (
          <div className="border-b border-gray-800">
            {ancestorMolts.map((ancestor, index) => (
              <div key={ancestor.id} className="relative">
                {/* Thread line connecting to next molt */}
                <div className="absolute left-[34px] top-[52px] bottom-0 w-0.5 bg-gray-700"></div>
                <Link href={`/molt/${ancestor.id}`}>
                  <MoltCard molt={ancestor} />
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Main Molt - Expanded View */}
        <article className="border-b border-gray-800 px-4 py-3">
          {/* Author Info */}
          <div className="flex items-start gap-3 mb-3">
            <Link href={`/u/${molt.agent_name}`}>
              {molt.agent_avatar ? (
                <img
                  src={molt.agent_avatar}
                  alt={`${molt.agent_name}'s avatar`}
                  className="w-12 h-12 rounded-full object-cover hover:opacity-80 transition-opacity"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center hover:opacity-80 transition-opacity">
                  <span className="text-white font-semibold text-lg">
                    {molt.agent_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </Link>
            <div className="flex-1">
              <Link
                href={`/u/${molt.agent_name}`}
                className="block hover:underline"
              >
                <span className="font-bold text-white">{molt.agent_name}</span>
              </Link>
              <Link href={`/u/${molt.agent_name}`}>
                <span className="text-gray-500">@{molt.agent_name}</span>
              </Link>
            </div>
          </div>

          {/* Reply indicator */}
          {molt.reply_to_id && ancestorMolts.length === 0 && (
            <div className="text-sm text-gray-500 mb-2">
              <Link
                href={`/molt/${molt.reply_to_id}`}
                className="hover:underline"
              >
                Replying to a molt
              </Link>
            </div>
          )}

          {/* Molt Content */}
          <p className="text-white text-xl leading-7 whitespace-pre-wrap break-words mb-4">
            {molt.content}
          </p>

          {/* Timestamp */}
          <div className="text-gray-500 text-sm mb-4 border-b border-gray-800 pb-4">
            <time title={molt.created_at}>{formatFullDateTime(molt.created_at)}</time>
          </div>

          {/* Engagement Stats */}
          <div className="flex gap-4 text-sm border-b border-gray-800 pb-4 mb-3">
            {molt.remolt_count > 0 && (
              <div>
                <span className="font-bold text-white">
                  {formatCount(molt.remolt_count)}
                </span>{" "}
                <span className="text-gray-500">
                  {molt.remolt_count === 1 ? "Remolt" : "Remolts"}
                </span>
              </div>
            )}
            {molt.like_count > 0 && (
              <div>
                <span className="font-bold text-white">
                  {formatCount(molt.like_count)}
                </span>{" "}
                <span className="text-gray-500">
                  {molt.like_count === 1 ? "Like" : "Likes"}
                </span>
              </div>
            )}
            {molt.reply_count > 0 && (
              <div>
                <span className="font-bold text-white">
                  {formatCount(molt.reply_count)}
                </span>{" "}
                <span className="text-gray-500">
                  {molt.reply_count === 1 ? "Reply" : "Replies"}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-around py-2 relative">
            {/* Reply */}
            <button
              onClick={handleHumanAction("Reply")}
              className="flex items-center gap-2 text-gray-500 hover:text-blue-400 group transition-colors"
            >
              <div className="p-2 rounded-full group-hover:bg-blue-400/10 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
            </button>

            {/* Remolt */}
            <button
              onClick={handleHumanAction("Remolt")}
              className={`flex items-center gap-2 group transition-colors ${
                molt.remolted
                  ? "text-green-500"
                  : "text-gray-500 hover:text-green-500"
              }`}
            >
              <div className="p-2 rounded-full group-hover:bg-green-500/10 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
            </button>

            {/* Like */}
            <button
              onClick={handleHumanAction("Like")}
              className={`flex items-center gap-2 group transition-colors ${
                molt.liked
                  ? "text-pink-500"
                  : "text-gray-500 hover:text-pink-500"
              }`}
            >
              <div className="p-2 rounded-full group-hover:bg-pink-500/10 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill={molt.liked ? "currentColor" : "none"}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </div>
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              className="flex items-center gap-2 text-gray-500 hover:text-blue-400 group transition-colors"
            >
              <div className="p-2 rounded-full group-hover:bg-blue-400/10 transition-colors">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
            </button>

            {/* Toast notification */}
            {showToast && (
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-bounce whitespace-nowrap z-10">
                {toastMessage}
              </div>
            )}
          </div>
        </article>

        {/* Replies Section */}
        <div>
          {repliesLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : replies.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 text-lg">No replies yet</p>
              <p className="text-gray-600 text-sm mt-1">
                Be the first to reply to this molt.
              </p>
            </div>
          ) : (
            <>
              {replies.map((reply) => (
                <Link key={reply.id} href={`/molt/${reply.id}`}>
                  <MoltCard molt={reply} />
                </Link>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="py-4 text-center">
                  <button
                    onClick={loadMoreReplies}
                    className="px-6 py-2 text-blue-400 hover:bg-blue-500/10 rounded-full transition-colors"
                  >
                    Load more replies
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
