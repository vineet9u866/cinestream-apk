import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Trusted upstream CDN hosts. We refuse to proxy anything else.
const ALLOWED_HOSTS = [
  "hakunaymatata.com",
  "aoneroom.com",
];

function isAllowedHost(url: URL): boolean {
  return ALLOWED_HOSTS.some(
    (h) => url.hostname === h || url.hostname.endsWith("." + h)
  );
}

/**
 * Streaming proxy for video resources.
 *
 * The upstream CDN gates requests by `Referer: https://moviebox.ph/` (or
 * `https://netfilm.world/`). Browsers cannot be coerced into sending that
 * Referer from a different origin, so we proxy the bytes through our own
 * server, attaching the required Referer header.
 *
 * Supports HTTP Range requests so the <video> element can seek.
 */
export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return new Response("Missing url", { status: 400 });
  }

  let upstream: URL;
  try {
    upstream = new URL(urlParam);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!isAllowedHost(upstream)) {
    return new Response("Forbidden host", { status: 403 });
  }

  // Forward the Range header so seeking works.
  const upstreamHeaders: HeadersInit = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: "https://moviebox.ph/",
    Origin: "https://moviebox.ph",
    Accept: "*/*",
  };
  const range = req.headers.get("range");
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  let upstreamRes: Response;
  try {
    // Use an AbortController with a generous timeout. The stream proxy
    // can take a while for large videos, but we want to fail fast if
    // the upstream CDN is genuinely unreachable instead of hanging for
    // 30+ seconds and exhausting server connections.
    // 25 seconds is long enough for a slow CDN warm-up but short enough
    // to free the connection before the dev server's default 30s timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    upstreamRes = await fetch(upstream.toString(), {
      headers: upstreamHeaders,
      // Don't cache - signed URLs are unique per request.
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e) {
    const msg = (e as Error).name === "AbortError"
      ? "Upstream fetch timed out after 25s"
      : `Upstream fetch failed: ${(e as Error).message}`;
    return new Response(msg, { status: 502 });
  }

  if (!upstreamRes.ok && upstreamRes.status !== 206) {
    return new Response(`Upstream ${upstreamRes.status}`, {
      status: upstreamRes.status,
    });
  }

  // Forward the relevant headers.
  const outHeaders = new Headers();
  const passThrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "expires",
    "last-modified",
    "etag",
  ];
  for (const h of passThrough) {
    const v = upstreamRes.headers.get(h);
    if (v) outHeaders.set(h, v);
  }
  // Allow cross-origin video loading (the browser is same-origin to us,
  // but be permissive in case of CDN caching).
  outHeaders.set("Access-Control-Allow-Origin", "*");

  // Stream the body straight through.
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}
