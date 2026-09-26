// End-to-end test:
// 1. Find a title WITHOUT native Chinese subtitles (The Furious)
// 2. Fetch its English SRT via /api/subtitle
// 3. POST it to /api/translate-subtitle?target=zh
// 4. Verify the response is valid VTT with Chinese text

const BASE = "http://localhost:3000";

async function main() {
  // The Furious — has English subtitle but no Chinese
  const subjectId = "4394044471852286152";
  const detailPath = "the-furious-6lxRH1LLAe5";
  const streamId = "7997702876015509816";

  console.log("=== Step 1: Get captions ===");
  const capRes = await fetch(
    `${BASE}/api/caption?streamId=${streamId}&subjectId=${subjectId}&detailPath=${detailPath}`
  );
  const capJson = await capRes.json();
  console.log(`Caption count: ${capJson.data?.captions?.length || 0}`);
  console.log(`All langs: ${(capJson.data?.captions || []).map((c: any) => c.lan).join(", ")}`);

  const enCap = (capJson.data?.captions || []).find((c: any) => c.lan === "en");
  if (!enCap) {
    console.log("No English caption — can't test translation");
    return;
  }
  console.log(`\nEnglish caption URL: ${enCap.url.slice(0, 80)}...`);

  console.log("\n=== Step 2: Fetch English SRT -> VTT ===");
  const subRes = await fetch(`${BASE}/api/subtitle?url=${encodeURIComponent(enCap.url)}`);
  const sourceVtt = await subRes.text();
  console.log(`Source VTT size: ${sourceVtt.length} bytes`);
  console.log(`First 200 chars: ${sourceVtt.slice(0, 200)}`);

  console.log("\n=== Step 3: Translate to Chinese via LLM ===");
  console.log("(This may take 1-3 minutes for a full movie...)");
  const translateStart = Date.now();

  const translateRes = await fetch(
    `${BASE}/api/translate-subtitle?target=zh&source=en`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vtt: sourceVtt }),
      signal: AbortSignal.timeout(300000), // 5 min timeout
    }
  );

  const translateTime = ((Date.now() - translateStart) / 1000).toFixed(1);
  console.log(`Translation HTTP ${translateRes.status} in ${translateTime}s`);

  const translated = await translateRes.json();
  if (translated.code !== 0) {
    console.log(`Translation failed: ${translated.message}`);
    return;
  }

  console.log(`\nTranslated VTT size: ${translated.vtt.length} bytes`);
  console.log(`Cue count: ${translated.cueCount}`);
  console.log(`Batches: ${translated.batches}`);
  console.log(`\nFirst 800 chars of translated VTT:`);
  console.log(translated.vtt.slice(0, 800));
  console.log("\n... (truncated)");

  // Verify it's valid VTT with Chinese characters
  if (translated.vtt.startsWith("WEBVTT")) {
    console.log("\n✓ Valid WEBVTT header");
  } else {
    console.log("\n✗ Missing WEBVTT header");
  }

  // Check for Chinese characters (Unicode range U+4E00-U+9FFF)
  const chineseChars = translated.vtt.match(/[\u4e00-\u9fff]/g);
  if (chineseChars && chineseChars.length > 10) {
    console.log(`✓ Contains ${chineseChars.length} Chinese characters`);
  } else {
    console.log(`✗ No Chinese characters found (or too few)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
