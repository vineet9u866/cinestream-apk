"use client";

import { useEffect, useState } from "react";
import {
  MBHomeData,
  MBSubject,
  MBTrendingData,
  GENRES,
  PLATFORMS,
} from "@/lib/moviebox";
import { safeJson } from "@/lib/utils";
import { useApp } from "@/stores/app-store";
import { Hero } from "./Hero";
import { MovieRail } from "./MovieRail";
import { MovieCard } from "./MovieCard";
import { Skeleton } from "@/components/ui/skeleton";

interface HomeResponse {
  code: number;
  data?: MBHomeData;
  message?: string;
}

interface TrendingResponse {
  code: number;
  data?: MBTrendingData;
}

export function HomePage() {
  const go = useApp((s) => s.go);
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [trending, setTrending] = useState<TrendingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Use safeJson so empty/invalid upstream responses don't throw
        // "Unexpected end of JSON input". Each response gets a fallback
        // object with code=500 on failure, so the UI degrades gracefully.
        const [h, t] = await Promise.all([
          safeJson<HomeResponse>(await fetch("/api/home"), "Failed to load home feed"),
          safeJson<TrendingResponse>(await fetch("/api/trending"), "Failed to load trending"),
        ]);
        if (!cancelled) {
          setHome(h);
          setTrending(t);
        }
      } catch {
        // Network error — safeJson already handled body parse issues,
        // but a fetch() rejection (e.g. network down) lands here.
        if (!cancelled) {
          setHome({ code: 500, message: "Network error" });
          setTrending({ code: 500 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Banner items (featured)
  const bannerItems =
    home?.data?.operatingList?.find((o) => o.type === "BANNER")?.banner?.items ??
    [];
  const bannerSubjects: MBSubject[] = bannerItems
    .map((b) => b.subject)
    .filter(Boolean);

  // Other operating lists (curated rails)
  const otherOps =
    home?.data?.operatingList?.filter((o) => o.type !== "BANNER" && o.subjects?.length > 0) ?? [];

  // Trending
  const trendingSubjects = trending?.data?.subjectList ?? [];

  // Genre preview rails
  const popularGenres = GENRES.slice(0, 6);

  return (
    <div className="pb-10">
      {loading ? (
        <>
          <Skeleton className="h-[70vh] min-h-[480px] w-full rounded-none" />
          <div className="mt-8 px-4 sm:px-6 lg:px-10">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="shrink-0 w-[180px] aspect-[2/3] rounded-xl" />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <Hero subjects={bannerSubjects} />

          <div className="mt-8 sm:mt-10 space-y-10">
            {trendingSubjects.length > 0 && (
              <MovieRail
                title="🔥 Trending Now"
                subjects={trendingSubjects}
                onSeeAll={() =>
                  go({ kind: "browse", subjectType: 0, title: "Trending Now" })
                }
              />
            )}

            {otherOps.map((op, i) => (
              <MovieRail
                key={`op-${i}-${op.title}`}
                title={op.title?.replace(/_/g, " ") || "Featured"}
                subjects={op.subjects}
              />
            ))}

            {/* Genre preview rails */}
            {popularGenres.map((g) => (
              <GenreRail key={g} genre={g} />
            ))}

            {/* Platforms */}
            <PlatformGrid />
          </div>
        </>
      )}
    </div>
  );
}

function GenreRail({ genre }: { genre: string }) {
  const go = useApp((s) => s.go);
  const [items, setItems] = useState<MBSubject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: 1, perPage: 30, subjectType: 0, genre, sort: "hot" }),
        });
        // safeJson handles empty/invalid bodies without throwing.
        const json = await safeJson<{ code: number; data?: { items: MBSubject[] } }>(
          res,
          `Failed to load ${genre} movies`
        );
        if (cancelled) return;
        // Filter to actual movies/series/animation only
        const filtered = (json?.data?.items ?? []).filter(
          (s: MBSubject) => [1, 2, 4].includes(s.subjectType)
        );
        setItems(filtered.slice(0, 18));
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [genre]);

  if (!items || items.length === 0) return null;

  return (
    <MovieRail
      title={genre}
      subjects={items}
      onSeeAll={() =>
        go({ kind: "browse", subjectType: 0, genre, title: `${genre}` })
      }
    />
  );
}

function PlatformGrid() {
  const go = useApp((s) => s.go);
  return (
    <section className="px-4 sm:px-6 lg:px-10 cs-fade-up">
      <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
        Browse by Platform
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() =>
              go({
                kind: "browse",
                subjectType: 0,
                title: `${p} Picks`,
                genre: undefined,
              })
            }
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-card to-secondary border border-border p-5 h-20 flex items-center justify-center text-center transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5"
          >
            <span className="text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
              {p}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
