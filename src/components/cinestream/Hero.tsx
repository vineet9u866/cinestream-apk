"use client";

import { useEffect, useState } from "react";
import { MBSubject } from "@/lib/moviebox";
import { useApp } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Play, Info, Star } from "lucide-react";

interface HeroProps {
  subjects: MBSubject[];
}

export function Hero({ subjects }: HeroProps) {
  const go = useApp((s) => s.go);
  const [idx, setIdx] = useState(0);

  // Pick the first 5 subjects that have a backdrop-ish cover
  const slides = (subjects || []).slice(0, 5);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, 8000);
    return () => clearInterval(t);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <section className="relative h-[60vh] sm:h-[70vh] min-h-[420px] bg-card animate-pulse" />
    );
  }

  const current = slides[idx];

  return (
    <section className="relative h-[70vh] sm:h-[75vh] min-h-[480px] w-full overflow-hidden">
      {/* Background image (cross-fade) */}
      {slides.map((s, i) => (
        <div
          key={s.subjectId}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
        >
          <img
            src={s.cover?.url}
            alt={s.title}
            className="h-full w-full object-cover object-top"
          />
          <div className="absolute inset-0 cs-hero-overlay" />
        </div>
      ))}

      {/* Content */}
      <div className="relative h-full flex items-end pb-12 sm:pb-20">
        <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-10">
          <div className="max-w-2xl cs-fade-up" key={current.subjectId}>
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/90 text-primary-foreground text-xs font-semibold px-2.5 py-1">
                <Star className="h-3 w-3 fill-current" />
                {current.imdbRatingValue || "Featured"}
              </span>
              <span className="text-xs font-medium text-foreground/80 uppercase tracking-wider">
                {current.releaseDate?.slice(0, 4)}
              </span>
              {current.genre && (
                <span className="text-xs font-medium text-foreground/60">
                  {current.genre.split(",").slice(0, 2).join(" • ")}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.05] drop-shadow-2xl">
              {current.title}
            </h1>

            {current.postTitle && (
              <p className="mt-3 text-sm sm:text-base text-foreground/70 italic line-clamp-1">
                {current.postTitle}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3">
              <Button
                size="lg"
                onClick={() =>
                  go({
                    kind: "detail",
                    subjectId: current.subjectId,
                    subjectType: current.subjectType,
                  })
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 sm:px-8 h-11 sm:h-12 text-sm sm:text-base font-semibold"
              >
                <Play className="h-5 w-5 fill-current" />
                Watch Now
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() =>
                  go({
                    kind: "detail",
                    subjectId: current.subjectId,
                    subjectType: current.subjectType,
                  })
                }
                className="bg-card/80 backdrop-blur-md text-foreground hover:bg-card border border-border px-6 sm:px-8 h-11 sm:h-12 text-sm sm:text-base"
              >
                <Info className="h-5 w-5" />
                Details
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-10 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-primary" : "w-4 bg-foreground/30 hover:bg-foreground/50"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
