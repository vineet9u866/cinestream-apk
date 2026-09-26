"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/stores/app-store";
import { GENRES } from "@/lib/moviebox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Home,
  Film,
  Tv,
  Flame,
  Search,
  X,
  ChevronRight,
  Compass,
  Star,
} from "lucide-react";

/**
 * Persistent desktop sidebar (lg+ only).
 *
 * On mobile the navigation lives in a hamburger drawer triggered from the
 * <Navbar />. This component only renders the desktop column.
 */
export function Sidebar() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const canGoBack = useApp((s) => s.canGoBack);
  const view = useApp((s) => s.view);

  const [keyword, setKeyword] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const searchKeyword = view.kind === "search" ? view.keyword : "";
  useEffect(() => {
    if (
      searchKeyword &&
      searchKeyword !== keyword &&
      document.activeElement?.tagName !== "INPUT"
    ) {
      setKeyword(searchKeyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKeyword]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    go({ kind: "search", keyword: q });
    setSearchOpen(false);
  };

  const isActive = (kind: string, extra?: () => boolean) =>
    view.kind === kind && (!extra || extra());

  const navItems = [
    {
      icon: Home,
      label: "Home",
      active: isActive("home"),
      onClick: () => go({ kind: "home" }),
    },
    {
      icon: Flame,
      label: "Trending",
      active: false,
      onClick: () => go({ kind: "browse", subjectType: 0, title: "Trending Now" }),
    },
  ];

  return (
    <aside
      className="sticky top-0 z-40 hidden lg:flex h-screen w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar/80 backdrop-blur-md"
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <button
        onClick={() => go({ kind: "home" })}
        className="flex items-center justify-start gap-2.5 h-16 px-4 border-b border-border shrink-0 group"
        aria-label="CineStream home"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-orange-600 shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
          <Film className="h-5 w-5 text-primary-foreground" />
        </span>
        <span className="text-xl font-extrabold tracking-tight leading-none">
          <span className="text-foreground">Cine</span>
          <span className="text-primary">Stream</span>
        </span>
      </button>

      {/* Back button */}
      {canGoBack && (
        <button
          onClick={back}
          title="Back"
          className="flex items-center justify-start gap-2 mx-3 mt-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight className="h-4 w-4 rotate-180 shrink-0" />
          <span>Back</span>
        </button>
      )}

      {/* Primary nav */}
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              title={item.label}
              className={`flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                item.active
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/70 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Movies popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Movies"
              className={`flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                view.kind === "browse" && view.subjectType === 1
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/70 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Film className="h-5 w-5 shrink-0" />
              <span>Movies</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-60 bg-popover border-border p-2 max-h-80 overflow-y-auto"
          >
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-xs w-full"
              onClick={() =>
                go({ kind: "browse", subjectType: 1, title: "All Movies" })
              }
            >
              All Movies
            </Button>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {GENRES.slice(0, 14).map((g) => (
                <Button
                  key={g}
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() =>
                    go({
                      kind: "browse",
                      subjectType: 1,
                      genre: g,
                      title: `${g} Movies`,
                    })
                  }
                >
                  {g}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Series popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Series"
              className={`flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                view.kind === "browse" && view.subjectType === 2
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/70 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Tv className="h-5 w-5 shrink-0" />
              <span>Series</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            className="w-60 bg-popover border-border p-2 max-h-80 overflow-y-auto"
          >
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-xs w-full"
              onClick={() =>
                go({ kind: "browse", subjectType: 2, title: "All Series" })
              }
            >
              All Series
            </Button>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {GENRES.slice(0, 14).map((g) => (
                <Button
                  key={g}
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() =>
                    go({
                      kind: "browse",
                      subjectType: 2,
                      genre: g,
                      title: `${g} Series`,
                    })
                  }
                >
                  {g}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </nav>

      <div className="mx-4 my-1 border-t border-border" />

      {/* Secondary nav */}
      <nav className="flex flex-col gap-1 px-3">
        <button
          onClick={() =>
            go({ kind: "browse", subjectType: 0, title: "Trending Now" })
          }
          title="Discover"
          className="flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 hover:bg-secondary hover:text-foreground transition-all"
        >
          <Compass className="h-5 w-5 shrink-0" />
          <span>Discover</span>
        </button>
        <button
          onClick={() =>
            go({ kind: "browse", subjectType: 0, genre: "Drama", title: "Drama" })
          }
          title="Top Rated"
          className="flex items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 hover:bg-secondary hover:text-foreground transition-all"
        >
          <Star className="h-5 w-5 shrink-0" />
          <span>Top Drama</span>
        </button>
      </nav>

      {/* Search — pinned to bottom */}
      <div className="mt-auto p-3 border-t border-border">
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <button
              title="Search"
              className={`flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                view.kind === "search"
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/70 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Search className="h-5 w-5 shrink-0" />
              <span>Search</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            sideOffset={8}
            align="end"
            className="w-72 bg-popover border-border p-3"
          >
            <form onSubmit={submitSearch} className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  autoFocus
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Search movies, series..."
                  className="pl-9 pr-9 bg-card/60 border-border"
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => setKeyword("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                    aria-label="Clear"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <Button type="submit" size="sm" className="w-full">
                Search
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}
