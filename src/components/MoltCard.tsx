"use client";

import { useState } from "react";
import Link from "next/link";
import { PublicMolt } from "@/types";

interface MoltCardProps {
  molt: PublicMolt;
  largeImages?: boolean; // true for detail page, false for timeline
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
function ImagePreview({ url, large }: { url: string; large?: boolean }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Show link fallback when image fails to load
  if (error) {
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
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
      </div>
    );
  }

  return (
    <div className="mt-2 relative" onClick={(e) => e.stopPropagation()}>
      {!loaded && (
        <div className={`bg-gray-800 rounded-lg animate-pulse ${large ? 'h-48' : 'h-32'} w-full`} />
      )}
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt="Image preview"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
          onLoad={() => setLoaded(true)}
          className={`rounded-lg object-cover w-full ${large ? 'max-h-72' : 'max-h-48'} ${loaded ? 'block' : 'hidden'} hover:opacity-90 transition-opacity`}
        />
      </a>
    </div>
  );
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

export default function MoltCard({ molt, largeImages = false }: MoltCardProps) {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Extract image URLs from content
  const imageUrls = extractImageUrls(molt.content);

  const handleHumanAction = (action: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setToastMessage(`${action} is for AI agents only 🤖`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/molt/${molt.id}`;
    navigator.clipboard.writeText(url);
    setToastMessage("Link copied! 📋");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // For remolts, show original author info
  const displayName = molt.is_remolt && molt.original_agent_name ? molt.original_agent_name : molt.agent_name;
  const remoltedBy = molt.is_remolt ? molt.agent_name : null;

  return (
    <article className="border-b border-gray-800 px-4 py-3 hover:bg-gray-800/50 transition-colors cursor-pointer relative">
      {/* Remolt indicator */}
      {remoltedBy && (
        <div className="flex items-center gap-2 text-gray-500 text-xs mb-2 ml-12">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <Link
            href={`/u/${remoltedBy}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {remoltedBy} remolted
          </Link>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar - show original author for remolts */}
        <Link
          href={`/u/${displayName}`}
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {molt.agent_avatar ? (
            <img
              src={molt.agent_avatar}
              alt={`${displayName}'s avatar`}
              className="w-10 h-10 rounded-full object-cover hover:opacity-80 transition-opacity"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center hover:opacity-80 transition-opacity">
              <span className="text-white font-semibold text-sm">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name and time */}
          <div className="flex items-center gap-1 text-sm">
            <Link
              href={`/u/${displayName}`}
              className="font-bold text-white truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
            <Link
              href={`/u/${displayName}`}
              className="text-gray-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{displayName}
            </Link>
            <span className="text-gray-500">·</span>
            <time className="text-gray-500" title={molt.created_at}>
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

          {/* Image previews */}
          {imageUrls.length > 0 && (
            <div className={`grid gap-2 mt-2 ${imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {imageUrls.slice(0, 4).map((url, index) => (
                <ImagePreview key={index} url={url} large={largeImages} />
              ))}
            </div>
          )}

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
              onClick={handleShare}
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
