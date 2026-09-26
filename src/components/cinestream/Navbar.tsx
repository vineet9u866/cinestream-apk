"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Search,
  ArrowLeft,
  Film,
  X,
  Menu,
  Home,
  Flame,
  Tv,
  Compass,
  Star,
  ChevronRight,
} from "lucide-react";
import { GENRES } from "@/lib/moviebox";

/**
 * Slim top utility bar.
 *
 * - On desktop (lg+): a transparent sticky bar with back button + search.
 * - On mobile (<lg): the bar hosts a hamburger button on the top-left that
 *   opens a slide-in drawer with the full navigation. The desktop sidebar
 *   is hidden on mobile.
 */
export function Navbar() {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const canGoBack = useApp((s) => s.canGoBack);
  const view = useApp((s) => s.view);

  const [keyword, setKeyword] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    go({ kind: "search", keyword: q });
    setSearchOpen(false);
  };

  const nav = (v: Parameters<typeof go>[0]) => {
    go(v);
    setMobileOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-30 transition-all duration-300 ${
        scrolled
          ? "bg-background/90 backdrop-blur-md border-b border-border"
          : "bg-gradient-to-b from-background/90 to-transparent"
      }`}
    >
      <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
        {/* Mobile hamburger (top-left) — opens the navigation drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 border-r border-border bg-sidebar p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <MobileNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Back button */}
        {canGoBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={back}
            className="shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Mobile wordmark */}
        <button
          onClick={() => go({ kind: "home" })}
          className="flex items-center gap-2 shrink-0 lg:hidden"
          aria-label="CineStream home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-orange-600">
            <Film className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          <span className="text-base font-extrabold tracking-tight">
            <span className="text-foreground">Cine</span>
            <span className="text-primary">Stream</span>
          </span>
        </button>

        <div className="flex-1" />

        {/* Search trigger */}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={view.kind === "search" ? "secondary" : "outline"}
              size="sm"
              className="h-9 gap-2"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">
                {view.kind === "search" ? keyword || "Search" : "Search"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 bg-popover border-border p-3"
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
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile drawer content                                               */
/* ------------------------------------------------------------------ */

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const canGoBack = useApp((s) => s.canGoBack);
  const view = useApp((s) => s.view);
  const [keyword, setKeyword] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    if (!q) return;
    go({ kind: "search", keyword: q });
    onNavigate();
  };

  const items = [
    {
      icon: Home,
      label: "Home",
      active: view.kind === "home",
      onClick: () => go({ kind: "home" }),
    },
    {
      icon: Flame,
      label: "Trending",
      active: false,
      onClick: () => go({ kind: "browse", subjectType: 0, title: "Trending Now" }),
    },
    {
      icon: Film,
      label: "Movies",
      active: view.kind === "browse" && view.subjectType === 1,
      onClick: () => go({ kind: "browse", subjectType: 1, title: "All Movies" }),
    },
    {
      icon: Tv,
      label: "Series",
      active: view.kind === "browse" && view.subjectType === 2,
      onClick: () => go({ kind: "browse", subjectType: 2, title: "All Series" }),
    },
    {
      icon: Compass,
      label: "Discover",
      active: false,
      onClick: () => go({ kind: "browse", subjectType: 0, title: "Trending Now" }),
    },
    {
      icon: Star,
      label: "Top Drama",
      active: false,
      onClick: () => go({ kind: "browse", subjectType: 0, genre: "Drama", title: "Drama" }),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border shrink-0">
        <button
          onClick={() => {
            go({ kind: "home" });
            onNavigate();
          }}
          className="flex items-center gap-2"
          aria-label="CineStream home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-orange-600">
            <Film className="h-4 w-4 text-primary-foreground" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            <span className="text-foreground">Cine</span>
            <span className="text-primary">Stream</span>
          </span>
        </button>
      </div>

      {canGoBack && (
        <button
          onClick={() => {
            back();
            onNavigate();
          }}
          className="flex items-center gap-2 mx-3 mt-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          <span>Back</span>
        </button>
      )}

      {/* Search box */}
      <div className="p-3">
        <form onSubmit={submitSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search movies, series..."
            className="pl-9 pr-3 bg-card/60 border-border"
          />
        </form>
      </div>

      {/* Nav list */}
      <nav className="flex flex-col gap-1 px-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                onNavigate();
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                item.active
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/80 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-4 my-2 border-t border-border" />

      {/* Genre chips */}
      <div className="px-3 pb-4 overflow-y-auto">
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Genres
        </p>
        <div className="grid grid-cols-2 gap-1">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => {
                go({
                  kind: "browse",
                  subjectType: 0,
                  genre: g,
                  title: g,
                });
                onNavigate();
              }}
              className="rounded-md px-2 py-2 text-left text-xs text-foreground/80 hover:bg-secondary hover:text-foreground transition-colors"
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
