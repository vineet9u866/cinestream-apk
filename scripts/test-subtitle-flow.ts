// End-to-end test of the new caption + subtitle flow
// 1) Get a playable movie from the home feed
// 2) Hit our /api/caption endpoint to get the caption list
// 3) Hit our /api/subtitle endpoint with one of the SRT URLs to verify
//    the SRT->VTT conversion works

const BASE = "http://localhost:3000";

async function main() {
  // 1) Get a playable movie
  console.log("=== Fetching home feed ===");
  const homeRes = await fetch(`${BASE}/api/home`);
  const home = await homeRes.json();
  
  let movie: any = null;
  for (const op of home.data.operatingList || []) {
    for (const s of op.subjects || []) {
      if (s.subjectType === 1) {  // movie
        movie = s;
        break;
      }
    }
    if (movie) break;
  }
  if (!movie) {
    console.log("No movie found in home feed");
    return;
  }
  console.log("Picked movie:", movie.title, "id:", movie.subjectId);
  
  // 2) Get detail + play info
  const detailRes = await fetch(`${BASE}/api/detail?subjectId=${movie.subjectId}`);
  const detail = await detailRes.json();
  console.log("Subtitles field:", detail.data.subject.subtitles?.slice(0, 100));
  
  const playRes = await fetch(
    `${BASE}/api/play?subjectId=${movie.subjectId}&detailPath=${encodeURIComponent(movie.detailPath)}&se=0&ep=0`
  );
  const play = await playRes.json();
  const streams = [...(play.data.streams || []), ...(play.data.hls || [])].filter((s: any) => s.url && !s.vipLocked);
  if (streams.length === 0) {
    console.log("No playable streams for this movie, trying another...");
    return;
  }
  const stream = streams[0];
  console.log("Stream:", stream.id, "res:", stream.resolutions);
  
  // 3) Hit /api/caption
  console.log("\n=== Testing /api/caption ===");
  const capRes = await fetch(
    `${BASE}/api/caption?streamId=${stream.id}&subjectId=${movie.subjectId}&detailPath=${encodeURIComponent(movie.detailPath)}`
  );
  console.log("Status:", capRes.status);
  const capJson = await capRes.json();
  console.log("Caption count:", capJson.data?.captions?.length || 0);
  if (capJson.data?.captions?.length > 0) {
    console.log("First 3 captions:");
    for (const c of capJson.data.captions.slice(0, 3)) {
      console.log(`  - ${c.lan} (${c.lanName}) | size=${c.size} | url=${c.url.slice(0, 80)}...`);
    }
    
    // 4) Hit /api/subtitle with the first SRT
    console.log("\n=== Testing /api/subtitle (SRT -> VTT) ===");
    const subRes = await fetch(`${BASE}/api/subtitle?url=${encodeURIComponent(capJson.data.captions[0].url)}`);
    console.log("Status:", subRes.status);
    console.log("Content-Type:", subRes.headers.get("content-type"));
    const vttText = await subRes.text();
    console.log("VTT size:", vttText.length, "bytes");
    console.log("First 400 chars of VTT output:");
    console.log(vttText.slice(0, 400));
    console.log("---");
    
    // Verify it's valid VTT
    if (vttText.startsWith("WEBVTT")) {
      console.log("✓ VTT header present");
    } else {
      console.log("✗ VTT header MISSING — got:", vttText.slice(0, 50));
    }
    // Count cues
    const cueCount = (vttText.match(/^\d{2}:\d{2}/gm) || []).length;
    console.log("Approx cue count:", cueCount);
  } else {
    console.log("No captions for this stream, can't test subtitle endpoint");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
