import { NextRequest, NextResponse } from "next/server";
import { getCaptions } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

/**
 * Returns the list of available caption (subtitle) tracks for a given stream.
 *
 * Query params:
 *   streamId   - the upstream stream ID (from MBStream.id)
 *   subjectId  - the upstream subject ID
 *   detailPath - the upstream detail path (used for the Referer header)
 *
 * The upstream SRT URLs are signed with a short-lived CloudFront policy, so
 * this endpoint is not cacheable.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const streamId = sp.get("streamId");
    const subjectId = sp.get("subjectId");
    const detailPath = sp.get("detailPath") || "";
    if (!streamId || !subjectId) {
      return NextResponse.json(
        { code: 400, message: "streamId and subjectId are required" },
        { status: 400 }
      );
    }
    const data = await getCaptions(streamId, subjectId, detailPath);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}
