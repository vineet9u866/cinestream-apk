// Probe for subtitle endpoints in the MovieBox API
import { getHome, getDetail, primeGuestToken, getPlayInfo } from "../src/lib/moviebox";

const API_BASE = "https://h5-api.aoneroom.com";
const ORIGIN = "https://moviebox.ph";

const COMMON_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
  Accept: "application/json",
  "X-Request-Lang": "en",
  "X-Client-Info": JSON.stringify({ timezone: "Asia/Hong_Kong" }),
  "X-Source": "",
};

async function main() {
  await primeGuestToken();
  
  const home = await getHome();
  // Find a movie that's actually playable
  let subject: any = null;
  for (const op of home.data.operatingList) {
    for (const s of op.subjects || []) {
      if (s.subjectType === 1) {  // movie
        subject = s;
        break;
      }
    }
    if (subject) break;
  }
  if (!subject) {
    console.log("No movie found");
    return;
  }
  console.log("Trying movie:", subject.title, "id:", subject.subjectId);
  
  const detail = await getDetail(subject.subjectId);
  console.log("Subtitles:", detail.data.subject.subtitles);
  
  const play = await getPlayInfo(subject.subjectId, subject.detailPath || "", 0, 0);
  console.log("Play data keys:", Object.keys(play.data || {}));
  console.log("Play data full:", JSON.stringify(play.data, null, 2).slice(0, 5000));
  
  // Now look for subtitle endpoints
  console.log("\n=== Probing subtitle endpoints ===");
  
  const endpoints = [
    `/wefeed-h5api-bff/subject/subtitle?subjectId=${subject.subjectId}`,
    `/wefeed-h5api-bff/subject/subtitles?subjectId=${subject.subjectId}`,
    `/wefeed-h5api-bff/subtitle?subjectId=${subject.subjectId}`,
    `/wefeed-h5api-bff/subject/caption?subjectId=${subject.subjectId}`,
    `/wefeed-h5api-bff/subject/sub?subjectId=${subject.subjectId}`,
    `/wefeed-h5api-bff/caption/list?subjectId=${subject.subjectId}`,
    `/wefeed-h5api-bff/subject/play-sub?subjectId=${subject.subjectId}&detailPath=${subject.detailPath}`,
  ];
  
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${API_BASE}${ep}`, {
        headers: {
          ...COMMON_HEADERS,
          Referer: `${ORIGIN}/play/${subject.detailPath}`,
        },
      });
      const text = await res.text();
      console.log(`\n[ ${ep} ] → ${res.status} ${res.statusText}`);
      console.log(text.slice(0, 800));
    } catch (e) {
      console.log(`\n[ ${ep} ] → ERROR: ${(e as Error).message}`);
    }
  }
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
