/**
 * CineStream - Server-side proxy client for the MovieBox public API.
 *
 * All requests are made from the server to avoid CORS, ads, pop-ups,
 * and any "download our app" prompts. The frontend only ever talks
 * to our own /api/* routes.
 */

const API_BASE = "https://h5-api.aoneroom.com";
const ORIGIN = "https://moviebox.ph";

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

// Cached guest token (anonymous user). The upstream API returns a fresh guest
// token in the `x-user` response header on every request. We capture it once
// and reuse it for authenticated endpoints (like search).
let guestToken: string | null = null;
let guestTokenExpiry = 0;

function captureTokenFromResponse(res: Response) {
  const xUser = res.headers.get("x-user");
  if (!xUser) return;
  try {
    const parsed = JSON.parse(xUser) as { token?: string };
    if (parsed.token) {
      guestToken = parsed.token;
      // Tokens are valid for 90 days, but we refresh every hour to be safe.
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

async function mbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...COMMON_HEADERS,
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
    // Slightly longer timeout for detail/play endpoints.
    cache: "no-store",
  });

  if (!res.ok) {
    // Read the body text for a more helpful error message, but don't
    // let a secondary parse failure mask the original HTTP error.
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // ignore — body may already be consumed or stream may be broken
    }
    throw new Error(
      `MovieBox API ${res.status} for ${path}${detail ? `: ${detail}` : ""}`
    );
  }

  // Capture any fresh guest token returned.
  captureTokenFromResponse(res);

  // Guard against empty 200 responses — the upstream CDN occasionally
  // returns a 200 with zero bytes (cache miss / rate limit / connection
  // drop), and calling .json() on an empty body throws "Unexpected end
  // of JSON input". We convert that to a descriptive error so the API
  // route's catch block can return a proper 500 JSON response instead
  // of leaving the client with an unparseable body.
  const text = await res.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`MovieBox API returned empty body for ${path}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(
      `MovieBox API returned invalid JSON for ${path}: ${(e as Error).message}`
    );
  }
}

/** Prime the guest token by calling a public endpoint. */
export async function primeGuestToken(): Promise<void> {
  if (guestToken && Date.now() < guestTokenExpiry) return;
  try {
    await mbFetch(`/wefeed-h5api-bff/home?host=moviebox.ph`);
  } catch {
    // ignore - other endpoints will retry
  }
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
  lanName: string; // e.g. "Original Audio", "Arabic dub", "French sub"
  lanCode: string; // e.g. "en", "ar", "fr"
  original: boolean;
  type: number; // 0 = dub (audio), 1 = sub (subtitle version)
  detailPath: string;
}

export interface MBSubject {
  subjectId: string;
  subjectType: number; // 1 = movie, 2 = series, 6 = video, etc.
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
  staffType: number; // 1 = actor, 2 = director
  name: string;
  character?: string;
  avatarUrl?: string;
  detailPath?: string;
}

export interface MBTrailerVideo {
  videoId: string;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface MBTrailer {
  videoAddress?: MBTrailerVideo;
  cover?: MBImage;
}

export interface MBSeason {
  se: number;
  maxEp: number;
  allEp: string;
  resolutions?: { resolution: number; epNum: number }[];
}

export interface MBResource {
  seasons: MBSeason[];
  source?: string;
  uploadBy?: string;
}

export interface MBStream {
  format: string;
  id: string;
  url: string;
  resolutions: string;
  size?: string;
  duration?: number;
  codecName?: string;
  vipLocked?: boolean;
}

export interface MBDetailData {
  subject: MBSubject & { trailer?: MBTrailer | null };
  stars: MBStaff[];
  resource: MBResource;
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string;
    keyWords?: string;
  };
  isForbid?: boolean;
  postList?: unknown;
  watchTimeLimit?: unknown;
}

export interface MBHomeData {
  platformList: { name: string; uploadBy: string }[];
  operatingList: {
    type: string;
    position: number;
    title: string;
    subjects: MBSubject[];
    banner?: { items: { id: string; title: string; image: MBImage; subject: MBSubject; detailPath: string }[] };
  }[];
}

export interface MBFilterData {
  pager: { hasMore: boolean; nextPage: string; page: string; perPage: number; totalCount: number };
  items: MBSubject[];
}

export interface MBTrendingData {
  subjectList: MBSubject[];
}

export interface MBPlayData {
  streams: MBStream[];
  hls: MBStream[];
  dash: MBStream[];
  hasResource: boolean;
  limited: boolean;
  limitedCode?: string;
  freeNum?: number;
  vipLocked?: boolean;
}

/** A single subtitle (caption) track returned by the caption endpoint. */
export interface MBCaption {
  id: string;
  lan: string;        // language code, e.g. "en", "ar", "ptbr"
  lanName: string;    // human-readable language name, e.g. "English", "اَلْعَرَبِيَّةُ"
  url: string;        // SRT file URL on cacdn.hakunaymatata.com
  size?: string;      // file size in bytes (string)
  delay?: number;     // optional delay in ms
}

export interface MBCaptionData {
  captions: MBCaption[];
}

// ---- API wrappers ----------------------------------------------------------

export function getHome(): Promise<{ code: number; data: MBHomeData }> {
  return mbFetch(`/wefeed-h5api-bff/home?host=moviebox.ph`);
}

export function getTrending(): Promise<{ code: number; data: MBTrendingData }> {
  return mbFetch(`/wefeed-h5api-bff/subject/trending`);
}

export interface FilterParams {
  page?: number;
  perPage?: number;
  subjectType?: number; // 1 movie, 2 series, 0 all
  genre?: string;
  sort?: string; // "hot" | "latest"
  country?: string;
  year?: string;
}

export function filterSubjects(
  params: FilterParams
): Promise<{ code: number; data: MBFilterData }> {
  const body = {
    page: 1,
    perPage: 18,
    subjectType: 0,
    ...params,
  };
  return mbFetch(`/wefeed-h5api-bff/subject/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function searchSubjects(
  keyword: string,
  page = 1,
  perPage = 18,
  subjectType = 0
): Promise<{ code: number; data: MBFilterData }> {
  // Search requires a guest token. Prime it if we don't have one yet.
  if (!guestToken || Date.now() >= guestTokenExpiry) {
    await primeGuestToken();
  }
  return mbFetch(`/wefeed-h5api-bff/subject/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, page, perPage, subjectType }),
  });
}

export function getDetail(
  subjectId: string
): Promise<{ code: number; data: MBDetailData }> {
  return mbFetch(`/wefeed-h5api-bff/detail?subjectId=${subjectId}`);
}

export function getRecommendations(
  subjectId: string,
  subjectType: number,
  pageNum = 1
): Promise<{ code: number; data: { items: MBSubject[] } }> {
  return mbFetch(
    `/wefeed-h5api-bff/subject/detail-rec?subjectId=${subjectId}&subjectType=${subjectType}&page=${pageNum}&perPage=12`
  );
}

export function getPlayInfo(
  subjectId: string,
  detailPath: string,
  se = 0,
  ep = 0
): Promise<{ code: number; data: MBPlayData }> {
  // The play endpoint signs URLs with a short TTL. CloudFront caches the
  // upstream response, which means a cached response will hand back URLs
  // that have already expired. Add a cache-busting nonce to force a fresh
  // signature every time.
  const nonce = Date.now();
  const path = `/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${encodeURIComponent(
    detailPath
  )}&streamSignType=1&_=${nonce}`;
  // The play endpoint is sensitive to Referer - it expects the request to come
  // from a play page on moviebox.ph. Override the default Referer.
  return mbFetch(path, {
    headers: {
      Referer: `${ORIGIN}/play/${detailPath}`,
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
    },
  });
}

/**
 * Fetch the list of available caption (subtitle) tracks for a specific stream.
 *
 * The upstream endpoint is:
 *   /wefeed-h5api-bff/subject/caption?id={streamId}&subjectId={subjectId}
 *
 * It returns an array of caption objects, each pointing to an SRT file on
 * cacdn.hakunaymatata.com. The SRT URLs are signed with a short-lived
 * CloudFront policy.
 */
export function getCaptions(
  streamId: string,
  subjectId: string,
  detailPath: string
): Promise<{ code: number; data: MBCaptionData }> {
  const path = `/wefeed-h5api-bff/subject/caption?id=${streamId}&subjectId=${subjectId}`;
  return mbFetch(path, {
    headers: {
      Referer: `${ORIGIN}/play/${detailPath}`,
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
    },
  });
}

// ---- Helpers ---------------------------------------------------------------

export const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "War",
  "Western",
];

export const PLATFORMS = [
  "Netflix",
  "PrimeVideo",
  "Disney",
  "AppleTV",
  "Hulu",
  "Viu",
  "Zee5",
  "Vivamax",
  "Hoichoi",
  "Showmax",
];

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function subjectTypeLabel(type?: number): string {
  switch (type) {
    case 1:
      return "Movie";
    case 2:
      return "Series";
    case 6:
      return "Video";
    default:
      return "Title";
  }
}

/**
 * In-memory cache for the home page so we don't hammer the upstream API.
 */
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 60_000; // 1 minute

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return hit.data as T;
  }
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}
