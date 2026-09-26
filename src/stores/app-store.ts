"use client";

import { create } from "zustand";

/**
 * Single-page navigation state. Since the sandbox only exposes the `/` route,
 * we drive the UI with this store + URL hash so the back button still works.
 */

export type View =
  | { kind: "home" }
  | { kind: "browse"; subjectType?: number; genre?: string; title?: string }
  | { kind: "search"; keyword: string }
  | { kind: "detail"; subjectId: string; subjectType: number };

interface AppState {
  view: View;
  go: (v: View) => void;
  back: () => void;
  canGoBack: boolean;
  history: View[];
}

function parseHash(): View {
  if (typeof window === "undefined") return { kind: "home" };
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return { kind: "home" };
  const [path, query] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const qs = new URLSearchParams(query ?? "");
  if (parts[0] === "browse") {
    return {
      kind: "browse",
      subjectType: qs.get("st") ? Number(qs.get("st")) : undefined,
      genre: qs.get("genre") ?? undefined,
      title: qs.get("title") ?? undefined,
    };
  }
  if (parts[0] === "search") {
    return { kind: "search", keyword: decodeURIComponent(qs.get("q") ?? "") };
  }
  if (parts[0] === "detail" && parts[1]) {
    return {
      kind: "detail",
      subjectId: parts[1],
      subjectType: Number(qs.get("st") ?? "1"),
    };
  }
  return { kind: "home" };
}

function viewToHash(v: View): string {
  switch (v.kind) {
    case "home":
      return "#/";
    case "browse": {
      const qs = new URLSearchParams();
      if (v.subjectType) qs.set("st", String(v.subjectType));
      if (v.genre) qs.set("genre", v.genre);
      if (v.title) qs.set("title", v.title);
      const q = qs.toString();
      return `#/browse${q ? "?" + q : ""}`;
    }
    case "search":
      return `#/search?q=${encodeURIComponent(v.keyword)}`;
    case "detail":
      return `#/detail/${v.subjectId}?st=${v.subjectType}`;
  }
}

export const useApp = create<AppState>((set, get) => ({
  view: typeof window !== "undefined" ? parseHash() : { kind: "home" },
  history: [],
  canGoBack: false,
  go: (v) => {
    const state = get();
    const newHistory = [...state.history, state.view].slice(-30);
    set({ view: v, history: newHistory, canGoBack: true });
    if (typeof window !== "undefined") {
      window.location.hash = viewToHash(v);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  },
  back: () => {
    const state = get();
    if (state.history.length === 0) {
      set({ view: { kind: "home" }, canGoBack: false });
      if (typeof window !== "undefined") window.location.hash = "#/";
      return;
    }
    const prev = state.history[state.history.length - 1];
    set({
      view: prev,
      history: state.history.slice(0, -1),
      canGoBack: state.history.length > 1,
    });
    if (typeof window !== "undefined") {
      window.location.hash = viewToHash(prev);
      window.scrollTo({ top: 0 });
    }
  },
}));

// Sync store with hash changes (browser back/forward buttons)
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const v = parseHash();
    const current = useApp.getState().view;
    // Only update if the actual view differs to avoid loops
    if (JSON.stringify(current) !== JSON.stringify(v)) {
      useApp.setState((s) => ({
        view: v,
        history: s.history,
        canGoBack: s.history.length > 0,
      }));
    }
  });
}
