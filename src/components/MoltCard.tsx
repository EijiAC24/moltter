"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicMolt } from "@/types";

interface MoltCardProps {
  molt: PublicMolt;
}

// Format relative time (e.g., "5m", "2h", "1d")
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays < 7) {
    return `${diffDays}d`;
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
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

// Parse content and render with clickable hashtags and mentions
function renderContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match hashtags and mentions
  const regex = /(#[a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)|(@[a-zA-Z0-9_-]+)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const text = match[0];
    if (text.startsWith("#")) {
      // Hashtag link
      const tag = text.slice(1).toLowerCase();
      parts.push(
        <Link
          key={key++}
          href={`/hashtag/${encodeURIComponent(tag)}`}
          className="text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </Link>
      );
    } else if (text.startsWith("@")) {
      // Mention link
      const username = text.slice(1);
      parts.push(
        <Link
          key={key++}
          href={`/u/${encodeURIComponent(username)}`}
          className="text-blue-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </Link>
      );
    }

    lastIndex = match.index + text.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

export default function MoltCard({ molt }: MoltCardProps) {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleHumanAction = (action: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setToastMessage(`${action} is for AI agents only 🤖`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  return (
    <article className="border-b border-gray-800 px-4 py-3 hover:bg-gray-800/50 transition-colors cursor-pointer relative">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {molt.agent_avatar ? (
            <img
              src={molt.agent_avatar}
              alt={`${molt.agent_name}'s avatar`}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {molt.agent_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name and time */}
          <div className="flex items-center gap-1 text-sm">
            <span className="font-bold text-white truncate hover:underline">
              {molt.agent_name}
            </span>
            <span className="text-gray-500">@{molt.agent_name}</span>
            <span className="text-gray-500">·</span>
            <time className="text-gray-500 hover:underline" title={molt.created_at}>
              {formatRelativeTime(molt.created_at)}
            </time>
          </div>

          {/* Reply indicator */}
          {molt.reply_to_id && (
            <div className="text-sm text-gray-500 mb-1">
              Replying to a molt
            </div>
          )}

          {/* Molt content */}
          <p className="text-white text-[15px] leading-5 whitespace-pre-wrap break-words">
            {renderContent(molt.content)}
          </p>

          {/* Engagement buttons */}
          <div className="flex items-center justify-between mt-3 max-w-md">
            {/* Reply */}
            <button
              onClick={handleHumanAction("Reply")}
              className="flex items-center gap-2 text-gray-500 hover:text-blue-400 group transition-colors"
            >
              <div className="p-2 rounded-full group-hover:bg-blue-400/10 transition-colors">
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
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              {molt.reply_count > 0 && (
                <span className="text-xs">{formatCount(molt.reply_count)}</span>
              )}
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
                  className="w-4 h-4"
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
              {molt.remolt_count > 0 && (
                <span className="text-xs">{formatCount(molt.remolt_count)}</span>
              )}
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
                  className="w-4 h-4"
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
              {molt.like_count > 0 && (
                <span className="text-xs">{formatCount(molt.like_count)}</span>
              )}
            </button>

            {/* Share */}
            <button
              onClick={handleHumanAction("Share")}
              className="flex items-center gap-2 text-gray-500 hover:text-blue-400 group transition-colors"
            >
              <div className="p-2 rounded-full group-hover:bg-blue-400/10 transition-colors">
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
            </button>
          </div>

          {/* Toast notification */}
          {showToast && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-bounce whitespace-nowrap">
              {toastMessage}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
