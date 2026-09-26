// End-to-end test:
// 1) Find a title with Chinese dub (Jackie Chan movie)
// 2) Verify it shows in the dubs list via /api/detail
// 3) Find a title with Chinese subtitles (Avatar)
// 4) Verify the caption endpoint returns zh captions
// 5) Verify quality options include 720P and 1080P (with 1080P VIP-locked)

const BASE = "http://localhost:3000";

async function main() {
  // Test 1: Chinese dub — use "Police Story" (Jackie Chan)
  console.log("=== Test 1: Chinese dub (Police Story) ===");
  const policeStoryId = "74461345500006904";
  const detailRes = await fetch(`${BASE}/api/detail?subjectId=${policeStoryId}`);
  const detail = await detailRes.json();
  const dubs = detail.data.subject.dubs || [];
  const audioDubs = dubs.filter((d: any) => d.type === 0);
  const chineseDub = audioDubs.find((d: any) => d.lanCode === "zh");
  console.log(`  Total audio dubs: ${audioDubs.length}`);
  console.log(`  Chinese dub found? ${chineseDub ? "YES ✓" : "NO ✗"}`);
  if (chineseDub) {
    console.log(`  Chinese dub: lanCode=${chineseDub.lanCode} lanName=${chineseDub.lanName} subjectId=${chineseDub.subjectId}`);
  }
  console.log(`  All dub langs: ${audioDubs.map((d: any) => d.lanCode).join(", ")}`);
  
  // Test 2: Chinese subtitles + quality — use Avatar S1E1
  console.log("\n=== Test 2: Chinese subtitles + quality (Avatar S1E1) ===");
  const avatarId = "7850278583678682192";
  const avatarPath = "avatar-the-last-airbender-YoJu6LgmUl9";
  const playRes = await fetch(`${BASE}/api/play?subjectId=${avatarId}&detailPath=${encodeURIComponent(avatarPath)}&se=1&ep=1`);
  const play = await playRes.json();
  const allStreams = [...(play.data.streams || []), ...(play.data.hls || [])];
  console.log(`  All streams (${allStreams.length}):`);
  for (const s of allStreams) {
    console.log(`    ${s.resolutions}P | vipLocked=${s.vipLocked} | url=${s.url ? "yes" : "no"}`);
  }
  const has720 = allStreams.some((s: any) => s.resolutions === "720");
  const has1080 = allStreams.some((s: any) => s.resolutions === "1080");
  console.log(`  Has 720P? ${has720 ? "YES ✓" : "no"}`);
  console.log(`  Has 1080P? ${has1080 ? "YES ✓" : "no"}`);
  
  // Get captions for the first playable stream
  const playable = allStreams.find((s: any) => s.url && !s.vipLocked);
  if (playable) {
    const capRes = await fetch(`${BASE}/api/caption?streamId=${playable.id}&subjectId=${avatarId}&detailPath=${encodeURIComponent(avatarPath)}`);
    const capJson = await capRes.json();
    const allCaps = capJson.data?.captions || [];
    const zhCap = allCaps.find((c: any) => c.lan === "zh");
    console.log(`\n  Captions (${allCaps.length} total):`);
    console.log(`  All langs: ${allCaps.map((c: any) => c.lan).join(", ")}`);
    console.log(`  Chinese (zh) caption found? ${zhCap ? "YES ✓" : "NO ✗"}`);
    if (zhCap) {
      console.log(`  ZH caption: lan=${zhCap.lan} lanName=${zhCap.lanName} url=${zhCap.url.slice(0, 80)}...`);
      
      // Verify the subtitle proxy works for Chinese
      const subRes = await fetch(`${BASE}/api/subtitle?url=${encodeURIComponent(zhCap.url)}`);
      const vtt = await subRes.text();
      console.log(`  ZH subtitle VTT: ${vtt.length} bytes, starts with WEBVTT? ${vtt.startsWith("WEBVTT") ? "✓" : "✗"}`);
      console.log(`  First 300 chars of ZH VTT:`);
      console.log(`  ${vtt.slice(0, 300)}`);
    }
  }
  
  // Test 3: Verify the home page still loads
  console.log("\n=== Test 3: Home page ===");
  const homeRes = await fetch(`${BASE}/`);
  console.log(`  Home page: HTTP ${homeRes.status} ${homeRes.status === 200 ? "✓" : "✗"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
