"use client";

import { useEffect, useState } from "react";
import { MBSubject, GENRES } from "@/lib/moviebox";
import { fetchFilter } from "@/lib/api-client";
import { MovieCard } from "./MovieCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface BrowsePageProps {
  subjectType?: number;
  genre?: string;
  title?: string;
}

interface FilterResponse {
  code: number;
  data?: {
    pager: { hasMore: boolean; nextPage: string };
    items: MBSubject[];
  };
}

export function BrowsePage({ subjectType, genre, title }: BrowsePageProps) {
  const [items, setItems] = useState<MBSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | undefined>(genre);

  const heading =
    title || (genre ? genre : subjectType === 1 ? "Movies" : subjectType === 2 ? "Series" : "Browse");

  // Reset on prop change
  useEffect(() => {
    setItems([]);
    setPage(1);
    setActiveGenre(genre);
  }, [subjectType, genre, title]);

  // Load page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const body: Record<string, unknown> = {
          page,
          perPage: 30, // fetch a bit more so client-side filtering still leaves a page worth
          subjectType: subjectType ?? 0,
          // "hot" returns sports videos when no genre is set; "latest" returns actual movies/series
          sort: activeGenre ? "hot" : "latest",
        };
        if (activeGenre) body.genre = activeGenre;
        const json = await fetchFilter(body as any);
        if (cancelled) return;
        let newItems = json?.data?.items ?? [];
        // Filter client-side to honor the requested subjectType.
        // The upstream API returns mixed content (sports videos, user uploads, etc.)
        // Allowed types: 1 = movie, 2 = series, 4 = animation, 6 = short video
        const allowedTypes = subjectType
          ? new Set([subjectType, 4]) // include animation as a sub-type
          : new Set([1, 2, 4]);
        newItems = newItems.filter((s) => allowedTypes.has(s.subjectType));
        // Cap to 18 per page so the grid looks consistent
        newItems = newItems.slice(0, 18);
        setItems((prev) => (page === 1 ? newItems : [...prev, ...newItems]));
        setHasMore(Boolean(json?.data?.pager?.hasMore));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, subjectType, activeGenre]);

  // When user changes genre via chips, reset to page 1
  const changeGenre = (g?: string) => {
    setActiveGenre(g);
    setItems([]);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {heading}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {items.length > 0 && `${items.length}+ titles`}
        </p>
      </header>

      {/* Genre chips */}
      <div className="mb-6 no-scrollbar flex gap-2 overflow-x-auto pb-2">
        <Button
          size="sm"
          variant={!activeGenre ? "secondary" : "outline"}
          className="shrink-0 rounded-full"
          onClick={() => changeGenre(undefined)}
        >
          All
        </Button>
        {GENRES.map((g) => (
          <Button
            key={g}
            size="sm"
            variant={activeGenre === g ? "secondary" : "outline"}
            className="shrink-0 rounded-full"
            onClick={() => changeGenre(g)}
          >
            {g}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p className="text-base">No titles found in this category.</p>
          <p className="text-xs mt-2">Try a different genre or check back later.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {items
              .filter(
                (s, i, arr) =>
                  arr.findIndex((x) => x.subjectId === s.subjectId) === i
              )
              .map((s, i) => (
                <MovieCard key={`${s.subjectId}-${i}`} subject={s} index={i} />
              ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                variant="outline"
                disabled={loadingMore}
                onClick={() => setPage((p) => p + 1)}
                className="min-w-40"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
