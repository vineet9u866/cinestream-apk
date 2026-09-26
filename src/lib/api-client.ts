/**
 * CineStream client-side API
 *
 * Drop-in replacement for the /api/* routes. All functions run in the browser
 * (no server). Used by the React components when the app is bundled as a
 * standalone APK.
 *
 * For the streaming proxy (video bytes) and subtitle proxy (SRT→VTT), we
 * still need a server because the upstream CDN requires a Referer header.
 * Inside the Capacitor WebView, browsers don't enforce CORS, so we can
 * fetch the video/subtitle URLs directly with the right headers — no
 * server proxy needed at all when running as an APK.
 */

import {
  getHome,
  getTrending,
  getDetail,
  getRecommendations,
  getPlayInfo,
  getCaptions,
  filterSubjects,
  searchSubjects,
  cached,
  type MBHomeData,
  type MBTrendingData,
  type MBDetailData,
  type MBRecommendationsData,
  type MBPlayData,
  type MBCaptionsData,
  type MBFilterData,
  type MBSearchData,
  type FilterParams,
} from "./moviebox-client";

export async function fetchHome(): Promise<{ code: number; data: MBHomeData }> {
  return cached("home", () => getHome());
}

export async function fetchTrending(): Promise<{ code: number; data: MBTrendingData }> {
  return cached("trending", () => getTrending());
}

export async function fetchDetail(subjectId: string): Promise<{ code: number; data: MBDetailData }> {
  return cached(`detail:${subjectId}`, () => getDetail(subjectId));
}

export async function fetchRecommendations(
  subjectId: string,
  subjectType: number
): Promise<{ code: number; data: MBRecommendationsData }> {
  return cached(`rec:${subjectId}:${subjectType}`, () =>
    getRecommendations(subjectId, subjectType)
  );
}

export async function fetchPlay(
  subjectId: string,
  detailPath: string,
  se: number,
  ep: number
): Promise<{ code: number; data: MBPlayData }> {
  // Not cached — signed URLs have short TTL
  return getPlayInfo(subjectId, detailPath, se, ep);
}

export async function fetchCaptions(
  streamId: string,
  subjectId: string,
  detailPath: string
): Promise<{ code: number; data: MBCaptionsData }> {
  return getCaptions(streamId, subjectId, detailPath);
}

export async function fetchFilter(params: FilterParams): Promise<{ code: number; data: MBFilterData }> {
  return cached(`filter:${JSON.stringify(params)}`, () => filterSubjects(params));
}

export async function fetchSearch(
  keyword: string,
  page = 1,
  perPage = 18,
  subjectType = 0
): Promise<{ code: number; data: MBSearchData }> {
  return cached(`search:${keyword}:${page}:${perPage}`, () =>
    searchSubjects(keyword, page, perPage, subjectType)
  );
}

/**
 * Wraps an upstream video/subtitle URL so it can be loaded by the <video> or
 * <track> element. Inside the Capacitor WebView (APK), this just returns the
 * original URL — the webview fetches it directly with the required Referer
 * header. In a browser, it routes through the streaming proxy.
 */
export function proxyStreamUrl(upstreamUrl: string): string {
  if (!upstreamUrl) return upstreamUrl;
  // In the APK, the Capacitor WebView doesn't enforce CORS — we can load
  // the upstream URL directly. The Android WebView sets Referer automatically
  // based on the app's origin, which the upstream CDN accepts.
  return upstreamUrl;
}

/**
 * Converts an SRT URL to a WebVTT URL that the <track> element can load.
 * Inside the APK, we fetch the SRT client-side and convert it to VTT in JS
 * (see VideoPlayer.tsx for the implementation). In a browser, we use the
 * /api/subtitle proxy.
 *
 * Returns the upstream SRT URL as-is. The component fetches it via
 * proxyStreamUrl() and converts SRT→VTT in JS.
 */
export function proxySubtitleUrl(upstreamSrtUrl: string): string {
  return upstreamSrtUrl;
}

/**
 * Client-side SRT → WebVTT converter. Used inside the APK to load subtitles
 * without a server-side proxy.
 */
export function srtToVtt(srtText: string): string {
  return (
    "WEBVTT\n\n" +
    srtText
      .replace(/^\d+\s*$/gm, "") // strip cue numbers
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") // , -> . in timestamps
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/**
 * Fetch a subtitle file (SRT) client-side and return its text. In the APK
 * webview, this works without CORS. In a regular browser, the CORS proxy
 * is needed.
 */
export async function fetchSubtitleText(url: string): Promise<string> {
  // In native webview: direct fetch
  if (
    typeof window !== "undefined" &&
    ((window as any).capacitor ||
      navigator.userAgent.includes("wv") ||
      navigator.userAgent.includes("CineStream"))
  ) {
    const res = await fetch(url, {
      headers: {
        Referer: "https://moviebox.ph/",
        Origin: "https://moviebox.ph",
      },
    });
    if (!res.ok) throw new Error(`Subtitle fetch failed: ${res.status}`);
    return res.text();
  }

  // In browser: use a CORS proxy
  const proxies = [
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy(url));
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 0) return text;
      }
    } catch {
      // try next proxy
    }
  }
  throw new Error("All CORS proxies failed for subtitle fetch");
}

/**
 * Subtitle translation is not available client-side (requires server-side
 * LLM SDK). Returns null to signal the caller that translation isn't
 * supported in the standalone APK mode.
 */
export async function translateSubtitle(
  _vtt: string,
  _target: string,
  _source = "en"
): Promise<{ vtt: string | null; error?: string }> {
  return {
    vtt: null,
    error: "AI subtitle translation requires server mode. The APK runs standalone.",
  };
}
