"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MBStream, MBDub, MBCaption } from "@/lib/moviebox";
import { safeJson } from "@/lib/utils";
import {
  getSubtitlePref,
  setSubtitlePref,
  clearSubtitlePref,
} from "@/lib/subtitle-pref";
import { useApp } from "@/stores/app-store";
import { useParty } from "@/stores/party-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, AlertCircle, Lock, Play, Languages, Captions, Check, Volume2, VolumeX, Volume1, X } from "lucide-react";

interface CaptionResponse {
  code: number;
  data?: { captions: MBCaption[] };
  message?: string;
}

/**
 * Web Audio API volume-boost hook.
 *
 * HTML5 <video>.volume is clamped to [0, 1] (i.e. 0–100%). To exceed 100%
 * we route the audio through a GainNode whose gain.value can go up to 2.0
 * (200%). Below 100% we still use the native video.volume for simplicity,
 * so the boost only kicks in when the user requests > 100%.
 *
 * `resetKey` should be a value that changes whenever the underlying <video>
 * element is replaced (e.g. the `src` URL). When it changes, we tear down
 * the existing audio graph and rewire the new element on the next
 * applyVolume() call — otherwise the GainNode would be left pointing at a
 * detached media element and the boost would silently stop working.
 */
function useVolumeBoost(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  resetKey?: string
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  // Track whether we've already wired up the audio graph for the CURRENT
  // video element. Once a MediaElementAudioSourceNode is created from a
  // <video>, the audio is permanently routed through Web Audio — we must
  // NOT recreate the source node for the same element or the audio will
  // go silent.
  const wiredRef = useRef(false);
  // Remember the last requested volume so that after a reset (new video
  // element) we can re-apply the boost on the new element.
  const pendingVolumeRef = useRef<number>(1.0);

  const ensureWired = useCallback(() => {
    if (wiredRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      // Lazily create the AudioContext on first user interaction.
      const AC = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      // Reuse the existing AudioContext across resets — closing/reopening
      // is expensive and can hit browser limits.
      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = new AC();
        ctxRef.current = ctx;
      }
      const source = ctx.createMediaElementSource(v);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      sourceRef.current = source;
      gainRef.current = gain;
      wiredRef.current = true;
      // Re-apply the pending volume to the new graph.
      try { gain.gain.setValueAtTime(pendingVolumeRef.current, ctx.currentTime); } catch {}
    } catch {
      // If context creation fails (e.g. CORS taint on the media element),
      // we silently fall back to native volume. The user will still be
      // able to use 0–100% via video.volume.
    }
  }, [videoRef]);

  /**
   * Apply a volume in the range [0, 2] (i.e. 0% – 200%).
   *
   * - 0.0 – 1.0: set video.volume directly, gain stays at 1.0
   * - 1.0 – 2.0: video.volume = 1.0 (max native), gain = volume
   */
  const applyVolume = useCallback((vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(2, vol));
    pendingVolumeRef.current = clamped;
    if (clamped <= 1) {
      // Native volume handles 0–100%
      try { v.volume = clamped; } catch {}
      if (gainRef.current && ctxRef.current) {
        try { gainRef.current.gain.setValueAtTime(1.0, ctxRef.current.currentTime); } catch {}
      }
    } else {
      // Boost: max out native volume, then amplify via gain
      try { v.volume = 1.0; } catch {}
      ensureWired();
      if (gainRef.current && ctxRef.current) {
        try { gainRef.current.gain.setValueAtTime(clamped, ctxRef.current.currentTime); } catch {}
      }
    }
  }, [videoRef, ensureWired]);

  /** Resume the AudioContext (must be called from a user gesture). */
  const resume = useCallback(() => {
    if (ctxRef.current && ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
  }, []);

  // Whenever the reset key changes (new <video> element), disconnect the
  // old source node so it can be garbage-collected. The AudioContext
  // itself is reused; only the per-element source/gain pair is rebuilt.
  useEffect(() => {
    wiredRef.current = false;
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    // The next applyVolume() call (triggered by the currentUrl effect)
    // will re-wire the new element if a boost is needed.
  }, [resetKey]);

  // Tear down on unmount
  useEffect(() => {
    return () => {
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
      sourceRef.current = null;
      gainRef.current = null;
      wiredRef.current = false;
    };
  }, []);

  return { applyVolume, resume, ensureWired };
}

interface VideoPlayerProps {
  subjectId: string;
  detailPath: string;
  subjectType: number;
  seasons?: { se: number; maxEp: number; allEp: string }[];
  trailerUrl?: string;
  posterUrl?: string;
  title?: string;
  dubs?: MBDub[];
  subtitles?: string;
}

interface PlayResponse {
  code: number;
  data?: {
    streams: MBStream[];
    hls: MBStream[];
    hasResource: boolean;
    limited: boolean;
    vipLocked?: boolean;
  };
  message?: string;
}

/**
 * Map a MovieBox lanCode to a short label suitable for a compact pill.
 * For Chinese we show "中文" (the native name) since it's the most
 * recognizable form for Chinese-speaking users. Other languages get
 * an uppercase ISO code.
 */
function shortLangLabel(code: string): string {
  const c = code.toLowerCase();
  const map: Record<string, string> = {
    en: "EN",
    ar: "AR",
    fr: "FR",
    hi: "HI",
    ru: "RU",
    es: "ES",
    tl: "TL",
    ku: "KU",
    zh: "中文",
    ja: "JA",
    ko: "KO",
    de: "DE",
    it: "IT",
    pt: "PT",
    tr: "TR",
    id: "ID",
    ms: "MS",
    th: "TH",
    vi: "VI",
    bn: "BN",
    ur: "UR",
    fa: "FA",
    pl: "PL",
    nl: "NL",
    sv: "SV",
    ta: "TA",
    te: "TE",
    fil: "FIL",
    et: "ET",
  };
  if (map[c]) return map[c];
  if (c.startsWith("pt")) return "PT-BR";
  if (c.startsWith("es")) return "ES-LA";
  return code.toUpperCase().slice(0, 4);
}

/**
 * Returns a human-readable language name for a lanCode, used in
 * dropdowns where we have more space than a pill badge.
 */
function fullLangName(code: string, fallback?: string): string {
  const c = code.toLowerCase();
  const map: Record<string, string> = {
    en: "English",
    ar: "اَلْعَرَبِيَّةُ",
    fr: "Français",
    hi: "हिन्दी",
    ru: "Русский",
    es: "Español",
    tl: "Filipino",
    ku: "Kurdî",
    zh: "中文",
    ja: "日本語",
    ko: "한국어",
    de: "Deutsch",
    it: "Italiano",
    pt: "Português",
    tr: "Türkçe",
    id: "Indonesia",
    ms: "Melayu",
    th: "ภาษาไทย",
    vi: "Tiếng Việt",
    bn: "বাংলা",
    ur: "اُردُو",
    fa: "فارسی",
    pl: "Polski",
    nl: "Nederlands",
    sv: "Svenska",
    ta: "தமிழ்",
    te: "తెలుగు",
    fil: "Filipino",
    et: "Eesti",
  };
  if (map[c]) return map[c];
  return fallback || code.toUpperCase();
}

