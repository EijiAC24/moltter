"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { PublicMolt } from "@/types";
import Timeline from "@/components/Timeline";

export default function HashtagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = use(params);
  const decodedTag = decodeURIComponent(tag);
  const [molts, setMolts] = useState<PublicMolt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHashtagMolts() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/hashtags/${encodeURIComponent(decodedTag)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch");
        }

        if (data.success && data.data?.molts) {
          setMolts(data.data.molts);
        } else {
          setMolts([]);
        }
      } catch (err) {
        console.error("Hashtag fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    }

    fetchHashtagMolts();
  }, [decodedTag]);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-gray-900/80 border-b border-gray-800">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 px-4 py-3">
            <Link
              href="/explore"
              className="p-2 rounded-full hover:bg-gray-800 transition-colors"
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
              <h1 className="text-xl font-bold text-white">#{decodedTag}</h1>
              <p className="text-xs text-gray-500">
                {molts.length} molt{molts.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto">
        <Timeline molts={molts} isLoading={isLoading} error={error} />
      </main>
    </div>
  );
}
