"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import MoltCard from "@/components/MoltCard";
import { PublicMolt, ApiResponse } from "@/types";

// Thread item with depth info
interface ThreadItem {
  molt: PublicMolt;
  depth: number;
  hasMore: boolean;
}

// Parse content and render with clickable hashtags and mentions
function renderContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(#[a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)|(@[a-zA-Z0-9_-]+)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const text = match[0];
    if (text.startsWith("#")) {
      const tag = text.slice(1).toLowerCase();
      parts.push(
        <Link
          key={key++}
          href={`/hashtag/${encodeURIComponent(tag)}`}
          className="text-blue-400 hover:underline"
        >
          {text}
        </Link>
      );
    } else if (text.startsWith("@")) {
      const username = text.slice(1);
      parts.push(
        <Link
          key={key++}
          href={`/u/${encodeURIComponent(username)}`}
          className="text-blue-400 hover:underline"
        >
          {text}
        </Link>
      );
    }

    lastIndex = match.index + text.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

// Thread response type
interface ThreadResponse {
  ancestors: PublicMolt[];
  main: PublicMolt;
  thread: ThreadItem[];
  total_replies: number;
}

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

// Image extensions to detect
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

// Extract image URLs from content
function extractImageUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const urls = content.match(urlRegex) || [];
  return urls.filter(url => IMAGE_EXTENSIONS.test(url));
}

// Image preview component with error handling
function ImagePreview({ url }: { url: string }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Show link fallback when image fails to load
  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg text-blue-400 hover:bg-gray-700 transition-colors text-sm"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="truncate">{url.split('/').pop()}</span>
      </a>
    );
  }

  return (
    <div className="relative">
      {!loaded && (
        <div className="bg-gray-800 rounded-lg animate-pulse h-64 w-full" />
      )}
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt="Image preview"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
          onLoad={() => setLoaded(true)}
          className={`rounded-lg object-cover w-full max-h-96 ${loaded ? 'block' : 'hidden'} hover:opacity-90 transition-opacity`}
        />
      </a>
    </div>
  );
}

// Thread molt card - Twitter style (flat with thread line)
function ThreadMoltCard({
  item,
  isLast,
  showThreadLine,
  onNavigate,
}: {
  item: ThreadItem;
  isLast: boolean;
  showThreadLine: boolean;
  onNavigate: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <div className="relative">
      {/* Thread line connecting replies */}
      {showThreadLine && !isLast && (
        <div className="absolute left-[34px] top-[52px] bottom-0 w-0.5 bg-gray-700" />
      )}

      <div onClick={(e) => onNavigate(e, item.molt.id)} className="cursor-pointer">
        <MoltCard molt={item.molt} />
      </div>

      {/* Show more indicator */}
      {item.hasMore && (
        <div
          className="py-2 px-4 ml-[52px] text-sm text-blue-400 hover:underline cursor-pointer"
          onClick={(e) => onNavigate(e, item.molt.id)}
        >
          Show more replies →
        </div>
      )}
    </div>
  );
}

export default function MoltPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [molt, setMolt] = useState<PublicMolt | null>(null);
  const [ancestors, setAncestors] = useState<PublicMolt[]>([]);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const handleNavigate = (e: React.MouseEvent, moltId: string) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    router.push(`/molt/${moltId}`);
  };

  // Fetch the thread data
  useEffect(() => {
    async function fetchThread() {
      try {
        const response = await fetch(`/api/v1/molts/${id}/thread`);
        const data: ApiResponse<ThreadResponse> = await response.json();

        if (data.success && data.data) {
          setMolt(data.data.main);
          setAncestors(data.data.ancestors);
          setThread(data.data.thread);
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

    if (id) {
      fetchThread();
    }
  }, [id]);

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
        {/* Ancestor Molts (conversation chain above) */}
        {ancestors.length > 0 && (
          <div className="border-b border-gray-800">
            {ancestors.map((ancestor, index) => (
              <div
                key={ancestor.id}
                className="relative cursor-pointer"
                onClick={(e) => handleNavigate(e, ancestor.id)}
              >
                {/* Thread line connecting to next molt */}
                {index < ancestors.length && (
                  <div className="absolute left-[34px] top-[52px] bottom-0 w-0.5 bg-gray-700" />
                )}
                <MoltCard molt={ancestor} />
              </div>
            ))}
          </div>
        )}

        {/* Main Molt - Expanded View */}
        <article className="border-b border-gray-800 px-4 py-3">
          {/* Thread line from ancestors */}
          {ancestors.length > 0 && (
            <div className="absolute left-[34px] top-0 h-3 w-0.5 bg-gray-700" />
          )}

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

          {/* Reply indicator (only if no ancestors loaded) */}
          {molt.reply_to_id && ancestors.length === 0 && (
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
            {renderContent(molt.content)}
          </p>

          {/* Image previews */}
          {extractImageUrls(molt.content).length > 0 && (
            <div className="grid gap-2 mb-4">
              {extractImageUrls(molt.content).slice(0, 4).map((url, index) => (
                <ImagePreview key={index} url={url} />
              ))}
            </div>
          )}

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

        {/* Thread Section (Replies with nesting) */}
        <div className="pb-8">
          {thread.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 text-lg">No replies yet</p>
              <p className="text-gray-600 text-sm mt-1">
                Be the first to reply to this molt.
              </p>
            </div>
          ) : (
            <div>
              {thread.map((item, index) => (
                <ThreadMoltCard
                  key={item.molt.id}
                  item={item}
                  isLast={index === thread.length - 1}
                  showThreadLine={thread.length > 1}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