export function VideoPlayer({
  subjectId,
  detailPath,
  subjectType,
  seasons = [],
  trailerUrl,
  posterUrl,
  title = "",
  dubs = [],
  subtitles = "",
}: VideoPlayerProps) {
  const go = useApp((s) => s.go);
  // Watch-party role: "host" broadcasts state, "viewer" syncs to host.
  // This is used to gate the viewer-sync effect so the host doesn't
  // create a feedback loop by syncing to its own broadcasted state.
  const partyRole = useParty((s) => s.role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Playable streams (non-VIP, has URL). Used for the actual playback.
  const [streams, setStreams] = useState<MBStream[]>([]);
  // ALL streams from the upstream play response, including VIP-locked ones.
  // We display these in the quality selector (greyed out with a lock icon)
  // so the user can see that e.g. 1080P exists even if it's VIP-only.
  const [allStreams, setAllStreams] = useState<MBStream[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [currentRes, setCurrentRes] = useState<string>("");
  // The original CDN URL (before proxy wrapping). Used as a fallback
  // if the streaming proxy fails — e.g. on serverless deployments
  // (Netlify, Vercel) where the proxy function times out. We try the
  // direct CDN URL, which may work if the CDN doesn't enforce Referer.
  const [directCdnUrl, setDirectCdnUrl] = useState<string>("");
  const [usingDirectUrl, setUsingDirectUrl] = useState(false);
  const [curSe, setCurSe] = useState(0);
  const [curEp, setCurEp] = useState(0);
  const [showTrailer, setShowTrailer] = useState(false);
  const [seasonEpisodes, setSeasonEpisodes] = useState<number[]>([]);
  // Subtitle selection. "off" = no overlay. Otherwise the value is the
  // caption id (from MBCaption.id) we want to display.
  const [activeSubtitle, setActiveSubtitle] = useState<string>("off");
  // Caption tracks for the current stream (fetched on demand from /api/caption).
  const [captions, setCaptions] = useState<MBCaption[]>([]);
  // Loading state for the caption fetch.
  const [captionsLoading, setCaptionsLoading] = useState(false);
  // The WebVTT blob URL currently attached to the <video> as a <track>.
  // We revoke + recreate this whenever the user picks a new language.
  const [trackSrc, setTrackSrc] = useState<string>("");
  // Translation state — when the user picks a language that isn't natively
  // available upstream (e.g. Chinese for a title that only has English subs),
  // we auto-translate the English SRT via the LLM. This tracks the progress.
  const [translating, setTranslating] = useState(false);
  const [translateMessage, setTranslateMessage] = useState<string>("");
  // Volume state, 0–200 (displayed as percent). 100 = native max.
  const [volume, setVolume] = useState<number>(100);
  const [muted, setMuted] = useState<boolean>(false);
  const [volOpen, setVolOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  // VIEWER-ONLY: whether the "Following host" banner is visible.
  // The viewer can dismiss it with the X button.
  const [bannerVisible, setBannerVisible] = useState(true);
  // Whether the video's audio is muted and needs a user tap to enable.
  // Mobile browsers block autoplay WITH SOUND — the video auto-plays
  // muted, and the user must tap to enable audio (a user gesture
  // satisfies the autoplay policy). This applies to BOTH host and
  // viewer. On desktop, autoplay with sound usually works, but showing
  // the overlay briefly is a minor inconvenience worth the mobile fix.
  const [audioMuted, setAudioMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const { applyVolume, resume: resumeAudio } = useVolumeBoost(videoRef, currentUrl);
  // Remember the last non-muted volume so we can restore on unmute.
  const lastVolumeRef = useRef<number>(100);
  // Track the latest play-info request to avoid races when seasons change.
  const requestIdRef = useRef(0);
  // True once the season initialization effect has set the initial se/ep.
  // We don't want to fetch with the default 0/0 values.
  const initializedRef = useRef(false);
  // Watch-party sync bookkeeping:
  // - lastSyncActionRef: tracks the last play/pause action we applied, so
  //   we don't call v.play()/v.pause() repeatedly on every tick.
  // - lastSeekTimeRef: timestamp of the last seek, so we can skip drift
  //   checks for a short grace period after seeking (prevents stutter).
  // - userPausedRef: on the HOST, tracks whether the user intentionally
  //   paused. Buffering stalls set this to false so we don't broadcast
  //   paused=true when the video is just loading.
  const lastSyncActionRef = useRef<"play" | "pause" | null>(null);
  const lastSeekTimeRef = useRef(0);
  const userPausedRef = useRef(false);

  // Audio-language dubs (type === 0). The "Original Audio" entry is included.
  const audioDubs = dubs.filter((d) => d.type === 0);
  // Currently active dub = the one whose subjectId matches the playing title.
  const currentDub =
    audioDubs.find((d) => d.subjectId === subjectId) ||
    audioDubs.find((d) => d.original) ||
    null;

  // Subtitle languages parsed from the comma-separated `subtitles` field
  // (used as a hint for what the upstream offers, in case the per-stream
  // caption endpoint returns nothing).
  const subtitleLangHint = subtitles
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // For series: compute episodes for the current season
  useEffect(() => {
    if (!seasons || seasons.length === 0) {
      setSeasonEpisodes([]);
      // For movies, we still need to trigger the first play fetch with 0/0.
      if (!initializedRef.current) {
        initializedRef.current = true;
      }
      return;
    }
    // Default to the FIRST season (S1) - that's where viewers start
    const initialSe = seasons[0].se;
    setCurSe(initialSe);
    const season = seasons.find((s) => s.se === initialSe);
    if (season?.allEp) {
      const eps = season.allEp
        .split(",")
        .map((e) => Number(e))
        .filter((n) => !Number.isNaN(n));
      setSeasonEpisodes(eps.length ? eps : Array.from({ length: season.maxEp }, (_, i) => i + 1));
      setCurEp(eps[0] ?? 1);
    } else if (season?.maxEp) {
      setSeasonEpisodes(Array.from({ length: season.maxEp }, (_, i) => i + 1));
      setCurEp(1);
    } else {
      setSeasonEpisodes([]);
      setCurEp(0);
    }
    initializedRef.current = true;
  }, [seasons]);

  const loadPlayInfo = async (se: number, ep: number) => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setStreams([]);
    setAllStreams([]);
    setCurrentUrl("");
    setCurrentRes("");
    setShowTrailer(false);
    // Reset subtitle state for the new stream — captions are per-stream-id,
    // so the previous list is stale. The user's LANGUAGE preference (stored
    // in subtitle-pref.ts) is preserved and will be auto-restored by
    // fetchCaptions() once the new caption list arrives.
    setActiveSubtitle("off");
    setCaptions([]);
    setTranslating(false);
    setTranslateMessage("");
    // Reset viewer-specific state for the new stream:
    // - Show the "Following host" banner again (they dismissed it for the
    //   previous title, but a new title is a fresh context).
    // - Re-mute the viewer's video so autoplay succeeds on mobile.
    setBannerVisible(true);
    setAudioMuted(true);
    setTrackSrc((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });
    try {
      const res = await fetch(
        `/api/play?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`
      );
      // Use safeJson so an empty/invalid response body doesn't throw
      // an unhandled "Unexpected end of JSON input" error.
      const json = await safeJson<PlayResponse>(res, "Failed to load stream");
      // Ignore stale responses (a newer request has been issued)
      if (reqId !== requestIdRef.current) return;
      if (json.code !== 0) {
        throw new Error(json.message || "Failed to load stream");
      }
      const data = json.data;
      if (!data) throw new Error("No data returned");

      // Combine HLS + MP4 streams, prefer MP4 (browser-native).
      // Keep ALL streams (including VIP-locked) so the quality selector
      // can show 720P/1080P options even when they're VIP-only.
      const combined = [...(data.streams || []), ...(data.hls || [])];
      const playable = combined.filter((s) => s.url && !s.vipLocked);
      const vipOnly = combined.filter((s) => s.vipLocked);

      // Store every stream the API returned (deduped by resolution) so the
      // quality dropdown can display VIP-locked entries with a lock icon.
      setAllStreams(combined);

      if (playable.length === 0) {
        if (vipOnly.length > 0 && trailerUrl) {
          // Fall back to trailer if all streams are VIP-locked
          setShowTrailer(true);
          setCurrentUrl(trailerUrl);
          setStreams([]);
        } else if (data.limited) {
          setError("This title is region-limited and cannot be played here.");
        } else {
          setError(
            "No free streams available for this title right now. Try another title."
          );
        }
      } else {
        setStreams(playable);
        // Pick the highest non-VIP resolution by default
        const sorted = [...playable].sort(
          (a, b) => Number(b.resolutions) - Number(a.resolutions)
        );
        const best = sorted[0];
        // The upstream CDN requires a Referer header we cannot set in the
        // browser, so route through our own /api/stream proxy.
        setCurrentUrl(proxyUrl(best.url));
        setDirectCdnUrl(best.url);
        setUsingDirectUrl(false);
        setCurrentRes(best.resolutions);
        // Kick off the caption list fetch in the background. The CC button
        // will populate as soon as the response arrives.
        fetchCaptions(best.id);
      }
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setError((e as Error).message || "Failed to load video");
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  };

  /**
   * Fetch the list of available caption tracks for the currently playing
   * stream. Stores them in `captions` so the CC popover can render them.
   */
  const fetchCaptions = async (streamId: string) => {
    if (!streamId) return;
    setCaptionsLoading(true);
    try {
      const res = await fetch(
        `/api/caption?streamId=${streamId}&subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}`
      );
      // safeJson guards against empty/invalid bodies that would otherwise
      // throw "Unexpected end of JSON input".
      const json = await safeJson<CaptionResponse>(res, "Failed to load subtitles");
      if (json.code === 0 && json.data?.captions) {
        setCaptions(json.data.captions);
        // Auto-restore the subtitle selection. For VIEWERS in a watch
        // party, we prioritize the HOST's subtitle selection (broadcast
        // via party state) so subtitles sync from host to viewer. For
        // the HOST (or when not in a party), we use the local subtitle
        // preference store.
        let prefLan: string | null = null;
        let prefAuto = false;

        if (partyRole === "viewer") {
          // Viewer: check the host's broadcasted subtitle selection.
          const pv = window.__csPartyView;
          if (pv?.state?.subtitleLan) {
            prefLan = pv.state.subtitleLan;
            prefAuto = !!pv.state.subtitleAutoTranslated;
          }
        }

        if (!prefLan) {
          // Host or no party: use the local preference.
          const pref = getSubtitlePref();
          prefLan = pref.preferredLan;
          prefAuto = pref.autoTranslated;
        }

        if (prefLan && prefLan !== "off") {
          const nativeMatch = json.data.captions.find(
            (c) => c.lan.toLowerCase() === prefLan!.toLowerCase()
          );
          if (nativeMatch) {
            // Native subtitle available — select it directly.
            selectSubtitle(nativeMatch.id, /* skipPrefSave */ true);
          } else if (prefAuto) {
            // Was auto-translated last time — re-trigger translation for
            // the new stream. This makes Chinese subs persist across dub
            // switches even when the upstream doesn't have them natively.
            selectAutoTranslate(prefLan, /* skipPrefSave */ true);
          }
        }
      } else {
        setCaptions([]);
        // Even if upstream returned no captions, check if the user had
        // an auto-translated preference — we can still translate from
        // English if we can find an English caption elsewhere. For now,
        // just clear the preference if there are no captions at all.
      }
    } catch {
      // Non-fatal: the CC button just won't show any languages.
      setCaptions([]);
    } finally {
      setCaptionsLoading(false);
    }
  };

  /**
   * Activate a subtitle track by its caption id. We fetch the upstream SRT
   * via our /api/subtitle proxy (which converts it to WebVTT on the fly),
   * then create a blob URL and attach it as the <track> source.
   *
   * Passing "off" revokes any existing track and hides subtitles.
   *
   * The `skipPrefSave` flag is used internally by fetchCaptions() when
   * auto-restoring a preference — we don't want to re-save what we just read.
   */
  const selectSubtitle = async (captionId: string, skipPrefSave = false) => {
    setSubOpen(false);
    // Cancel any in-flight translation
    setTranslating(false);
    setTranslateMessage("");
    // Revoke any previously-created blob URL to avoid leaks.
    setTrackSrc((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });

    if (captionId === "off") {
      setActiveSubtitle("off");
      if (!skipPrefSave) clearSubtitlePref();
      return;
    }

    const cap = captions.find((c) => c.id === captionId);
    if (!cap) {
      setActiveSubtitle("off");
      return;
    }
    setActiveSubtitle(cap.id);

    // Save the preference so it persists across dub switches
    if (!skipPrefSave) {
      setSubtitlePref({ preferredLan: cap.lan, autoTranslated: false });
    }

    try {
      // Fetch the SRT and convert to WebVTT in one round-trip.
      const subRes = await fetch(
        `/api/subtitle?url=${encodeURIComponent(cap.url)}`
      );
      if (!subRes.ok) {
        console.warn("Subtitle fetch failed:", subRes.status);
        return;
      }
      const vttText = await subRes.text();
      // Wrap the VTT in a blob so we can use it as a same-origin track URL
      // (avoids any CORS complications with the <track> element).
      const blob = new Blob([vttText], { type: "text/vtt" });
      const blobUrl = URL.createObjectURL(blob);
      setTrackSrc(blobUrl);
    } catch (e) {
      console.warn("Failed to load subtitle:", e);
    }
  };

  /**
   * Auto-translate a subtitle language that isn't natively available
   * upstream. This is used for Chinese (and potentially other languages)
   * when the upstream caption endpoint doesn't return a track for the
   * requested language but DOES have an English track we can translate from.
   *
   * Flow:
   *   1. Find the English caption in the `captions` list (fallback: any
   *      non-empty caption).
   *   2. Fetch its SRT via /api/subtitle (converts to VTT).
   *   3. POST the VTT to /api/translate-subtitle?target={lan}.
   *   4. Wrap the translated VTT in a blob and attach as <track>.
   *
   * The `skipPrefSave` flag is used by fetchCaptions() when auto-restoring.
   */
  const selectAutoTranslate = async (targetLan: string, skipPrefSave = false) => {
    setSubOpen(false);

    // Save the preference so it persists across dub switches
    if (!skipPrefSave) {
      setSubtitlePref({ preferredLan: targetLan, autoTranslated: true });
    }

    // Find a source caption to translate from. Prefer English, fall back
    // to whatever is available.
    const sourceCap =
      captions.find((c) => c.lan.toLowerCase() === "en") ||
      captions.find((c) => c.lan.toLowerCase().startsWith("en")) ||
      captions[0];

    if (!sourceCap) {
      setTranslateMessage("No source subtitle available to translate.");
      setActiveSubtitle("off");
      return;
    }

    // Use a synthetic id for the auto-translated track so the UI can
    // track which language is active.
    const syntheticId = `auto-${targetLan}`;
    setActiveSubtitle(syntheticId);
    setTranslating(true);
    setTranslateMessage(`Translating to ${fullLangName(targetLan)}…`);

    // Revoke any previously-created blob URL
    setTrackSrc((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return "";
    });

    try {
      // Step 1: Fetch the source SRT and convert to VTT
      const subRes = await fetch(
        `/api/subtitle?url=${encodeURIComponent(sourceCap.url)}`
      );
      if (!subRes.ok) {
        throw new Error(`Source subtitle fetch failed: ${subRes.status}`);
      }
      const sourceVtt = await subRes.text();

      // Step 2: Translate via the LLM. Use a generous 5-minute timeout
      // since translating a full movie can take 1-3 minutes.
      setTranslateMessage(
        `Translating ${sourceCap.lanName} → ${fullLangName(targetLan)}…`
      );

      const translateRes = await fetch(
        `/api/translate-subtitle?target=${encodeURIComponent(targetLan)}&source=en`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vtt: sourceVtt }),
          signal: AbortSignal.timeout(300000), // 5 min
        }
      );

      if (!translateRes.ok) {
        // Provide a user-friendly error message based on the status code
        let errMsg = `Translation failed (HTTP ${translateRes.status})`;
        if (translateRes.status === 502 || translateRes.status === 504) {
          errMsg = "Translation server timed out. The movie may be too long — try again, or use a native subtitle language instead.";
        } else if (translateRes.status === 429) {
          errMsg = "Translation rate limit reached. Please wait a minute and try again.";
        } else if (translateRes.status >= 500) {
          errMsg = "Translation server error. Please try again in a moment.";
        }
        throw new Error(errMsg);
      }

      const translated = await safeJson<{ code: number; vtt?: string; message?: string }>(
        translateRes,
        "Translation failed"
      );

      if (translated.code !== 0 || !translated.vtt) {
        throw new Error(translated.message || "Translation returned no result");
      }

      // Step 3: Wrap the translated VTT in a blob and attach as <track>
      const blob = new Blob([translated.vtt], { type: "text/vtt" });
      const blobUrl = URL.createObjectURL(blob);
      setTrackSrc(blobUrl);
      setTranslating(false);
      setTranslateMessage("");
    } catch (e) {
      console.warn("Auto-translation failed:", e);
      setTranslating(false);
      setTranslateMessage(
        `Translation failed: ${(e as Error).message}. Showing source subtitle instead.`
      );
      // Fall back to the source subtitle (untranslated)
      setActiveSubtitle(sourceCap.id);
      try {
        const subRes = await fetch(
          `/api/subtitle?url=${encodeURIComponent(sourceCap.url)}`
        );
        if (subRes.ok) {
          const vttText = await subRes.text();
          const blob = new Blob([vttText], { type: "text/vtt" });
          setTrackSrc(URL.createObjectURL(blob));
        }
      } catch {
        // give up silently
      }
    }
  };

  /** Wrap a CDN url with our streaming proxy. */
  function proxyUrl(u: string): string {
    return `/api/stream?url=${encodeURIComponent(u)}`;
  }

  // Load play info on mount + whenever curSe/curEp changes.
  // Skip the initial 0/0 state for series (the seasons effect will set proper values).
  useEffect(() => {
    if (!initializedRef.current && seasons && seasons.length > 0) {
      // Wait for the seasons effect to populate curSe/curEp
      return;
    }
    loadPlayInfo(curSe, curEp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, curSe, curEp, seasons]);

  /* ---------------- Watch-party sync ---------------- */
  //
  // HOST: install a snapshot hook so PartySyncBridge can read the live
  // playback position and broadcast it to viewers. The snapshot uses
  // `userPausedRef` instead of `v.paused` so that buffering stalls
  // (where v.paused is temporarily true) don't get broadcast as
  // "host paused" — which would cause viewers to pause too.
  //
  // VIEWER: poll the host's state from window.__csPartyView and auto-seek
  // / play / pause to match. Only VIEWERS run this effect — the host must
  // NOT sync to __csPartyView, otherwise it creates a feedback loop where
  // the host's own broadcasted state (received via poll) controls the
  // host's video, causing the ping-pong play/pause bug.
  //
  // Key design decisions to avoid the ping-pong bug:
  //   - 2-second tick interval (not 1s) to reduce thrashing
  //   - 4-second drift tolerance (not 1.5s) to account for mobile buffering
  //   - 3-second grace period after seeking before checking drift again
  //   - Track last play/pause action to avoid redundant calls
  //   - Mute the viewer's video so mobile browsers allow autoplay
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__csVideoSync = {
      subjectId,
      se: curSe,
      ep: curEp,
      currentTime: 0,
      paused: true,
      title,
      poster: posterUrl,
      detailPath,
      subjectType,
      getSnapshot: () => {
        const v = videoRef.current;
        if (!v) return null;
        // Use userPausedRef instead of v.paused. When the video is
        // buffering, v.paused is true but the user didn't pause —
        // we want to keep broadcasting "playing" so viewers don't
        // pause in sympathy.
        return {
          currentTime: v.currentTime,
          paused: userPausedRef.current,
        };
      },
    };
    return () => {
      // Only delete if we still own it
      if (window.__csVideoSync && window.__csVideoSync.subjectId === subjectId) {
        delete window.__csVideoSync;
      }
    };
  }, [subjectId, curSe, curEp, title, posterUrl, detailPath, subjectType]);

  // Track user-initiated play/pause on the host so getSnapshot reports
  // the user's intent rather than the video element's transient state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      userPausedRef.current = false;
    };
    const onPause = () => {
      // Only mark as user-paused if the video isn't just buffering.
      // We detect buffering by checking v.readyState: if it's < 3
      // (HAVE_FUTURE_DATA), the pause is likely a stall, not user intent.
      if (v.readyState >= 3 || v.ended) {
        userPausedRef.current = true;
      }
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [currentUrl]);

  // VIEWER-ONLY sync effect. The host never runs this — the host is the
  // source of truth and syncing to its own echoed-back state is what
  // caused the ping-pong bug.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only viewers sync to the host's state.
    if (partyRole !== "viewer") return;

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const pv = window.__csPartyView;
      const v = videoRef.current;
      if (!pv?.state || !v) return;
      // Only sync when the party is on the same subject we're showing.
      if (pv.state.subjectId !== subjectId) return;
      // Don't sync until the video has loaded enough metadata to seek.
      if (v.readyState < 1) return;

      const now = Date.now();
      const sinceSeek = now - lastSeekTimeRef.current;

      // Seek if drift > 4 seconds (wide tolerance for mobile buffering).
      // Skip the drift check for 3 seconds after a seek to let the
      // video settle — otherwise we'd re-seek on the very next tick.
      if (sinceSeek > 3000) {
        const drift = Math.abs(v.currentTime - pv.state.currentTime);
        if (drift > 4) {
          try {
            v.currentTime = pv.state.currentTime;
            lastSeekTimeRef.current = now;
            // Reset the last action so we re-evaluate play/pause after seeking
            lastSyncActionRef.current = null;
          } catch {
            // ignore — may be called before metadata loaded
          }
        }
      }

      // Play/pause to match host. We check the ACTUAL video state (v.paused)
      // rather than tracking "last action", because mobile browsers can
      // pause the video at any time (e.g. after unmuting, the autoplay
      // policy re-evaluates and pauses). If we only tracked "last action",
      // we'd miss these browser-initiated pauses and the video would stay
      // paused forever.
      const wantPaused = pv.state.paused;
      if (wantPaused && !v.paused) {
        // Host is paused — pause the viewer too
        try { v.pause(); } catch {}
      } else if (!wantPaused && v.paused) {
        // Host is playing but viewer is paused — try to play.
        // This handles the case where the browser paused the video
        // after the viewer unmuted (mobile autoplay policy). The
        // audioMuted state controls whether we start muted (for
        // autoplay to succeed) or unmuted (after the user gesture).
        v.muted = audioMuted;
        v.play().then(() => {
          // Play succeeded — video is now playing.
        }).catch(() => {
          // Autoplay was blocked. This can happen if the browser
          // doesn't recognize a user gesture. The "Tap to unmute"
          // overlay will still be visible (audioMuted=true), and
          // tapping it provides the gesture needed to play.
        });
      }
      // Apply the viewer's mute state on every tick — this catches the
      // case where the viewer just tapped "Unmute" and we need to
      // actually unmute the video element.
      v.muted = audioMuted;
    };
    // 2-second interval — less aggressive than 1s, reduces thrashing.
    const t = setInterval(tick, 2000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [subjectId, partyRole, audioMuted]);

  // VIEWER-ONLY: watch the party state for subtitle changes and auto-apply
  // the host's subtitle selection. When the host selects a subtitle (or
  // turns it off), the viewer's video updates to match within 2 seconds.
  // This is separate from the playback sync effect so subtitle changes
  // don't interfere with play/pause/seek logic.
  const partyState = useParty((s) => s.state);
  useEffect(() => {
    if (partyRole !== "viewer") return;
    if (!partyState) return;
    // Only react to subtitle changes for the current subject — don't
    // re-apply when the host navigates to a different title (that's
    // handled by the navigation effect in PartySyncBridge).
    if (partyState.subjectId !== subjectId) return;

    const hostSubLan = partyState.subtitleLan;
    const hostAuto = !!partyState.subtitleAutoTranslated;

    // Determine what the viewer's current subtitle is so we can detect
    // when it differs from the host's selection.
    let viewerCurrentLan: string | null = null;
    let viewerCurrentAuto = false;
    if (activeSubtitle === "off") {
      viewerCurrentLan = null;
    } else if (activeSubtitle.startsWith("auto-")) {
      viewerCurrentLan = activeSubtitle.slice(5);
      viewerCurrentAuto = true;
    } else {
      const cap = captions.find((c) => c.id === activeSubtitle);
      viewerCurrentLan = cap?.lan ?? null;
      viewerCurrentAuto = false;
    }

    // Normalize for comparison
    const hostLan = hostSubLan?.toLowerCase() ?? null;
    const viewerLan = viewerCurrentLan?.toLowerCase() ?? null;

    // If the host and viewer are already on the same subtitle, do nothing.
    // This prevents infinite loops where applying a subtitle triggers
    // another check.
    if (hostLan === viewerLan && hostAuto === viewerCurrentAuto) return;

    // Host turned subtitles off → viewer turns them off too.
    if (!hostLan || hostLan === "off") {
      if (activeSubtitle !== "off") {
        selectSubtitle("off", true);
      }
      return;
    }

    // Host has a subtitle selected → try to match it.
    // Only do this if captions are loaded (otherwise fetchCaptions will
    // handle it when they arrive).
    if (captions.length === 0) return;

    const nativeMatch = captions.find((c) => c.lan.toLowerCase() === hostLan);
    if (nativeMatch) {
      selectSubtitle(nativeMatch.id, true);
    } else if (hostAuto) {
      selectAutoTranslate(hostSubLan!, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyRole, partyState?.subtitleLan, partyState?.subtitleAutoTranslated, partyState?.subjectId, subjectId, captions.length]);

  const changeResolution = (res: string) => {
    const s = streams.find((x) => x.resolutions === res);
    if (s) {
      // Preserve playback position when switching
      const t = videoRef.current?.currentTime ?? 0;
      setCurrentUrl(proxyUrl(s.url));
      setDirectCdnUrl(s.url);
      setUsingDirectUrl(false);
      setCurrentRes(s.resolutions);
      // The new stream has its own caption set — refetch.
      // The user's language preference is preserved in subtitle-pref.ts
      // and will be auto-restored by fetchCaptions().
      setActiveSubtitle("off");
      setCaptions([]);
      setTranslating(false);
      setTranslateMessage("");
      setTrackSrc((prev) => {
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return "";
      });
      fetchCaptions(s.id);
      // Restore position after video element reloads
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = t;
          videoRef.current.play().catch(() => {});
        }
      }, 200);
    }
  };

  const changeSeason = (se: number) => {
    setCurSe(se);
    const season = seasons.find((s) => s.se === se);
    if (season?.allEp) {
      const eps = season.allEp
        .split(",")
        .map((e) => Number(e))
        .filter((n) => !Number.isNaN(n));
      setSeasonEpisodes(eps.length ? eps : Array.from({ length: season.maxEp }, (_, i) => i + 1));
      setCurEp(eps[0] ?? 1);
    } else if (season?.maxEp) {
      setSeasonEpisodes(Array.from({ length: season.maxEp }, (_, i) => i + 1));
      setCurEp(1);
    } else {
      setSeasonEpisodes([]);
      setCurEp(0);
    }
  };

  const changeEpisode = (ep: number) => {
    setCurEp(ep);
  };

  /** Switch to a different audio-language version (a different subject). */
  const switchDub = (dub: MBDub) => {
    setLangOpen(false);
    if (dub.subjectId === subjectId) return;
    go({
      kind: "detail",
      subjectId: dub.subjectId,
      subjectType,
    });
  };

  /* ---------------- Volume control (0–200%) ---------------- */

  // Apply volume whenever the volume state or muted flag changes.
  useEffect(() => {
    if (muted) {
      applyVolume(0);
    } else {
      applyVolume(volume / 100);
    }
  }, [volume, muted, applyVolume]);

  // When the video element reloads (key=currentUrl), reapply the volume
  // and mute state. The new <video> starts muted (via the `muted` attribute)
  // so autoplay works on mobile. We keep it muted until the user taps
  // "Tap to unmute", which sets audioMuted=false.
  useEffect(() => {
    if (!currentUrl) return;
    // Slight delay to let the new <video> element mount + be ready.
    const t = setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      // Apply the mute state — video starts muted for autoplay
      v.muted = audioMuted;
      // Apply the volume level
      if (muted) applyVolume(0);
      else applyVolume(volume / 100);
    }, 100);
    return () => clearTimeout(t);
  }, [currentUrl, volume, muted, audioMuted, applyVolume]);

  // Keep the video's muted property in sync with the audioMuted state.
  // This runs for BOTH host and viewer. When the user taps "Tap to unmute",
  // audioMuted changes to false, and this effect unmutes the video element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = audioMuted;
  }, [audioMuted, currentUrl]);

  // Force the active <track> into "showing" mode once it loads. Some
  // browsers default to "disabled" if the user's caption preference doesn't
  // match the track's srcLang — we want our CC button to be authoritative.
  useEffect(() => {
    if (!trackSrc) return;
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      const tracks = v.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = "showing";
      }
    };
    // Also poll for a short window — track loading timing is racy.
    const poll = setInterval(() => {
      if (v.textTracks && v.textTracks.length > 0) {
        for (let i = 0; i < v.textTracks.length; i++) {
          v.textTracks[i].mode = "showing";
        }
      }
    }, 200);
    v.addEventListener("loadstart", onLoaded);
    const stopPoll = setTimeout(() => clearInterval(poll), 3000);
    return () => {
      v.removeEventListener("loadstart", onLoaded);
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [trackSrc]);

  // Whenever the user touches the volume slider, make sure the AudioContext
  // is resumed (browsers suspend it until a user gesture).
  useEffect(() => {
    if (volOpen) resumeAudio();
  }, [volOpen, resumeAudio]);

  const handleVolumeChange = (vals: number[]) => {
    const v = vals[0] ?? 0;
    setVolume(v);
    if (v > 0) {
      lastVolumeRef.current = v;
      setMuted(false);
    } else {
      setMuted(true);
    }
  };

  const toggleMute = () => {
    if (muted) {
      setMuted(false);
      setVolume(lastVolumeRef.current > 0 ? lastVolumeRef.current : 100);
    } else {
      lastVolumeRef.current = volume;
      setMuted(true);
    }
    resumeAudio();
  };

  // Pick the right volume icon based on the current level.
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  // Boost indicator: show a small "BOOST" pill when above 100%.
  const isBoosted = !muted && volume > 100;

  return (
    <div className="space-y-3">
      {/* Player — constrain to viewport width on mobile so the video
          never overflows horizontally. Use object-contain so the actual
          video frame is letterboxed inside the 16:9 box instead of
          stretching past the rounded corners. */}
      <div className="relative w-full overflow-hidden rounded-xl bg-black ring-1 ring-border mx-auto max-w-full" style={{ aspectRatio: "16 / 9" }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading stream...</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-foreground max-w-md">{error}</p>
            {trailerUrl && !showTrailer && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setShowTrailer(true);
                  setCurrentUrl(trailerUrl);
                }}
              >
                <Play className="h-4 w-4 fill-current" /> Watch Trailer
              </Button>
            )}
          </div>
        ) : currentUrl ? (
          <>
            <video
              ref={videoRef}
              key={currentUrl}
              src={currentUrl}
              // VIEWERS don't get native video controls — they can't pause,
              // seek, or change volume. They only watch what the host plays.
              // The host gets full controls.
              controls={partyRole !== "viewer"}
              // Disable picture-in-picture and download for viewers so they
              // can't escape the synced view. The host still gets these.
              controlsList={partyRole === "viewer" ? "nodownload nofullscreen noplaybackrate" : undefined}
              disablePictureInPicture={partyRole === "viewer"}
              disableRemotePlayback={partyRole === "viewer"}
              // Start MUTED so autoplay works on mobile browsers. The
              // "Tap to unmute" overlay lets the user enable audio with
              // a single tap (user gesture satisfies the autoplay policy).
              // This applies to BOTH host and viewer.
              autoPlay
              muted
              playsInline
              poster={posterUrl}
              className="absolute inset-0 h-full w-full bg-black object-contain"
              crossOrigin="anonymous"
              // Prevent right-click context menu on the video for viewers
              onContextMenu={partyRole === "viewer" ? (e) => e.preventDefault() : undefined}
              // FALLBACK: if the streaming proxy fails (e.g. on serverless
              // deployments like Netlify where the proxy function times out
              // after 10s), try loading the direct CDN URL. This may work
              // if the CDN doesn't enforce Referer checking for GET requests.
              onError={() => {
                if (!usingDirectUrl && directCdnUrl && directCdnUrl !== currentUrl) {
                  console.warn("Stream proxy failed, trying direct CDN URL as fallback…");
                  setUsingDirectUrl(true);
                  setCurrentUrl(directCdnUrl);
                }
              }}
            >
              {/* Active subtitle track. When trackSrc is empty the track
                  element is omitted entirely so no broken track shows up
                  in the browser's CC menu. For auto-translated tracks the
                  id is "auto-<lan>" and we use the language code directly. */}
              {trackSrc && (
                <track
                  ref={trackRef}
                  kind="subtitles"
                  label={(() => {
                    if (activeSubtitle.startsWith("auto-")) {
                      const lan = activeSubtitle.slice(5);
                      return `${fullLangName(lan)} (Auto-translated)`;
                    }
                    return captions.find((c) => c.id === activeSubtitle)?.lanName ||
                      "Subtitles";
                  })()}
                  srcLang={
                    activeSubtitle.startsWith("auto-")
                      ? activeSubtitle.slice(5)
                      : captions.find((c) => c.id === activeSubtitle)?.lan || "en"
                  }
                  src={trackSrc}
                  default
                />
              )}
              Your browser does not support HTML5 video.
            </video>
            {showTrailer && (
              <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground">
                Trailer
              </Badge>
            )}
            {/* VIEWER-ONLY banner: tells the viewer they're following the
                host's playback and can't control it. Has a close (X) button
                so the viewer can dismiss it if it's blocking their view.
                Once dismissed it stays hidden until the viewer navigates to
                a new title. */}
            {partyRole === "viewer" && bannerVisible && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm text-foreground border border-border rounded-full pl-3 pr-1.5 py-1 text-[11px] font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                </span>
                <span>Following host — view only</span>
                <button
                  onClick={() => setBannerVisible(false)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
                  aria-label="Hide banner"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {/* "Tap to unmute" button — shows for BOTH host and viewer.
                Mobile browsers block autoplay WITH SOUND, so the video
                auto-plays muted. This prominent button lets ANY user
                enable audio with a single tap (which counts as a user
                gesture, satisfying the autoplay policy). Once tapped,
                it disappears and the volume control takes over.
                IMPORTANT: we also call v.play() here because some mobile
                browsers PAUSE the video when you unmute it (the autoplay
                policy re-evaluates and blocks playback with sound). The
                tap is a user gesture, so play() will succeed with sound. */}
            {currentUrl && !loading && !error && audioMuted && !showTrailer && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (v) {
                    v.muted = false;
                    v.volume = 1.0;
                    // Explicitly call play() — the tap is a user gesture,
                    // so this will succeed even with sound. Without this,
                    // some mobile browsers pause the video when unmuting.
                    v.play().then(() => {
                      // Video is now playing with sound.
                    }).catch(() => {
                      // Play failed — try again muted as fallback.
                      v.muted = true;
                      v.play().catch(() => {});
                      setAudioMuted(true);
                      return;
                    });
                  }
                  setAudioMuted(false);
                  setVolume(100);
                  setMuted(false);
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors z-10"
                aria-label="Tap to unmute"
              >
                <div className="flex flex-col items-center gap-2 bg-black/80 backdrop-blur-sm rounded-2xl px-6 py-4 border border-border pointer-events-none">
                  <VolumeX className="h-10 w-10 text-white" />
                  <span className="text-sm font-semibold text-white">Tap to unmute</span>
                  <span className="text-[10px] text-white/70">You'll hear the host's audio</span>
                </div>
              </button>
            )}
            {/* CC overlay badge — shows the active subtitle language name.
                This is a status indicator only; the actual cue text is
                rendered by the browser inside the <video> via the <track>.
                For auto-translated tracks the id is "auto-<lan>" (e.g.
                "auto-zh"); we show the language name + a small "AUTO" tag. */}
            {!showTrailer && activeSubtitle !== "off" && (
              <Badge className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-foreground border border-border gap-1">
                <Captions className="h-3.5 w-3.5" />
                {translating ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    翻译中…
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    CC · {(() => {
                      if (activeSubtitle.startsWith("auto-")) {
                        return fullLangName(activeSubtitle.slice(5));
                      }
                      const cap = captions.find((c) => c.id === activeSubtitle);
                      return cap ? fullLangName(cap.lan, cap.lanName) : activeSubtitle;
                    })()}
                    {activeSubtitle.startsWith("auto-") && (
                      <span className="ml-0.5 rounded bg-amber-500/30 px-1 text-[8px] font-bold uppercase text-amber-300">
                        Auto
                      </span>
                    )}
                  </span>
                )}
              </Badge>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No video source available
          </div>
        )}
      </div>

      {/* VIEWER-ONLY volume control.
          Viewers can't control playback (play/pause/seek/quality/etc)
          but they CAN adjust their own audio volume independently from
          the host. This is important because:
          1. The video starts muted for autoplay — they need to unmute.
          2. Different viewers may want different volume levels.
          The host's volume doesn't affect viewers — each viewer has
          their own audio. */}
      {partyRole === "viewer" && currentUrl && !loading && !error && (
        <div className="flex items-center gap-2 mt-1">
          <Button
            variant={audioMuted || volume === 0 ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (audioMuted || volume === 0) {
                // Unmute
                v.muted = false;
                v.volume = lastVolumeRef.current > 0 ? lastVolumeRef.current / 100 : 1.0;
                setAudioMuted(false);
                setMuted(false);
                setVolume(lastVolumeRef.current > 0 ? lastVolumeRef.current : 100);
              } else {
                // Mute
                lastVolumeRef.current = volume;
                v.muted = true;
                setAudioMuted(true);
                setMuted(true);
              }
            }}
            aria-label="Mute/unmute"
          >
            {(() => {
              const ViewerVolIcon = audioMuted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
              return <ViewerVolIcon className="h-4 w-4" />;
            })()}
            <span className="text-xs font-semibold tabular-nums">
              {audioMuted ? "Muted" : `${volume}%`}
            </span>
          </Button>
          <Slider
            value={[audioMuted ? 0 : volume]}
            min={0}
            max={100}
            step={5}
            onValueChange={(vals) => {
              const vol = vals[0] ?? 0;
              const v = videoRef.current;
              setVolume(vol);
              if (vol > 0) {
                lastVolumeRef.current = vol;
                if (v) {
                  v.muted = false;
                  v.volume = vol / 100;
                }
                setAudioMuted(false);
                setMuted(false);
              } else {
                if (v) v.muted = true;
                setAudioMuted(true);
                setMuted(true);
              }
            }}
            className="flex-1 max-w-[200px]"
            aria-label="Volume level"
          />
          <span className="text-[10px] text-muted-foreground">
            Your audio — independent from host
          </span>
        </div>
      )}

      {/* Controls below player — HIDDEN for viewers.
          Viewers follow the host's playback and can't change season,
          quality, language, subtitles, volume, or episodes. Only the
          host sees these controls. */}
      {partyRole !== "viewer" && (
      <div className="flex flex-wrap items-center gap-2">
        {/* Series: season selector */}
        {subjectType !== 1 && seasons.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Season:</span>
            <Select value={String(curSe)} onValueChange={(v) => changeSeason(Number(v))}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.se} value={String(s.se)}>
                    Season {s.se || 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Resolution selector — shows ALL available qualities including
            VIP-locked ones (with a lock icon) so the user can see that
            720P / 1080P exist even if they can't be played for free.
            Selectable entries switch the active stream; VIP entries are
            shown greyed-out and non-interactive. */}
        {allStreams.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                aria-label="Video quality"
              >
                <span className="text-xs text-muted-foreground">Quality:</span>
                <span className="text-xs font-semibold">
                  {currentRes ? `${currentRes}P` : "Auto"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-48 bg-popover border-border p-1"
            >
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Video Quality
              </p>
              {/* Render from highest to lowest resolution. Dedupe by resolution
                  string so we don't show duplicate 720P entries when both
                  MP4 and HLS variants exist. */}
              {[...allStreams]
                .sort((a, b) => Number(b.resolutions) - Number(a.resolutions))
                .filter((s, i, arr) =>
                  arr.findIndex((x) => x.resolutions === s.resolutions) === i
                )
                .map((s) => {
                  const isVip = s.vipLocked || !s.url;
                  const isActive = s.resolutions === currentRes && !isVip;
                  return (
                    <button
                      key={s.resolutions + s.id}
                      disabled={isVip}
                      onClick={() => !isVip && changeResolution(s.resolutions)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : isVip
                          ? "opacity-50 cursor-not-allowed text-muted-foreground"
                          : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-semibold tabular-nums">
                          {s.resolutions}P
                        </span>
                      </span>
                      {isVip && (
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[9px] font-bold uppercase gap-0.5 border-amber-500/40 text-amber-500"
                        >
                          <Lock className="h-2.5 w-2.5" />
                          VIP
                        </Badge>
                      )}
                    </button>
                  );
                })}
              {allStreams.every((s) => s.vipLocked || !s.url) && (
                <p className="px-2 py-2 text-[11px] text-muted-foreground leading-snug">
                  All high-quality streams are VIP-only. Upgrade to unlock.
                </p>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Language icon — shows available audio dubs for this title.
            Chinese dubs (lanCode "zh") are sorted to the top so they're
            easy to find, and the pill shows "中文" for instant recognition. */}
        {audioDubs.length > 0 && (
          <Popover open={langOpen} onOpenChange={setLangOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                aria-label="Audio language"
              >
                <Languages className="h-4 w-4" />
                <span className="text-xs font-semibold">
                  {currentDub ? shortLangLabel(currentDub.lanCode) : "Lang"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 bg-popover border-border p-1 max-h-80 overflow-y-auto"
            >
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Audio Language
              </p>
              {[...audioDubs]
                .sort((a, b) => {
                  // Sort Chinese (zh) and English (en) to the top, then the
                  // rest alphabetically by language name.
                  const rank = (code: string) => {
                    const c = code.toLowerCase();
                    if (c === "zh") return 0;
                    if (c === "en") return 1;
                    return 2;
                  };
                  const ra = rank(a.lanCode);
                  const rb = rank(b.lanCode);
                  if (ra !== rb) return ra - rb;
                  return a.lanName.localeCompare(b.lanName);
                })
                .map((d) => {
                  const active = d.subjectId === subjectId;
                  // For the dub entry, show the native language name when
                  // the upstream label is just "Original Audio" — this helps
                  // users see that the original track IS Chinese (or whatever
                  // language) instead of a generic label.
                  const displayLabel =
                    d.original && d.lanName.toLowerCase().includes("original")
                      ? `${fullLangName(d.lanCode, d.lanName)} (Original)`
                      : fullLangName(d.lanCode, d.lanName);
                  return (
                    <button
                      key={d.subjectId}
                      onClick={() => switchDub(d)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary/15 text-primary"
                          : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                          {shortLangLabel(d.lanCode)}
                        </span>
                        <span className="truncate">{displayLabel}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
            </PopoverContent>
          </Popover>
        )}

        {/* Subtitles icon — shows available caption tracks fetched from the
            upstream caption endpoint for the current stream. Selecting a
            language fetches the SRT, converts it to WebVTT via /api/subtitle,
            and attaches it as a <track> on the <video> so the browser
            renders the cue text natively.

            Chinese (中文) is ALWAYS shown as the first option, even when the
            upstream doesn't return a native zh track. In that case, selecting
            it triggers automatic LLM translation from the English subtitle. */}
        {currentUrl && !showTrailer && !loading && !error && (
          <Popover open={subOpen} onOpenChange={setSubOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={activeSubtitle !== "off" || translating ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-1.5"
                aria-label="Subtitles"
              >
                <Captions className="h-4 w-4" />
                {translating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                <span className="text-xs font-semibold">
                  {translating
                    ? "翻译中…"
                    : activeSubtitle !== "off"
                    ? ((() => {
                        // Show the active language label on the button.
                        // For auto-translated tracks the id is "auto-<lan>".
                        if (activeSubtitle.startsWith("auto-")) {
                          return shortLangLabel(activeSubtitle.slice(5));
                        }
                        const cap = captions.find((c) => c.id === activeSubtitle);
                        return cap ? shortLangLabel(cap.lan) : "On";
                      })())
                    : "CC"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-60 bg-popover border-border p-1 max-h-96 overflow-y-auto"
            >
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Subtitles
              </p>

              {/* Translation progress indicator */}
              {translating && (
                <div className="flex items-center gap-2 px-2 py-2 mx-1 mb-1 rounded-md bg-primary/10 text-primary text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span className="truncate">{translateMessage || "Translating…"}</span>
                </div>
              )}
              {translateMessage && !translating && (
                <div className="flex items-start gap-2 px-2 py-2 mx-1 mb-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">{translateMessage}</span>
                </div>
              )}

              <button
                onClick={() => selectSubtitle("off")}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  activeSubtitle === "off"
                    ? "bg-primary/15 text-primary"
                    : "hover:bg-secondary text-foreground"
                }`}
              >
                <span>Off</span>
                {activeSubtitle === "off" && <Check className="h-4 w-4" />}
              </button>

              {/* Always-available Chinese subtitle.
                  If the upstream returned a native zh caption, clicking
                  selects it directly. Otherwise, clicking triggers auto-
                  translation from the English track via the LLM. */}
              {(() => {
                const nativeZh = captions.find(
                  (c) => c.lan.toLowerCase() === "zh"
                );
                const isZhActive = nativeZh
                  ? activeSubtitle === nativeZh.id
                  : activeSubtitle === "auto-zh";
                const zhLabel = nativeZh ? "中文" : "中文 (Auto-translate)";
                return (
                  <button
                    onClick={() => {
                      if (nativeZh) {
                        selectSubtitle(nativeZh.id);
                      } else {
                        selectAutoTranslate("zh");
                      }
                    }}
                    disabled={translating || (captions.length === 0 && !captionsLoading)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      isZhActive
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-secondary text-foreground"
                    } ${translating ? "opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                        中文
                      </span>
                      <span className="truncate">{zhLabel}</span>
                    </span>
                    {isZhActive && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })()}

              {captionsLoading && (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading subtitles…
                </div>
              )}
              {!captionsLoading && captions.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No native subtitles from upstream. Chinese (Auto-translate)
                  is still available above.
                </div>
              )}

              {/* Native caption tracks from upstream, sorted with English
                  first then alphabetically. Chinese is already shown above
                  so we skip it here to avoid a duplicate. */}
              {[...captions]
                .filter((c) => c.lan.toLowerCase() !== "zh")
                .sort((a, b) => {
                  const rank = (code: string) => {
                    const c = code.toLowerCase();
                    if (c === "en") return 0;
                    return 1;
                  };
                  const ra = rank(a.lan);
                  const rb = rank(b.lan);
                  if (ra !== rb) return ra - rb;
                  return a.lanName.localeCompare(b.lanName);
                })
                .map((c) => {
                  const active = activeSubtitle === c.id;
                  const displayLabel = fullLangName(c.lan, c.lanName);
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectSubtitle(c.id)}
                      disabled={translating}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary/15 text-primary"
                          : "hover:bg-secondary text-foreground"
                      } ${translating ? "opacity-50" : ""}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                          {shortLangLabel(c.lan)}
                        </span>
                        <span className="truncate">{displayLabel}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
            </PopoverContent>
          </Popover>
        )}

        {/* Volume control — click the icon to mute/unmute, click the
            percentage to open a slider popover. The slider goes 0–200%:
            0–100% uses native HTMLMediaElement.volume; 101–200% routes
            the audio through a Web Audio GainNode for amplification. */}
        {currentUrl && !loading && !error && (
          <Popover open={volOpen} onOpenChange={setVolOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={isBoosted ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-1.5"
                aria-label="Volume"
              >
                <VolumeIcon className="h-4 w-4" />
                <span className="text-xs font-semibold tabular-nums">
                  {muted ? "Mute" : `${volume}%`}
                </span>
                {isBoosted && (
                  <Badge
                    variant="outline"
                    className="ml-0.5 h-4 px-1 text-[9px] font-bold uppercase tracking-wide border-primary/40 text-primary"
                  >
                    Boost
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 bg-popover border-border p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Volume
                </p>
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {muted ? "0%" : `${volume}%`}
                </span>
              </div>
              <Slider
                value={[muted ? 0 : volume]}
                min={0}
                max={200}
                step={5}
                onValueChange={handleVolumeChange}
                className="w-full"
                aria-label="Volume level"
              />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground tabular-nums">
                <span>0%</span>
                <span className="text-foreground/70">100%</span>
                <span className="text-primary font-semibold">200%</span>
              </div>
              {/* Quick preset buttons */}
              <div className="flex gap-1 mt-3">
                {[50, 100, 150, 200].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleVolumeChange([preset])}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold tabular-nums transition-colors ${
                      !muted && volume === preset
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground/80 hover:bg-secondary/70"
                    }`}
                  >
                    {preset === 200 ? "200%" : `${preset}%`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
                Volume above 100% uses Web Audio API amplification — useful for
                quiet sources. May introduce distortion at extreme levels.
              </p>
            </PopoverContent>
          </Popover>
        )}

        {/* Trailer toggle */}
        {trailerUrl && !loading && !error && (
          <Button
            size="sm"
            variant={showTrailer ? "secondary" : "outline"}
            onClick={() => {
              if (showTrailer) {
                // Back to movie
                loadPlayInfo(curSe, curEp);
              } else {
                setShowTrailer(true);
                setCurrentUrl(trailerUrl);
                setStreams([]);
              }
            }}
            className="h-9"
          >
            {showTrailer ? "Back to Movie" : "Watch Trailer"}
          </Button>
        )}
      </div>
      )}

      {/* Episodes grid for series — HIDDEN for viewers (they follow host's episode) */}
      {partyRole !== "viewer" && subjectType !== 1 && seasonEpisodes.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2 text-foreground">
            Episodes
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
            {seasonEpisodes.map((ep) => (
              <button
                key={ep}
                onClick={() => changeEpisode(ep)}
                className={`aspect-square rounded-lg text-sm font-semibold transition-all ${
                  ep === curEp
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground/80 hover:bg-secondary hover:text-foreground border border-border"
                }`}
              >
                {ep}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* VIP notice — HIDDEN for viewers */}
      {partyRole !== "viewer" && streams.length === 0 && !loading && !error && trailerUrl && !showTrailer && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Free streams for this title are temporarily unavailable. You can
            still watch the trailer above, or browse other titles.
          </p>
        </div>
      )}
    </div>
  );
}
