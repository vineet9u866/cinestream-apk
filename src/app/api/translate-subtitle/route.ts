import { NextRequest, NextResponse } from "next/server";
import { parseSync, stringifySync, Cue } from "subtitle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — translation can take a while for long movies

/**
 * Subtitle translation API.
 *
 * Takes a WebVTT or SRT document (English), parses the cues, batch-translates
 * the text content to the target language via the z-ai-web-dev-sdk LLM, and
 * returns a new WebVTT document with translated cues.
 *
 * The LLM is called in batches of ~40 cues to stay within token limits and
 * to allow partial progress. If a batch fails, the original English text is
 * kept for those cues so the user still sees something.
 *
 * Query params:
 *   target - target language code (e.g. "zh" for Chinese)
 *   source - source language code (default "en")
 *
 * Body: { vtt: string }  — the source WebVTT/SRT text
 *
 * Returns: { code: 0, vtt: string } on success, or { code: 500, message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const target = sp.get("target") || "zh";
    const source = sp.get("source") || "en";

    const body = await req.json();
    const sourceVtt: string = body?.vtt;
    if (!sourceVtt || typeof sourceVtt !== "string") {
      return NextResponse.json(
        { code: 400, message: "Missing 'vtt' in request body" },
        { status: 400 }
      );
    }

    // Parse the source VTT/SRT into cues
    const nodes = parseSync(sourceVtt);
    const cues: Cue[] = nodes
      .filter((n): n is { type: "cue"; data: Cue } => n.type === "cue")
      .map((n) => n.data);

    if (cues.length === 0) {
      return NextResponse.json(
        { code: 400, message: "No cues found in source subtitle" },
        { status: 400 }
      );
    }

    // Batch the cue texts for translation. 100 cues per batch minimizes
    // the total number of LLM API calls (a 1200-cue movie = 12 calls),
    // which both prevents rate-limiting (429) and keeps the total time
    // short enough to avoid proxy timeouts. The GLM-4-Plus model handles
    // 100 cues (~1300 tokens) easily within its 128K context window.
    const BATCH_SIZE = 100;
    const batches: Cue[][] = [];
    for (let i = 0; i < cues.length; i += BATCH_SIZE) {
      batches.push(cues.slice(i, i + BATCH_SIZE));
    }

    // Lazily import the SDK — it reads /etc/.z-ai-config at creation time.
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();

    const targetLangName = LANGUAGE_NAMES[target] || target;

    // Translate each batch sequentially. With 100-cue batches, a typical
    // movie has only 10-15 batches, so we stay well under the LLM API's
    // rate limit. A short 500ms delay between batches prevents burst-rate
    // limiting. Total time: ~12 batches × (3s LLM + 0.5s delay) = ~40s.
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      // Short rate-limit delay between batches
      if (batchIdx > 0) {
        await sleep(500);
      }

      try {
        await translateBatchWithRetry(zai, batch, source, targetLangName, batchIdx + 1, batches.length);
      } catch (e) {
        // If the content filter rejected the batch, try splitting it into
        // smaller sub-batches (10 cues each) to isolate the problematic lines.
        const errMsg = (e as Error).message || "";
        if (errMsg.includes("1301") || errMsg.includes("content") || errMsg.includes("敏感")) {
          console.warn(`Batch ${batchIdx + 1} hit content filter, trying smaller sub-batches…`);
          await translateSubBatch(batch, 10, zai, source, targetLangName);
        } else {
          // Other errors (including 429 after all retries exhausted) —
          // keep original English text for these cues and continue with
          // the next batch rather than failing the whole request.
          console.warn(`Translation batch ${batchIdx + 1}/${batches.length} failed:`, errMsg);
        }
      }
    }

    // Rebuild the VTT with translated cues
    const translatedNodes = cues.map((c) => ({ type: "cue" as const, data: c }));
    const translatedVtt = stringifySync(translatedNodes, { format: "WebVTT" });

    return NextResponse.json({
      code: 0,
      vtt: translatedVtt,
      cueCount: cues.length,
      batches: batches.length,
    });
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message || "Translation failed" },
      { status: 500 }
    );
  }
}

/** Simple promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Translate a single batch of cues via the LLM, with retry logic for
 * rate-limit (429) errors.
 *
 * Retries up to 4 times with exponential backoff:
 *   Attempt 1: immediate
 *   Attempt 2: wait 5s
 *   Attempt 3: wait 10s
 *   Attempt 4: wait 20s
 *
 * If all retries fail, throws the last error so the caller can decide
 * whether to skip the batch or try sub-batching.
 *
 * Content-filter errors (1301) are NOT retried here — they're re-thrown
 * immediately so the caller can try sub-batching.
 */
