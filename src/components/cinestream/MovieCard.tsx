"use client";

import { MBSubject, formatDuration, subjectTypeLabel } from "@/lib/moviebox";
import { useApp } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";

interface MovieCardProps {
  subject: MBSubject;
  index?: number;
}

export function MovieCard({ subject, index = 0 }: MovieCardProps) {
  const go = useApp((s) => s.go);

  const cover = subject.cover?.url;
  const year = subject.releaseDate ? subject.releaseDate.slice(0, 4) : "";
  const rating = subject.imdbRatingValue || "";
  const type = subjectTypeLabel(subject.subjectType);
  const duration = formatDuration(subject.duration);

  return (
    <button
      onClick={() =>
        go({
          kind: "detail",
          subjectId: subject.subjectId,
          subjectType: subject.subjectType,
        })
      }
      className="group relative block w-full text-left cs-fade-up"
      style={{ animationDelay: `${Math.min(index * 30, 600)}ms` }}
      aria-label={`Watch ${subject.title}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-card ring-1 ring-border transition-all duration-300 group-hover:ring-2 group-hover:ring-primary group-hover:shadow-2xl group-hover:shadow-primary/20 group-hover:-translate-y-1">
        {cover ? (
          <img
            src={cover}
            alt={subject.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs px-2 text-center">
            {subject.title}
          </div>
        )}

        {/* Bottom gradient overlay with title (always visible on touch, on hover for desktop) */}
        <div className="absolute inset-0 cs-card-overlay opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300" />

        <div className="absolute bottom-0 left-0 right-0 p-3 md:opacity-0 md:group-hover:opacity-100 md:translate-y-2 md:group-hover:translate-y-0 transition-all duration-300">
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {subject.title}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {year && <span>{year}</span>}
            {rating && (
              <span className="flex items-center gap-1 text-primary">
                <StarIcon /> {rating}
              </span>
            )}
          </div>
        </div>

        {/* Top badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {subject.corner && (
            <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 h-5">
              {subject.corner}
            </Badge>
          )}
        </div>
        <div className="absolute right-2 top-2">
          <span className="inline-flex items-center rounded-md bg-black/60 backdrop-blur-sm text-[10px] px-1.5 py-0.5 text-foreground/80 font-medium">
            {type}
          </span>
        </div>

        {/* Duration bottom-right (when not hovering) */}
        {duration && (
          <div className="absolute bottom-2 right-2 md:opacity-100 md:group-hover:opacity-0 transition-opacity">
            <span className="inline-flex items-center rounded-md bg-black/60 backdrop-blur-sm text-[10px] px-1.5 py-0.5 text-foreground/80 font-medium">
              {duration}
            </span>
          </div>
        )}
      </div>

      {/* Title under card (mobile-first visible; hidden on hover overlay desktop) */}
      <div className="mt-2 md:hidden">
        <h3 className="text-sm font-medium text-foreground line-clamp-1">
          {subject.title}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {year} {rating && `• ★ ${rating}`}
        </p>
      </div>
    </button>
  );
}

function StarIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
