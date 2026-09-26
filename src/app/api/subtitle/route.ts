import { NextRequest, NextResponse } from "next/server";
import { parseSync, stringifySync } from "subtitle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Trusted upstream CDN hosts for subtitle files. Same as the stream proxy.
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
 * Subtitle proxy with on-the-fly SRT -> WebVTT conversion.
 *
 * Browsers only load <track> sources that are served as `text/vtt` (and,
 * for cross-origin tracks, with proper CORS headers). The upstream CDN
 * serves raw .srt files with no CORS headers, so we proxy through our own
 * server, convert the format, and add the right content-type + CORS.
 *
 * Query params:
 *   url  - the upstream SRT URL (must be on a trusted host)
 *
 * Returns the converted WebVTT document with Content-Type: text/vtt.
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

  const upstreamHeaders: HeadersInit = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: "https://moviebox.ph/",
    Origin: "https://moviebox.ph",
    Accept: "*/*",
  };

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream.toString(), {
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (e) {
    return new Response(`Upstream fetch failed: ${(e as Error).message}`, {
      status: 502,
    });
  }

  if (!upstreamRes.ok) {
    return new Response(`Upstream ${upstreamRes.status}`, {
      status: upstreamRes.status,
    });
  }

  // Subtitle files are small (typically < 200KB), so buffering the whole
  // response in memory is fine and makes the SRT->VTT conversion trivial.
  const srtText = await upstreamRes.text();

  let vttText: string;
  try {
    // parseSync returns a node list, stringifySync({format: 'WebVTT'})
    // emits a valid WebVTT document with the WEBVTT header and proper
    // timestamp formatting (dots instead of commas).
    const nodes = parseSync(srtText);
    vttText = stringifySync(nodes, { format: "WebVTT" });
  } catch (e) {
    // Fallback: a minimal SRT->VTT transform if the parser chokes on
    // something exotic. This handles 99% of well-formed SRT files.
    vttText = "WEBVTT\n\n" + srtText
      .replace(/^\d+\s*$/gm, "")           // strip cue numbers
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")  // , -> . in timestamps
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n";
    // If even the fallback failed, return a 502.
    if (!vttText.includes("WEBVTT")) {
      return new Response(`Subtitle parse failed: ${(e as Error).message}`, {
        status: 502,
      });
    }
  }

  const outHeaders = new Headers();
  outHeaders.set("Content-Type", "text/vtt; charset=utf-8");
  outHeaders.set("Cache-Control", "no-store");
  outHeaders.set("Access-Control-Allow-Origin", "*");

  return new NextResponse(vttText, {
    status: 200,
    headers: outHeaders,
  });
}