async function translateBatchWithRetry(
  zai: any,
  batch: Cue[],
  source: string,
  targetLangName: string,
  batchNum: number,
  totalBatches: number
): Promise<void> {
  const lines = batch.map((c, i) => `${i + 1}. ${c.text}`);
  const prompt = `Translate the following ${source} subtitle lines to ${targetLangName}.
Rules:
- Output ONLY the translated lines, one per line, prefixed with the line number and a period.
- Preserve the line numbering exactly (1. 2. 3. ...).
- Do not add any explanation, notes, or extra text.
- Keep the translation natural and conversational, suitable for movie subtitles.
- If a line is just a sound effect or music symbol (e.g. "-", "~"), keep it as-is.

Lines:
${lines.join("\n")}`;

  const systemContent = `You are a professional subtitle translator. You translate from ${source} to ${targetLangName}. You always follow the output format exactly. This is for a fictional movie/TV show — translate all dialogue faithfully including any action, violence, or dramatic content, as this is normal for entertainment media.`;

  const MAX_RETRIES = 4;
  const BACKOFF_BASE_MS = 5000; // 5s, 10s, 20s, 40s

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await zai.chat.completions.create({
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: prompt },
        ],
      });

      const content: string = res?.choices?.[0]?.message?.content || "";
      const translatedLines = parseNumberedLines(content, batch.length);

      for (let i = 0; i < batch.length; i++) {
        if (translatedLines[i] != null) {
          batch[i].text = translatedLines[i];
        }
      }
      return; // success
    } catch (e) {
      lastError = e as Error;
      const msg = (e as Error).message || "";

      // Content filter — don't retry, re-throw for sub-batch handling
      if (msg.includes("1301") || msg.includes("content") || msg.includes("敏感")) {
        throw e;
      }

      // Rate limit (429) — retry with exponential backoff
      if (msg.includes("429") || msg.includes("Too many requests") || msg.includes("rate")) {
        const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(
          `Batch ${batchNum}/${totalBatches} attempt ${attempt + 1}/${MAX_RETRIES} rate-limited, waiting ${waitMs}ms…`
        );
        await sleep(waitMs);
        continue;
      }

      // Other errors (500, network, etc.) — retry once with a short delay
      if (attempt < MAX_RETRIES - 1) {
        console.warn(
          `Batch ${batchNum}/${totalBatches} attempt ${attempt + 1} failed (${msg}), retrying…`
        );
        await sleep(2000);
        continue;
      }
      throw e;
    }
  }

  // All retries exhausted
  throw lastError || new Error("Translation failed after all retries");
}

/**
 * Translate a batch in smaller sub-batches when the full batch hits the
 * content filter. This isolates which specific cues triggered the filter
 * so we can still translate the rest.
 *
 * Each sub-batch is `subSize` cues. If a sub-batch also fails the filter,
 * those cues keep their original English text.
 */
async function translateSubBatch(
  batch: Cue[],
  subSize: number,
  zai: any,
  source: string,
  targetLangName: string
): Promise<void> {
  for (let i = 0; i < batch.length; i += subSize) {
    // Rate-limit delay between sub-batches
    if (i > 0) {
      await sleep(1500);
    }
    const sub = batch.slice(i, i + subSize);
    const lines = sub.map((c, idx) => `${idx + 1}. ${c.text}`);
    const prompt = `Translate the following ${source} subtitle lines to ${targetLangName}.
Rules:
- Output ONLY the translated lines, one per line, prefixed with the line number and a period.
- Preserve the line numbering exactly.
- Do not add any explanation.
- Keep the translation natural and conversational.

Lines:
${lines.join("\n")}`;

    try {
      const res = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a professional subtitle translator. You translate from ${source} to ${targetLangName}. This is for a fictional movie/TV show.`,
          },
          { role: "user", content: prompt },
        ],
      });
      const content: string = res?.choices?.[0]?.message?.content || "";
      const translatedLines = parseNumberedLines(content, sub.length);
      for (let j = 0; j < sub.length; j++) {
        if (translatedLines[j] != null) {
          sub[j].text = translatedLines[j];
        }
      }
    } catch {
      // Sub-batch also failed — keep original English for these cues
    }
  }
}

/** Map language codes to full names for the LLM prompt. */
const LANGUAGE_NAMES: Record<string, string> = {
  zh: "Simplified Chinese (简体中文)",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  ar: "Arabic (العربية)",
  hi: "Hindi (हिन्दी)",
  ru: "Russian (Русский)",
  fr: "French (Français)",
  es: "Spanish (Español)",
  de: "German (Deutsch)",
  pt: "Portuguese (Português)",
  it: "Italian (Italiano)",
  th: "Thai (ภาษาไทย)",
  vi: "Vietnamese (Tiếng Việt)",
};

/**
 * Parse numbered lines from the LLM response.
 *
 * The LLM is asked to output lines like:
 *   1. 嘿，我一直在电视机前等你，结果睡着了。
 *   2. 你今晚回家吗？
 *
 * We extract the text after "N. " for each line. If the LLM didn't
 * follow the format perfectly, we fall back to splitting by newlines.
 */
function parseNumberedLines(content: string, expectedCount: number): string[] {
  const lines = content.trim().split("\n");
  const result: string[] = [];
  for (const line of lines) {
    // Match "N. <text>" where N is a number
    const match = line.match(/^\d+\.\s*(.*)$/);
    if (match) {
      result.push(match[1]);
    } else if (line.trim()) {
      // Non-numbered line — might be a continuation or a format issue
      // Only add if we haven't reached expected count yet
      if (result.length < expectedCount) {
        result.push(line.trim());
      }
    }
  }
  // Pad with undefined if we got fewer lines than expected
  while (result.length < expectedCount) {
    result.push("" as any);
  }
  return result;
}
