// Reproduce the "Unexpected end of JSON input" error.
// Simulate the exact play flow the browser does and check each response
// for empty bodies or invalid JSON.

const BASE = "http://localhost:3000";

async function checkJson(name: string, res: Response): Promise<any> {
  const status = res.status;
  const text = await res.text();
  console.log(`  [${name}] HTTP ${status} | body=${text.length} bytes`);
  if (text.length === 0) {
    console.log(`  [${name}] ✗ EMPTY BODY — this is the cause of "Unexpected end of JSON input"`);
    return null;
  }
  try {
    const json = JSON.parse(text);
    console.log(`  [${name}] ✓ valid JSON | code=${json.code} | message=${json.message || "(none)"}`);
    return json;
  } catch (e) {
    console.log(`  [${name}] ✗ JSON parse failed: ${(e as Error).message}`);
    console.log(`  [${name}] body preview: ${text.slice(0, 300)}`);
    return null;
  }
}

async function main() {
  // 1) Home feed
  console.log("=== 1) /api/home ===");
  const homeRes = await fetch(`${BASE}/api/home`, { signal: AbortSignal.timeout(30000) });
  const home = await checkJson("home", homeRes);
  if (!home || home.code !== 0) return;

  // Pick several titles (movies AND series) to test
  const titles: { id: string; path: string; type: number }[] = [];
  for (const op of home.data.operatingList || []) {
    for (const s of op.subjects || []) {
      if (titles.length < 8) titles.push({ id: s.subjectId, path: s.detailPath, type: s.subjectType });
    }
  }

  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    console.log(`\n=== Title ${i+1}: id=${t.id} type=${t.type} path=${t.path} ===`);

    // 2) Detail
    console.log("--- /api/detail ---");
    const detailRes = await fetch(`${BASE}/api/detail?subjectId=${t.id}`, { signal: AbortSignal.timeout(30000) });
    const detail = await checkJson("detail", detailRes);
    if (!detail) continue;

    // 3) Play — for series use se=1 ep=1, for movies use se=0 ep=0
    const se = t.type === 2 ? 1 : 0;
    const ep = t.type === 2 ? 1 : 0;
    console.log(`--- /api/play (se=${se} ep=${ep}) ---`);
    const playRes = await fetch(
      `${BASE}/api/play?subjectId=${t.id}&detailPath=${encodeURIComponent(t.path)}&se=${se}&ep=${ep}`,
      { signal: AbortSignal.timeout(60000) }
    );
    const play = await checkJson("play", playRes);
    if (!play) continue;

    const allStreams = [...(play.data?.streams || []), ...(play.data?.hls || [])];
    const playable = allStreams.find((s: any) => s.url && !s.vipLocked);
    if (!playable) {
      console.log("  No playable stream — skipping caption + stream tests");
      continue;
    }

    // 4) Caption
    console.log("--- /api/caption ---");
    const capRes = await fetch(
      `${BASE}/api/caption?streamId=${playable.id}&subjectId=${t.id}&detailPath=${encodeURIComponent(t.path)}`,
      { signal: AbortSignal.timeout(30000) }
    );
    const cap = await checkJson("caption", capRes);
    if (!cap) continue;

    // 5) Stream (just headers, don't download the whole video)
    console.log("--- /api/stream (HEAD-like, Range: bytes=0-1) ---");
    try {
      const streamRes = await fetch(
        `${BASE}/api/stream?url=${encodeURIComponent(playable.url)}`,
        {
          headers: { Range: "bytes=0-1" },
          signal: AbortSignal.timeout(30000),
        }
      );
      console.log(`  [stream] HTTP ${streamRes.status} | content-length=${streamRes.headers.get("content-length")} | content-type=${streamRes.headers.get("content-type")}`);
      // Read 2 bytes then cancel
      const reader = streamRes.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        console.log(`  [stream] first chunk: ${value?.length || 0} bytes`);
        await reader.cancel();
      }
    } catch (e) {
      console.log(`  [stream] ✗ ${(e as Error).message}`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
