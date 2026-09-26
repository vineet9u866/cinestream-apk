"use client";

import { useEffect, useState } from "react";
import {
  MBDetailData,
  MBSubject,
  MBDub,
  formatDuration,
  subjectTypeLabel,
} from "@/lib/moviebox";
import { safeJson } from "@/lib/utils";
import { useApp } from "@/stores/app-store";
import { VideoPlayer } from "./VideoPlayer";
import { MovieCard } from "./MovieCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Calendar, Clock, Globe, Play, ChevronLeft, AlertCircle } from "lucide-react";

interface DetailPageProps {
  subjectId: string;
  subjectType: number;
}

interface DetailResponse {
  code: number;
  data?: MBDetailData;
  message?: string;
}

interface RecResponse {
  code: number;
  data?: { items: MBSubject[] };
}

export function DetailPage({ subjectId, subjectType }: DetailPageProps) {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [recs, setRecs] = useState<MBSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setRecs([]);
    (async () => {
      try {
        // Fetch detail + recommendations in parallel. Use safeJson so
        // that an empty or invalid response body doesn't throw an
        // unhandled "Unexpected end of JSON input" error.
        const [d, r] = await Promise.all([
          safeJson<DetailResponse>(
            await fetch(`/api/detail?subjectId=${subjectId}`),
            "Failed to load title details"
          ),
          safeJson<RecResponse>(
            await fetch(
              `/api/recommendations?subjectId=${subjectId}&subjectType=${subjectType}`
            ),
            "Failed to load recommendations"
          ),
        ]);
        if (cancelled) return;
        if (d.code !== 0 || !d.data) {
          setError(d.message || "This title could not be loaded.");
          return;
        }
        setDetail(d);
        setRecs(r?.data?.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || "Failed to load title.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId, subjectType]);

  if (loading || (!detail && !error)) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6">
        <Skeleton className="h-8 w-24 mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="aspect-video lg:col-span-2 rounded-xl" />
          <Skeleton className="aspect-[2/3] rounded-xl" />
        </div>
        <Skeleton className="h-6 w-48 mt-8 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error || !detail?.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={back}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-foreground max-w-md">
            {error || "This title could not be loaded. It may have been removed or is temporarily unavailable."}
          </p>
          <Button size="sm" variant="outline" onClick={() => go({ kind: "home" })}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const subject = detail.data.subject;
  const stars = detail.data.stars || [];
  const seasons = detail.data.resource?.seasons || [];
  const trailerUrl = subject.trailer?.videoAddress?.url;
  const dubs: MBDub[] = subject.dubs || [];
  const subtitles = subject.subtitles || "";

  const year = subject.releaseDate?.slice(0, 4) || "";
  const duration = formatDuration(subject.duration);
  const genres = (subject.genre || "").split(",").filter(Boolean);
  const directors = stars.filter((s) => s.staffType === 2).slice(0, 3);
  const actors = stars.filter((s) => s.staffType === 1).slice(0, 12);
  const rating = subject.imdbRatingValue;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-10 py-6 pb-16 min-w-0">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={back}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0">
        {/* Player column (2/3 width on desktop) */}
        <div className="lg:col-span-2 min-w-0">
          <VideoPlayer
            subjectId={subjectId}
            detailPath={subject.detailPath || ""}
            subjectType={subject.subjectType}
            seasons={seasons}
            trailerUrl={trailerUrl}
            posterUrl={subject.cover?.url}
            title={subject.title}
            dubs={dubs}
            subtitles={subtitles}
          />
        </div>

        {/* Info column */}
        <div className="space-y-5">
          {/* Poster + meta */}
          <div className="flex gap-4">
            {subject.cover?.url && (
              <div className="shrink-0 w-28 sm:w-36">
                <img
                  src={subject.cover.url}
                  alt={subject.title}
                  className="w-full aspect-[2/3] object-cover rounded-lg ring-1 ring-border"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-tight">
                {subject.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {subjectTypeLabel(subject.subjectType)}
                  </Badge>
                </span>
                {year && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {year}
                  </span>
                )}
                {duration && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {duration}
                  </span>
                )}
              </div>

              {rating && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-2 py-1 text-sm font-bold">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {rating}
                  </span>
                  {subject.imdbRatingCount ? (
                    <span className="text-xs text-muted-foreground">
                      ({subject.imdbRatingCount.toLocaleString()} votes)
                    </span>
                  ) : null}
                </div>
              )}

              {genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <Badge
                      key={g}
                      variant="outline"
                      className="cursor-pointer hover:border-primary hover:text-primary"
                      onClick={() =>
                        go({
                          kind: "browse",
                          subjectType: 0,
                          genre: g,
                          title: g,
                        })
                      }
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {subject.description && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Overview
              </h2>
              <p className="text-sm text-foreground/85 leading-relaxed">
                {subject.description}
              </p>
            </div>
          )}

          {/* Country */}
          {subject.countryName && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Country:</span>
              <span className="text-foreground">{subject.countryName}</span>
            </div>
          )}

          {/* Subtitles */}
          {subject.subtitles && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Subtitles
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {subject.subtitles
                  .split(",")
                  .filter(Boolean)
                  .map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="text-[10px] font-normal"
                    >
                      {s}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {/* Director(s) */}
          {directors.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Director{directors.length > 1 ? "s" : ""}
              </h2>
              <div className="flex flex-wrap gap-2">
                {directors.map((d) => (
                  <span key={d.staffId} className="text-sm text-foreground">
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cast */}
          {actors.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Cast
              </h2>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {actors.map((a) => (
                  <div key={a.staffId} className="shrink-0 w-16 text-center">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-card ring-1 ring-border">
                      {a.avatarUrl ? (
                        <img
                          src={a.avatarUrl}
                          alt={a.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                          {a.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-foreground line-clamp-1">
                      {a.name}
                    </p>
                    {a.character && (
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {a.character}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source attribution */}
          {detail.data.resource?.source && (
            <div className="pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                Source: {detail.data.resource.source}
                {detail.data.resource.uploadBy &&
                  ` • Uploaded by ${detail.data.resource.uploadBy}`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {recs.length > 1 && (
        <section className="mt-12">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
            You Might Also Like
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {recs
              .filter((r) => r.subjectId !== subjectId)
              .filter(
                (r, i, arr) =>
                  arr.findIndex((x) => x.subjectId === r.subjectId) === i
              )
              .slice(0, 12)
              .map((s, i) => (
                <MovieCard key={`${s.subjectId}-${i}`} subject={s} index={i} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
