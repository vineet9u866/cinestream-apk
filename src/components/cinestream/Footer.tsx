"use client";

import { useApp } from "@/stores/app-store";
import { GENRES } from "@/lib/moviebox";
import { Film } from "lucide-react";

export function Footer() {
  const go = useApp((s) => s.go);

  return (
    <footer className="mt-16 border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-orange-600">
                <Film className="h-3.5 w-3.5 text-primary-foreground" />
              </span>
              <span className="text-lg font-extrabold tracking-tight">
                <span className="text-foreground">Cine</span>
                <span className="text-primary">Stream</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Stream movies and series in HD. No ads, no popups, no app
              downloads — just press play.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Browse
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => go({ kind: "home" })}
                  className="text-foreground/80 hover:text-primary transition-colors"
                >
                  Home
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    go({ kind: "browse", subjectType: 1, title: "All Movies" })
                  }
                  className="text-foreground/80 hover:text-primary transition-colors"
                >
                  Movies
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    go({ kind: "browse", subjectType: 2, title: "All Series" })
                  }
                  className="text-foreground/80 hover:text-primary transition-colors"
                >
                  Series
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    go({ kind: "browse", subjectType: 0, title: "Trending Now" })
                  }
                  className="text-foreground/80 hover:text-primary transition-colors"
                >
                  Trending
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Genres
            </h4>
            <ul className="space-y-2 text-sm">
              {GENRES.slice(0, 6).map((g) => (
                <li key={g}>
                  <button
                    onClick={() =>
                      go({
                        kind: "browse",
                        subjectType: 0,
                        genre: g,
                        title: `${g}`,
                      })
                    }
                    className="text-foreground/80 hover:text-primary transition-colors"
                  >
                    {g}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              About
            </h4>
            <ul className="space-y-2 text-sm text-foreground/80">
              <li>CineStream is a free streaming aggregator.</li>
              <li>All content is provided by upstream public APIs.</li>
              <li>
                Built for demonstration — no ads, no tracking, no downloads.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} CineStream. For demonstration only.
          </p>
          <p className="text-xs text-muted-foreground">
            Made for cinephiles who hate popups.
          </p>
        </div>
      </div>
    </footer>
  );
}
