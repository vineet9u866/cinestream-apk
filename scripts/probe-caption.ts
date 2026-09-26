// Probe the caption endpoint with various id values
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
  let subject: any = null;
  for (const op of home.data.operatingList) {
    for (const s of op.subjects || []) {
      if (s.subjectType === 1) { subject = s; break; }
    }
    if (subject) break;
  }
  console.log("Movie:", subject.title, "id:", subject.subjectId);
  
  const detail = await getDetail(subject.subjectId);
  const play = await getPlayInfo(subject.subjectId, subject.detailPath || "", 0, 0);
  const stream = (play.data.streams || [])[0];
  console.log("Stream id:", stream?.id);
  
  // Try various id parameters
  const ids = [
    subject.subjectId,
    stream?.id,
    detail.data.subject.detailPath,
  ];
  
  for (const id of ids) {
    if (!id) continue;
    const url = `${API_BASE}/wefeed-h5api-bff/subject/caption?id=${id}`;
    try {
      const res = await fetch(url, {
        headers: { ...COMMON_HEADERS, Referer: `${ORIGIN}/play/${subject.detailPath}` },
      });
      const text = await res.text();
      console.log(`\n[ id=${id} ] → ${res.status}`);
      console.log(text.slice(0, 1500));
    } catch (e) {
      console.log(`\n[ id=${id} ] → ERROR: ${(e as Error).message}`);
    }
  }
  
  // Try POST
  console.log("\n=== POST caption ===");
  for (const id of ids) {
    if (!id) continue;
    try {
      const res = await fetch(`${API_BASE}/wefeed-h5api-bff/subject/caption`, {
        method: "POST",
        headers: { ...COMMON_HEADERS, "Content-Type": "application/json", Referer: `${ORIGIN}/play/${subject.detailPath}` },
        body: JSON.stringify({ id }),
      });
      const text = await res.text();
      console.log(`\n[POST id=${id}] → ${res.status}`);
      console.log(text.slice(0, 1500));
    } catch (e) {
      console.log(`\n[POST id=${id}] → ERROR: ${(e as Error).message}`);
    }
  }
  
  // Try GET with full path
  console.log("\n=== Try /wefeed-h5api-bff/subject/caption with query params ===");
  const queries = [
    `id=${subject.subjectId}&detailPath=${subject.detailPath}`,
    `subjectId=${subject.subjectId}&id=${subject.subjectId}`,
    `id=${subject.subjectId}&se=0&ep=0`,
    `id=${subject.subjectId}&detailPath=${subject.detailPath}&se=0&ep=0`,
    `id=${stream?.id}&subjectId=${subject.subjectId}`,
  ];
  for (const q of queries) {
    try {
      const res = await fetch(`${API_BASE}/wefeed-h5api-bff/subject/caption?${q}`, {
        headers: { ...COMMON_HEADERS, Referer: `${ORIGIN}/play/${subject.detailPath}` },
      });
      const text = await res.text();
      console.log(`\n[?${q}] → ${res.status}`);
      console.log(text.slice(0, 1500));
    } catch (e) {
      console.log(`\n[?${q}] → ERROR`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
