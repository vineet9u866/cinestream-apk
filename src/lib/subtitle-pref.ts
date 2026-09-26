"use client";

/**
 * Lightweight subtitle preference store.
 *
 * This is a simple module-level store (NOT a Zustand store) because the
 * subtitle preference needs to survive across VideoPlayer unmount/remount
 * cycles — which happen every time the user switches audio language (dub),
 * since switchDub navigates to a different subjectId and the entire
 * DetailPage + VideoPlayer tree remounts.
 *
 * We store:
 *   - preferredLan: the language code the user last selected (e.g. "zh", "en")
 *   - autoTranslated: whether that language was auto-translated (vs. native upstream)
 *
 * When a new VideoPlayer mounts and fetches captions, it checks this store
 * and auto-restores the user's previous subtitle selection if the same
 * language is available in the new caption list.
 */

interface SubtitlePref {
  preferredLan: string | null;     // e.g. "zh", "en", or null for "off"
  autoTranslated: boolean;          // true if the last selection was auto-translated
}

let pref: SubtitlePref = {
  preferredLan: null,
  autoTranslated: false,
};

const listeners = new Set<(p: SubtitlePref) => void>();

export function getSubtitlePref(): SubtitlePref {
  return pref;
}

export function setSubtitlePref(p: Partial<SubtitlePref>) {
  pref = { ...pref, ...p };
  listeners.forEach((fn) => fn(pref));
}

export function clearSubtitlePref() {
  pref = { preferredLan: null, autoTranslated: false };
  listeners.forEach((fn) => fn(pref));
}

export function onSubtitlePrefChange(fn: (p: SubtitlePref) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
