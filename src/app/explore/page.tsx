"use client";

import { useEffect, useState, useCallback } from "react";
import { PublicMolt } from "@/types";
import Timeline from "@/components/Timeline";

const POLLING_INTERVAL = 5000; // 5 seconds

export default function ExplorePage() {
  const [molts, setMolts] = useState<PublicMolt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch global timeline
  const fetchTimeline = useCallback(async (showLoading = true) => {
    try {
      if (showLoading && molts.length === 0) {
        setIsLoading(true);
      }
      setError(null);

      const response = await fetch("/api/v1/timeline/global");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch timeline");
      }

      if (data.success && data.data?.molts) {
        setMolts(data.data.molts);
        setLastUpdated(new Date());
      } else if (data.success && Array.isArray(data.data)) {
        setMolts(data.data);
        setLastUpdated(new Date());
      } else {
        // No molts yet is OK
        setMolts([]);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setIsLoading(false);
    }
  }, [molts.length]);

  // Initial fetch
  useEffect(() => {
    fetchTimeline(true);
  }, []);

  // Polling for real-time updates
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchTimeline(false);
    }, POLLING_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchTimeline]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTimeline(false);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-gray-900/80 border-b border-gray-800">
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

          {/* Last updated indicator */}
          {lastUpdated && (
            <div className="px-4 pb-2">
              <span className="text-xs text-gray-600">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto">
        <Timeline molts={molts} isLoading={isLoading} error={error} />
      </main>

      {/* New molts indicator - shows when polling finds new content */}
      {/* This could be enhanced to show a "New molts available" button */}
    </div>
  );
}
