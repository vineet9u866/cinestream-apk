"use client";

import { useEffect, useState } from "react";
import { MBSubject, GENRES } from "@/lib/moviebox";
import { fetchSearch } from "@/lib/api-client";
import { MovieCard } from "./MovieCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/stores/app-store";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchPageProps {
  keyword: string;
}

interface SearchResponse {
  code: number;
  data?: {
    pager: { hasMore: boolean; nextPage: string };
    items: MBSubject[];
  };
  error?: string;
}

export function SearchPage({ keyword }: SearchPageProps) {
  const go = useApp((s) => s.go);
  const [items, setItems] = useState<MBSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [localKeyword, setLocalKeyword] = useState(keyword);

  // Sync from URL
  useEffect(() => {
    setLocalKeyword(keyword);
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;
    if (!keyword) {
      setItems([]);
      setLoading(false);
      return;
    }
    (async () => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const json = await fetchSearch(keyword, page, 24, 0) as SearchResponse;
        if (cancelled) return;
        const newItems = json?.data?.items ?? [];
        setItems((prev) => (page === 1 ? newItems : [...prev, ...newItems]));
        setHasMore(Boolean(json?.data?.pager?.hasMore));
      } catch {
        if (!cancelled) {
          if (page === 1) setItems([]);
          setHasMore(false);
        }
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
  }, [keyword, page]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = localKeyword.trim();
    if (q && q !== keyword) {
      go({ kind: "search", keyword: q });
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-6">
      <header className="mb-6">
        <form onSubmit={submit} className="relative max-w-xl">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            autoFocus
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            placeholder="Search movies, series, actors..."
            className="pl-10 pr-4 h-12 bg-card/60 border-border text-base"
          />
        </form>
      </header>

      {keyword && (
        <p className="text-sm text-muted-foreground mb-6">
          {loading
            ? `Searching for "${keyword}"...`
            : items.length > 0
              ? `Showing results for "${keyword}"`
              : `No results found for "${keyword}"`}
        </p>
      )}

      {!keyword ? (
        <div className="py-12 text-center">
          <h2 className="text-xl font-bold mb-2">Start typing to search</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Find movies and series across thousands of titles
          </p>
          <div className="flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
            {["Avatar", "Marvel", "Stranger Things", "Action", "Comedy", "2024"].map(
              (t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setLocalKeyword(t);
                    go({ kind: "search", keyword: t });
                  }}
                >
                  {t}
                </Button>
              )
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-base text-muted-foreground">
            No matches. Try a different keyword.
          </p>
          <p className="text-xs mt-2 text-muted-foreground">
            Tip: search for franchise names like &quot;Avengers&quot; or actors like
            &quot;Tom Cruise&quot;.
          </p>
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
