/**
 * CineStream Client-Side MovieBox API
 *
 * This module runs entirely in the browser — no server required.
 * It calls the MovieBox public API directly via a CORS proxy, which
 * adds the forbidden headers (Origin, Referer, User-Agent) that browsers
 * block by default.
 *
 * This is what makes CineStream work as a bundled Capacitor APK with
 * zero server infrastructure: the APK ships the React UI and this lib
 * together, and all data fetching happens client-side.
 */

// CORS proxy options. We try them in order — if one is down or rate-limited,
// we fall back to the next. The `?url=` format wraps the target URL.
const CORS_PROXIES = [
  // AllOrigins — supports most headers, good for JSON APIs
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  // corsproxy.io — fast, reliable, passes through headers
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  // codetabs — simple, no auth
  (u: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  // Direct fetch (works in Capacitor webview because Android doesn't enforce CORS)
  (u: string) => u,
];

const API_BASE = "https://h5-api.aoneroom.com";
const ORIGIN = "https://moviebox.ph";

// In the Capacitor Android WebView, we can attach any header (no CORS), so
// we use the full original headers. In a regular browser, the CORS proxy
// handles the header injection for us.
const COMMON_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
  Accept: "application/json",
  "X-Request-Lang": "en",
  "X-Client-Info": JSON.stringify({ timezone: "Asia/Hong_Kong" }),
  "X-Source": "",
};

// Cached guest token
let guestToken: string | null = null;
let guestTokenExpiry = 0;

function captureTokenFromResponse(res: Response) {
  const xUser = res.headers.get("x-user");
  if (!xUser) return;
  try {
    const parsed = JSON.parse(xUser) as { token?: string };
    if (parsed.token) {
      guestToken = parsed.token;
      guestTokenExpiry = Date.now() + 60 * 60 * 1000;
    }
  } catch {
    // ignore
  }
}

function authHeaders(): HeadersInit {
  if (guestToken && Date.now() < guestTokenExpiry) {
    return { Authorization: `Bearer ${guestToken}` };
  }
  return {};
}

// Detect if we're running inside the Capacitor WebView (where CORS is not
// enforced — we can fetch the upstream API directly with full headers).
function isNativeWebView(): boolean {
  if (typeof window === "undefined") return false;
  return (
    // Capacitor injects this on Android
    (window as any).capacitor !== undefined ||
    // User-agent contains "wv" (Android WebView) or "CineStream"
    navigator.userAgent.includes("wv") ||
    navigator.userAgent.includes("CineStream")
  );
}

