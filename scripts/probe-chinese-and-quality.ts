// Probe multiple titles to check:
// 1) What qualities are available (including VIP-locked)
// 2) Whether Chinese dubs exist
// 3) Whether Chinese subtitles exist via the caption endpoint
//
// This will tell us what we can actually offer to the user.

import { getHome, getDetail, primeGuestToken, getPlayInfo, getCaptions } from "../src/lib/moviebox";

async function main() {
  await primeGuestToken();
  
  const home = await getHome();
  
  // Collect a diverse set of titles: movies and series
  const titles: any[] = [];
  for (const op of home.data.operatingList || []) {
    for (const s of op.subjects || []) {
      if (titles.length < 12) titles.push(s);
    }
  }
  
  console.log(`=== Probing ${titles.length} titles ===\n`);
  
  for (const t of titles) {
    console.log(`\n----------------------------------------`);
    console.log(`Title: ${t.title} (id=${t.subjectId}, type=${t.subjectType})`);
    console.log(`detailPath: ${t.detailPath}`);
    
    try {
      const detail = await getDetail(t.subjectId);
      const subs = detail.data.subject.subtitles || "";
      const dubs = detail.data.subject.dubs || [];
      const chineseDubs = dubs.filter((d: any) => d.lanCode === "zh" || d.lanName.toLowerCase().includes("chin") || d.lanName.includes("中"));
      const hasChineseSubInField = subs.includes("中文") || subs.toLowerCase().includes("chin");
      
      console.log(`  Subtitles field: ${subs.slice(0, 120)}`);
      console.log(`  Has Chinese dub? ${chineseDubs.length > 0 ? "YES" : "no"}`);
      if (chineseDubs.length > 0) {
        console.log(`  Chinese dubs: ${JSON.stringify(chineseDubs, null, 2)}`);
      }
      console.log(`  Has 中文 in subtitles field? ${hasChineseSubInField ? "YES" : "no"}`);
      console.log(`  Total dubs: ${dubs.length}`);
      
      // Get play info
      const play = await getPlayInfo(t.subjectId, t.detailPath || "", 0, 0);
      const allStreams = [...(play.data.streams || []), ...(play.data.hls || []), ...(play.data.dash || [])];
      console.log(`  Streams (all):`);
      for (const s of allStreams) {
        console.log(`    ${s.format} ${s.resolutions}P | vipLocked=${s.vipLocked} | url=${s.url ? "YES" : "empty"} | id=${s.id}`);
      }
      
      // Get captions for the first playable stream
      const playableStream = allStreams.find((s: any) => s.url && !s.vipLocked);
      if (playableStream) {
        const caps = await getCaptions(playableStream.id, t.subjectId, t.detailPath || "");
        const chineseCaps = (caps.data?.captions || []).filter((c: any) => c.lan === "zh" || c.lanName.includes("中") || c.lanName.toLowerCase().includes("chin"));
        console.log(`  Caption count: ${caps.data?.captions?.length || 0}`);
        console.log(`  Chinese captions? ${chineseCaps.length > 0 ? "YES" : "no"}`);
        if (chineseCaps.length > 0) {
          console.log(`  Chinese caption: ${JSON.stringify(chineseCaps[0], null, 2)}`);
        }
        // List all caption languages
        if (caps.data?.captions) {
          console.log(`  All caption langs: ${caps.data.captions.map((c: any) => c.lan).join(", ")}`);
        }
      } else {
        console.log(`  No playable stream — skipping caption probe`);
      }
    } catch (e) {
      console.log(`  ERROR: ${(e as Error).message}`);
    }
    
    // Be polite to the API
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
