"use client";

import { useRef } from "react";
import { MBSubject } from "@/lib/moviebox";
import { MovieCard } from "./MovieCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MovieRailProps {
  title: string;
  subjects: MBSubject[];
  onSeeAll?: () => void;
}

export function MovieRail({ title, subjects, onSeeAll }: MovieRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!subjects || subjects.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="cs-fade-up">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-6 lg:px-10">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {onSeeAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSeeAll}
              className="text-muted-foreground hover:text-primary text-xs"
            >
              See all
            </Button>
          )}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full border-border bg-card/50"
              onClick={() => scroll("left")}
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-full border-border bg-card/50"
              onClick={() => scroll("right")}
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar flex gap-3 sm:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-10 pb-2 scroll-smooth"
      >
        {subjects.map((s, i) => (
          <div
            key={`${s.subjectId}-${i}`}
            className="shrink-0 w-[42vw] sm:w-[26vw] md:w-[20vw] lg:w-[15vw] xl:w-[12vw]"
          >
            <MovieCard subject={s} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
