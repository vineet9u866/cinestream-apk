// Test with 150 cues (2 batches of 100 + 50) to verify multi-batch logic
const BASE = "http://localhost:3000";

async function main() {
  // Generate 150 fake cues
  const cues = [];
  for (let i = 1; i <= 150; i++) {
    const startSec = i * 5;
    const endSec = startSec + 4;
    const sh = String(Math.floor(startSec / 3600)).padStart(2, "0");
    const sm = String(Math.floor((startSec % 3600) / 60)).padStart(2, "0");
    const ss = String(startSec % 60).padStart(2, "0");
    const eh = String(Math.floor(endSec / 3600)).padStart(2, "0");
    const em = String(Math.floor((endSec % 3600) / 60)).padStart(2, "0");
    const es = String(endSec % 60).padStart(2, "0");
    cues.push(`${i}\n${sh}:${sm}:${ss}.000 --> ${eh}:${em}:${es}.000\nThis is subtitle line number ${i}.`);
  }

  const vtt = `WEBVTT\n\n${cues.join("\n\n")}\n`;
  console.log(`Source VTT: ${vtt.length} bytes, 150 cues`);

  const start = Date.now();
  const res = await fetch(`${BASE}/api/translate-subtitle?target=zh&source=en`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vtt }),
    signal: AbortSignal.timeout(120000),
  });
  const time = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`HTTP ${res.status} in ${time}s`);

  const json = await res.json();
  if (json.code !== 0) {
    console.log(`Failed: ${json.message}`);
    return;
  }
  console.log(`Translated: ${json.cueCount} cues in ${json.batches} batches`);
  console.log(`VTT size: ${json.vtt.length} bytes`);
  console.log(`\nFirst 3 cues:`);
  const lines = json.vtt.split("\n");
  console.log(lines.slice(0, 12).join("\n"));
  console.log(`\nLast 3 cues:`);
  console.log(lines.slice(-12).join("\n"));

  const chineseChars = json.vtt.match(/[\u4e00-\u9fff]/g);
  console.log(`\n✓ ${chineseChars?.length || 0} Chinese characters`);
}

main().catch(e => { console.error(e); process.exit(1); });
