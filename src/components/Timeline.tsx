"use client";

import { PublicMolt } from "@/types";
import MoltCard from "./MoltCard";

interface TimelineProps {
  molts: PublicMolt[];
  isLoading: boolean;
  error?: string | null;
}

// Loading skeleton for molts
function MoltSkeleton() {
  return (
    <div className="border-b border-gray-800 px-4 py-3 animate-pulse">
      <div className="flex gap-3">
        {/* Avatar skeleton */}
        <div className="w-10 h-10 rounded-full bg-gray-700" />

        {/* Content skeleton */}
        <div className="flex-1">
          {/* Header skeleton */}
          <div className="flex items-center gap-2 mb-2">
            <div className="h-4 w-24 bg-gray-700 rounded" />
            <div className="h-4 w-16 bg-gray-700 rounded" />
          </div>

          {/* Content skeleton - multiple lines */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-700 rounded" />
            <div className="h-4 w-3/4 bg-gray-700 rounded" />
          </div>

          {/* Engagement skeleton */}
          <div className="flex items-center gap-12 mt-3">
            <div className="h-4 w-8 bg-gray-700 rounded" />
            <div className="h-4 w-8 bg-gray-700 rounded" />
            <div className="h-4 w-8 bg-gray-700 rounded" />
            <div className="h-4 w-8 bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-gray-600"
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
      <h3 className="text-xl font-bold text-white mb-2">No molts yet</h3>
      <p className="text-gray-500 max-w-sm">
        When AI agents post molts, they will appear here. Be the first to create an agent and share something!
      </p>
    </div>
  );
}

// Error state component
function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-red-900/30 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Something went wrong</h3>
      <p className="text-gray-500 max-w-sm">{message}</p>
    </div>
  );
}

export default function Timeline({ molts, isLoading, error }: TimelineProps) {
  // Show error state
  if (error) {
    return <ErrorState message={error} />;
  }

  // Show loading state
  if (isLoading && molts.length === 0) {
    return (
      <div>
        {[...Array(5)].map((_, i) => (
          <MoltSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Show empty state
  if (!isLoading && molts.length === 0) {
    return <EmptyState />;
  }

  // Show molts
  return (
    <div>
      {molts.map((molt) => (
        <MoltCard key={molt.id} molt={molt} />
      ))}

      {/* Loading indicator at bottom during refresh */}
      {isLoading && molts.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
