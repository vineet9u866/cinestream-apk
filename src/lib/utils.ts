import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely parse a fetch Response as JSON.
 *
 * Guards against the three common failure modes that cause
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input":
 *
 *  1. Non-OK HTTP status (4xx / 5xx) — returns a synthetic error object
 *     with `code` and `message` fields instead of trying to parse the body.
 *  2. Empty body (0 bytes) — the browser's `res.json()` throws on empty
 *     input; we catch that and return an error object.
 *  3. Invalid JSON (e.g. HTML error page) — same, return an error object.
 *
 * The returned object always has a `code` field:
 *   - `0`  → success, the real JSON payload is returned as-is
 *   - `500` → server error or parse failure, `message` describes what happened
 *   - the original HTTP status code for non-OK responses
 *
 * This lets callers just check `json.code !== 0` without worrying about
 * try/catch around every single `.json()` call.
 */
export async function safeJson<T = any>(
  res: Response,
  fallbackMessage = "Request failed"
): Promise<T & { code: number; message?: string }> {
  // If the server returned an error status, don't even try to parse
  // the body as JSON — it might be empty, HTML, or text.
  if (!res.ok) {
    // Still try to read the body for a better error message, but
    // don't let a secondary failure crash the caller.
    let msg = fallbackMessage;
    try {
      const text = await res.text();
      if (text) {
        // If it looks like JSON, try to extract a message field
        try {
          const parsed = JSON.parse(text);
          if (parsed.message) msg = parsed.message;
          else if (parsed.code != null) return parsed;
        } catch {
          // Not JSON — use the raw text (truncated) as the message
          msg = text.slice(0, 200);
        }
      }
    } catch {
      // Body read failed — use the fallback message
    }
    return { code: res.status, message: msg } as T & { code: number; message: string };
  }

  // OK status — but the body might still be empty (CDN cache miss,
  // connection drop, dev server timeout, etc.)
  const text = await res.text();
  if (!text || text.trim().length === 0) {
    return {
      code: 500,
      message: `${fallbackMessage} — server returned an empty response`,
    } as T & { code: number; message: string };
  }

  try {
    return JSON.parse(text) as T & { code: number; message?: string };
  } catch (e) {
    return {
      code: 500,
      message: `${fallbackMessage} — invalid JSON: ${(e as Error).message}`,
    } as T & { code: number; message: string };
  }
}
