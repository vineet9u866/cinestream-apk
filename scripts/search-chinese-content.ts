// Search for Chinese content to find titles with Chinese dubs
import { searchSubjects, getDetail, primeGuestToken, getPlayInfo, getCaptions } from "../src/lib/moviebox";

async function main() {
  await primeGuestToken();
  
  const queries = ["Chinese", "中文", "Cantonese", "Mandarin", "Jackie Chan", "Bruce Lee", "wuxia", "Chinese drama"];
  
  for (const q of queries) {
    console.log(`\n=== Search: "${q}" ===`);
    try {
      const res = await searchSubjects(q, 1, 6, 0);
      console.log(`  Found ${res.data.items.length} results`);
      for (const item of res.data.items.slice(0, 3)) {
        console.log(`\n  Title: ${item.title} (id=${item.subjectId}, type=${item.subjectType})`);
        const detail = await getDetail(item.subjectId);
        const dubs = detail.data.subject.dubs || [];
        const chineseDubs = dubs.filter((d: any) => d.lanCode === "zh" || d.lanName.includes("中") || d.lanName.toLowerCase().includes("chin"));
        console.log(`    Dubs: ${dubs.length} total, Chinese: ${chineseDubs.length}`);
        if (chineseDubs.length > 0) {
          console.log(`    ★ FOUND CHINESE DUB: ${JSON.stringify(chineseDubs, null, 2)}`);
        }
        console.log(`    Subtitles: ${(detail.data.subject.subtitles || "").slice(0, 100)}`);
        console.log(`    All dub langs: ${dubs.map((d: any) => d.lanCode).join(", ")}`);
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.log(`  ERROR: ${(e as Error).message}`);
    }
  }
  
  // Also try filtering by country=China
  console.log(`\n=== Filter by country=China ===`);
  try {
    const { filterSubjects } = await import("../src/lib/moviebox");
    const res = await filterSubjects({ country: "China", perPage: 6, subjectType: 0 });
    console.log(`  Found ${res.data.items.length} results`);
    for (const item of res.data.items.slice(0, 3)) {
      console.log(`\n  Title: ${item.title} (id=${item.subjectId}, type=${item.subjectType})`);
      const detail = await getDetail(item.subjectId);
      const dubs = detail.data.subject.dubs || [];
      const chineseDubs = dubs.filter((d: any) => d.lanCode === "zh" || d.lanName.includes("中"));
      console.log(`    Dubs: ${dubs.length} total, Chinese: ${chineseDubs.length}`);
      if (chineseDubs.length > 0) {
        console.log(`    ★ FOUND CHINESE DUB: ${JSON.stringify(chineseDubs, null, 2)}`);
      }
      console.log(`    All dub langs: ${dubs.map((d: any) => d.lanCode).join(", ")}`);
      console.log(`    Subtitles: ${(detail.data.subject.subtitles || "").slice(0, 100)}`);
      
      // Get play info + captions
      const se = item.subjectType === 2 ? 1 : 0;
      const ep = item.subjectType === 2 ? 1 : 0;
      const play = await getPlayInfo(item.subjectId, item.detailPath || "", se, ep);
      const allStreams = [...(play.data.streams || []), ...(play.data.hls || [])];
      const playable = allStreams.find((s: any) => s.url && !s.vipLocked);
      if (playable) {
        const caps = await getCaptions(playable.id, item.subjectId, item.detailPath || "");
        const allCaps = caps.data?.captions || [];
        const zhCaps = allCaps.filter((c: any) => c.lan === "zh" || c.lanName.includes("中"));
        console.log(`    Streams: ${allStreams.map((s: any) => `${s.resolutions}P(vip=${s.vipLocked})`).join(", ")}`);
        console.log(`    Captions: ${allCaps.length} total, Chinese: ${zhCaps.length}`);
        if (zhCaps.length > 0) {
          console.log(`    ★ ZH caption: lan=${zhCaps[0].lan} name=${zhCaps[0].lanName}`);
        }
        console.log(`    All caption langs: ${allCaps.map((c: any) => c.lan).join(", ")}`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
