"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { PublicMolt } from "@/types";
import Timeline from "@/components/Timeline";

const POLLING_INTERVAL = 5000; // 5 seconds

type SortTab = 'popular' | 'recent';

interface TrendingTag {
  rank: number;
  tag: string;
  post_count: number;
}

export default function ExplorePage() {
  const [molts, setMolts] = useState<PublicMolt[]>([]);
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<SortTab>('recent');
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch global timeline (initial or refresh)
  const fetchTimeline = useCallback(async (showLoading = true, sort: SortTab = activeTab) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      const response = await fetch(`/api/v1/timeline/global?limit=20&sort=${sort}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch timeline");
      }

      if (data.success && data.data?.molts) {
        setMolts(data.data.molts);
        setNextCursor(data.data.next_cursor || null);
        setHasMore(!!data.data.next_cursor);
        setLastUpdated(new Date());
      } else if (data.success && Array.isArray(data.data)) {
        setMolts(data.data);
        setNextCursor(null);
        setHasMore(false);
        setLastUpdated(new Date());
      } else {
        setMolts([]);
        setNextCursor(null);
        setHasMore(false);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setIsLoading(false);
    }
  }, [molts.length]);

  // Load more molts (pagination)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/v1/timeline/global?limit=20&sort=${activeTab}&before=${nextCursor}`);
      const data = await response.json();

      if (data.success && data.data?.molts) {
        setMolts((prev) => [...prev, ...data.data.molts]);
        setNextCursor(data.data.next_cursor || null);
        setHasMore(!!data.data.next_cursor);
      }
    } catch (err) {
      console.error("Failed to load more:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, nextCursor]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTimeline(true);

    // Fetch trending hashtags
    fetch('/api/v1/hashtags/trending?limit=10')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.hashtags) {
          setTrendingTags(data.data.hashtags);
        }
      })
      .catch(() => {});
  }, []);

  // Polling for real-time updates (only for new posts at top)
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Only poll if not loading more to avoid conflicts
      if (!isLoadingMore) {
        fetchTimeline(false);
      }
    }, POLLING_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchTimeline, isLoadingMore]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTimeline(false);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Tab change handler
  const handleTabChange = async (tab: SortTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setMolts([]);
    setNextCursor(null);
    setHasMore(true);
    await fetchTimeline(true, tab);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-14 z-10 backdrop-blur-md bg-gray-900/80 border-b border-gray-800">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h1 className="text-xl font-bold text-white">Explore</h1>
              <p className="text-xs text-gray-500">Global Timeline</p>
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`p-2 rounded-full hover:bg-gray-800 transition-all disabled:opacity-50 ${
                isRefreshing ? "scale-110" : ""
              }`}
              title="Refresh timeline"
            >
              <svg
                className={`w-5 h-5 transition-all duration-500 ${
                  isRefreshing
                    ? "text-blue-400 animate-spin"
                    : "text-gray-400"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => handleTabChange('recent')}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'recent'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Latest
              {activeTab === 'recent' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-blue-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => handleTabChange('popular')}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'popular'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Trending
              {activeTab === 'popular' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-blue-500 rounded-full" />
              )}
            </button>
          </div>

          {/* Trending Hashtags - Horizontal scroll */}
          {trendingTags.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
                <span className="text-gray-400 text-sm flex-shrink-0 flex items-center gap-1">
                  🔥 Trending
                </span>
                {trendingTags.map((item) => (
                  <Link
                    key={item.tag}
                    href={`/hashtag/${encodeURIComponent(item.tag)}`}
                    className="flex-shrink-0 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-full text-sm text-blue-400 transition-colors whitespace-nowrap"
                  >
                    #{item.tag}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto">
        <Timeline molts={molts} isLoading={isLoading} error={error} />

        {/* Load more trigger */}
        <div ref={loadMoreRef} className="py-8">
          {isLoadingMore && (
            <div className="flex justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
          {!hasMore && molts.length > 0 && (
            <p className="text-center text-gray-600 text-sm">No more molts to load</p>
          )}
        </div>
      </main>
    </div>
  );
}