async function mbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers = {
    ...COMMON_HEADERS,
    ...authHeaders(),
    ...(init?.headers ?? {}),
  };

  // In native webview: direct fetch (no CORS, all headers pass through)
  if (isNativeWebView()) {
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch {}
      throw new Error(`MovieBox API ${res.status} for ${path}${detail ? `: ${detail}` : ""}`);
    }
    captureTokenFromResponse(res);
    const text = await res.text();
    if (!text || text.trim().length === 0) {
      throw new Error(`MovieBox API returned empty body for ${path}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      throw new Error(`MovieBox API returned invalid JSON for ${path}: ${(e as Error).message}`);
    }
  }

  // In browser: try each CORS proxy in order
  let lastErr: Error | null = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const proxiedUrl = proxy(url);
      const res = await fetch(proxiedUrl, {
        ...init,
        // Don't forward our forbidden headers to the proxy — it adds them
        // upstream. We keep only Accept and auth.
        headers: {
          Accept: "application/json",
          ...authHeaders(),
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = new Error(`MovieBox API ${res.status} for ${path} (via proxy)`);
        continue;
      }
      captureTokenFromResponse(res);
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        lastErr = new Error(`MovieBox API returned empty body for ${path}`);
        continue;
      }
      try {
        return JSON.parse(text) as T;
      } catch (e) {
        lastErr = new Error(`MovieBox API returned invalid JSON for ${path}: ${(e as Error).message}`);
        continue;
      }
    } catch (e) {
      lastErr = e as Error;
      continue;
    }
  }
  throw lastErr || new Error(`All CORS proxies failed for ${path}`);
}

/** Prime the guest token by calling a public endpoint. */
export async function primeGuestToken(): Promise<void> {
  if (guestToken && Date.now() < guestTokenExpiry) return;
  try {
    await mbFetch(`/wefeed-h5api-bff/home?host=moviebox.ph`);
  } catch {
    // ignore
  }
}

// In-memory client-side cache (5 min TTL)
interface CacheEntry<T> { value: T; expires: number; }
const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// ---- Type definitions (only the fields we use) -----------------------------

export interface MBImage {
  url: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface MBDub {
  subjectId: string;
  lanName: string;
  lanCode: string;
  original: boolean;
  type: number;
  detailPath: string;
}

export interface MBSubject {
  subjectId: string;
  subjectType: number;
  title: string;
  description?: string;
  releaseDate?: string;
  duration?: number;
  genre?: string;
  cover?: MBImage;
  countryName?: string;
  imdbRatingValue?: string;
  imdbRatingCount?: number;
  subtitles?: string;
  detailPath?: string;
  postTitle?: string;
  corner?: string;
  hasResource?: boolean;
  stills?: MBImage | null;
  dubs?: MBDub[];
}

export interface MBStaff {
  staffId: string;
  staffType: number;
  name: string;
  character?: string;
  avatarUrl?: string;
  detailPath?: string;
}

export interface MBTrailerVideo {
  videoId: string;
  videoDomain?: string;
  definitionList?: { code: string; url: string; description?: string }[];
  originSubtitle?: { url: string; lanName?: string; lanCode?: string }[];
}

export interface MBSeason {
  id: number;
  seasonName?: string;
  episodeCount?: number;
  airDate?: string;
}

export interface MBEpisode {
  id: number;
  number: number;
  name?: string;
  still?: MBImage;
  duration?: number;
  airDate?: string;
  hasResource?: boolean;
}

export interface MBStream {
  id: string;
  quality?: string;
  url?: string;
  originSubtitle?: { url: string; lanName?: string; lanCode?: string }[];
  // newer API fields
  code?: string;
  format?: string;
  description?: string;
  definition?: string;
}

export interface MBCaption {
  url: string;
  lanName?: string;
  lanCode?: string;
  isOrigin?: boolean;
}

export interface MBHomeData {
  platformList?: { name: string; uploadBy?: string; subjectList?: MBSubject[] }[];
  bannerList?: MBSubject[];
  subjectList?: MBSubject[];
  // any other fields the upstream returns
  [k: string]: any;
}

export interface MBTrendingData {
  subjectList?: MBSubject[];
  [k: string]: any;
}

export interface MBDetailData {
  subject: MBSubject & {
    staff?: MBStaff[];
    seasonList?: MBSeason[];
    episodeList?: MBEpisode[];
    trailerList?: MBTrailerVideo[];
    coverList?: MBImage[];
    descriptionHtml?: string;
  };
  [k: string]: any;
}

export interface MBRecommendationsData {
  subjectList?: MBSubject[];
  [k: string]: any;
}

export interface MBPlayData {
  streamList?: MBStream[];
  // newer API returns this shape
  data?: {
    qualityList?: { code: string; description: string; url: string }[];
    originSubtitle?: { url: string; lanName?: string; lanCode?: string }[];
  };
  [k: string]: any;
}

export interface MBCaptionsData {
  url?: string;
  subtitles?: { url: string; lanName?: string; lanCode?: string; isOrigin?: boolean }[];
  [k: string]: any;
}

export interface FilterParams {
  subjectType?: number;
  genre?: string | string[];
  country?: string | string[];
  year?: string;
  sort?: string;
  page?: number;
  perPage?: number;
  [k: string]: any;
}

export interface MBFilterData {
  pager?: { hasMore: boolean; nextPage: string; page: string; perPage: number; totalCount: number };
  items: MBSubject[];
  [k: string]: any;
}

export interface MBSearchData extends MBFilterData {}

// ---- API functions ---------------------------------------------------------

export function getHome(): Promise<{ code: number; data: MBHomeData }> {
  return mbFetch(`/wefeed-h5api-bff/home?host=moviebox.ph`);
}

export function getTrending(): Promise<{ code: number; data: MBTrendingData }> {
  return mbFetch(`/wefeed-h5api-bff/recommends?host=moviebox.ph`);
}

export function getDetail(
  subjectId: string
): Promise<{ code: number; data: MBDetailData }> {
  return mbFetch(
    `/wefeed-h5api-bff/subject/${subjectId}?host=moviebox.ph&isNew=1`
  );
}

export function getRecommendations(
  subjectId: string,
  subjectType: number
): Promise<{ code: number; data: MBRecommendationsData }> {
  return mbFetch(
    `/wefeed-h5api-bff/subject/${subjectId}/subjects?type=${subjectType}&host=moviebox.ph`
  );
}

export function getPlayInfo(
  subjectId: string,
  detailPath: string,
  se: number,
  ep: number
): Promise<{ code: number; data: MBPlayData }> {
  // detailPath is base64-encoded already in the upstream data
  const url = `/wefeed-h5api-bff/subject/${subjectId}/play-url?host=moviebox.ph&se=${se}&ep=${ep}&detailPath=${detailPath}`;
  return mbFetch(url);
}

export function getCaptions(
  streamId: string,
  subjectId: string,
  detailPath: string
): Promise<{ code: number; data: MBCaptionsData }> {
  const url = `/wefeed-h5api-bff/subject/${subjectId}/caption?host=moviebox.ph&streamId=${streamId}&detailPath=${detailPath}`;
  return mbFetch(url);
}

export function filterSubjects(
  params: FilterParams
): Promise<{ code: number; data: MBFilterData }> {
  const search = new URLSearchParams();
  search.set("host", "moviebox.ph");
  if (params.subjectType != null) search.set("subjectType", String(params.subjectType));
  if (params.genre) {
    const g = Array.isArray(params.genre) ? params.genre.join(",") : params.genre;
    search.set("genre", g);
  }
  if (params.country) {
    const c = Array.isArray(params.country) ? params.country.join(",") : params.country;
    search.set("country", c);
  }
  if (params.year) search.set("year", params.year);
  if (params.sort) search.set("sort", params.sort);
  if (params.page != null) search.set("page", String(params.page));
  if (params.perPage != null) search.set("perPage", String(params.perPage));
  return mbFetch(`/wefeed-h5api-bff/subject/filter?${search.toString()}`);
}

export function searchSubjects(
  keyword: string,
  page = 1,
  perPage = 18,
  subjectType = 0
): Promise<{ code: number; data: MBSearchData }> {
  // search requires a guest token
  const search = new URLSearchParams();
  search.set("host", "moviebox.ph");
  search.set("keyword", keyword);
  search.set("page", String(page));
  search.set("perPage", String(perPage));
  if (subjectType) search.set("subjectType", String(subjectType));
  return mbFetch(`/wefeed-h5api-bff/search?${search.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}
