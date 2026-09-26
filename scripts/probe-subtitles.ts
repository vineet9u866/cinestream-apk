// Probe the MovieBox play API to see if subtitle URLs are returned
import { getPlayInfo, getHome, getDetail, primeGuestToken } from "../src/lib/moviebox";

async function main() {
  await primeGuestToken();
  
  console.log("=== Getting home feed ===");
  const home = await getHome();
  // Find a movie
  const op = home.data.operatingList.find(o => o.subjects && o.subjects.length > 0);
  if (!op) {
    console.log("No subjects found");
    return;
  }
  const subject = op.subjects[0];
  console.log("First subject:", subject.title, "id:", subject.subjectId, "type:", subject.subjectType);
  console.log("subtitles field:", subject.subtitles);
  console.log("detailPath:", subject.detailPath);
  
  console.log("\n=== Getting detail ===");
  const detail = await getDetail(subject.subjectId);
  console.log("Detail subject subtitles:", detail.data.subject.subtitles);
  console.log("Detail subject dubs:", JSON.stringify(detail.data.subject.dubs, null, 2));
  console.log("Resource seasons:", JSON.stringify(detail.data.resource.seasons, null, 2));
  
  console.log("\n=== Getting play info ===");
  const play = await getPlayInfo(subject.subjectId, subject.detailPath || "", 0, 0);
  console.log("Play data keys:", Object.keys(play.data || {}));
  console.log("Play data (raw):", JSON.stringify(play.data, null, 2).slice(0, 4000));
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
