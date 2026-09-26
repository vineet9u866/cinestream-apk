// Shorter test: translate just the first few cues of a subtitle to verify
// the flow works, without waiting for a full movie translation.

const BASE = "http://localhost:3000";

async function main() {
  // A small VTT with just 5 cues
  const smallVtt = `WEBVTT

1
00:00:57.234 --> 00:01:00.637
Hey, I fell asleep in front of the TV waiting for you.

2
00:01:08.579 --> 00:01:11.215
Are you coming home tonight?

3
00:01:15.819 --> 00:01:17.221
Or should I just go to bed alone?

4
00:01:20.957 --> 00:01:22.593
Do you remember the noodle stand downtown?

5
00:01:23.660 --> 00:01:25.229
That little street kid heard us arguing.
`;

  console.log("=== Translating 5 cues to Chinese ===");
  const start = Date.now();
  const res = await fetch(
    `${BASE}/api/translate-subtitle?target=zh&source=en`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vtt: smallVtt }),
    }
  );
  const time = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`HTTP ${res.status} in ${time}s`);

  const json = await res.json();
  if (json.code !== 0) {
    console.log(`Failed: ${json.message}`);
    return;
  }

  console.log(`\nTranslated VTT (${json.vtt.length} bytes, ${json.cueCount} cues, ${json.batches} batch):`);
  console.log(json.vtt);

  // Check for Chinese characters
  const chineseChars = json.vtt.match(/[\u4e00-\u9fff]/g);
  if (chineseChars && chineseChars.length > 5) {
    console.log(`\n✓ SUCCESS — ${chineseChars.length} Chinese characters in output`);
  } else {
    console.log(`\n✗ FAILED — no Chinese characters`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
