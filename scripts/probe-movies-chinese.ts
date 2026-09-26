// Probe with proper season/episode for series, and verify Chinese subtitle availability
import { getHome, getDetail, primeGuestToken, getPlayInfo, getCaptions, filterSubjects } from "../src/lib/moviebox";

async function main() {
  await primeGuestToken();
  
  // Get some movies (type=1) which don't need se/ep
  const filterRes = await filterSubjects({ subjectType: 1, perPage: 8, sort: "hot" });
  const movies = filterRes.data.items;
  console.log(`=== Got ${movies.length} movies ===\n`);
  
  for (const m of movies.slice(0, 6)) {
    console.log(`\n----------------------------------------`);
    console.log(`Movie: ${m.title} (id=${m.subjectId})`);
    
    try {
      const detail = await getDetail(m.subjectId);
      const subs = detail.data.subject.subtitles || "";
      const dubs = detail.data.subject.dubs || [];
      const chineseDubs = dubs.filter((d: any) => d.lanCode === "zh" || d.lanName.includes("中") || d.lanName.toLowerCase().includes("chin"));
      const hasChineseSub = subs.includes("中文");
      
      console.log(`  Subtitles field: ${subs.slice(0, 150)}`);
      console.log(`  Has 中文 in subtitles? ${hasChineseSub ? "YES" : "no"}`);
      console.log(`  Has Chinese dub? ${chineseDubs.length > 0 ? "YES" : "no"}`);
      console.log(`  All dub langs: ${dubs.map((d: any) => `${d.lanCode}(${d.lanName})`).join(", ")}`);
      
      const play = await getPlayInfo(m.subjectId, m.detailPath || "", 0, 0);
      const allStreams = [...(play.data.streams || []), ...(play.data.hls || []), ...(play.data.dash || [])];
      console.log(`  Streams:`);
      for (const s of allStreams) {
        console.log(`    ${s.format} ${s.resolutions}P | vip=${s.vipLocked} | url=${s.url ? "yes" : "no"} | id=${s.id}`);
      }
      
      const playable = allStreams.find((s: any) => s.url && !s.vipLocked);
      if (playable) {
        const caps = await getCaptions(playable.id, m.subjectId, m.detailPath || "");
        const allCaps = caps.data?.captions || [];
        const zhCaps = allCaps.filter((c: any) => c.lan === "zh" || c.lanName.includes("中"));
        console.log(`  Total captions: ${allCaps.length}`);
        console.log(`  Chinese captions? ${zhCaps.length > 0 ? "YES" : "no"}`);
        if (zhCaps.length > 0) {
          console.log(`  ZH caption: lan=${zhCaps[0].lan} name=${zhCaps[0].lanName} url=${zhCaps[0].url.slice(0, 80)}...`);
        }
        console.log(`  All caption langs: ${allCaps.map((c: any) => c.lan).join(", ")}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${(e as Error).message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  // Also try a series with se=1, ep=1
  console.log(`\n\n=== Now probing a series with se=1 ep=1 ===`);
  const home = await getHome();
  const series = home.data.operatingList.flatMap((o: any) => o.subjects || []).find((s: any) => s.subjectType === 2);
  if (series) {
    console.log(`Series: ${series.title} (id=${series.subjectId})`);
    try {
      const detail = await getDetail(series.subjectId);
      const seasons = detail.data.resource.seasons || [];
      console.log(`  Seasons: ${seasons.map((s: any) => `S${s.se}(${s.maxEp}ep)`).join(", ")}`);
      
      const play = await getPlayInfo(series.subjectId, series.detailPath || "", 1, 1);
      const allStreams = [...(play.data.streams || []), ...(play.data.hls || []), ...(play.data.dash || [])];
      console.log(`  Streams for S1E1:`);
      for (const s of allStreams) {
        console.log(`    ${s.format} ${s.resolutions}P | vip=${s.vipLocked} | url=${s.url ? "yes" : "no"} | id=${s.id}`);
      }
      
      const playable = allStreams.find((s: any) => s.url && !s.vipLocked);
      if (playable) {
        const caps = await getCaptions(playable.id, series.subjectId, series.detailPath || "");
        const allCaps = caps.data?.captions || [];
        const zhCaps = allCaps.filter((c: any) => c.lan === "zh" || c.lanName.includes("中"));
        console.log(`  Total captions: ${allCaps.length}`);
        console.log(`  Chinese captions? ${zhCaps.length > 0 ? "YES" : "no"}`);
        if (zhCaps.length > 0) {
          console.log(`  ZH caption: lan=${zhCaps[0].lan} name=${zhCaps[0].lanName}`);
        }
        console.log(`  All caption langs: ${allCaps.map((c: any) => c.lan).join(", ")}`);
      }
    } catch (e) {
      console.log(`  ERROR: ${(e as Error).message}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
