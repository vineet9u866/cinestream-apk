import { NextRequest, NextResponse } from "next/server";
import { getPlayInfo } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const subjectId = sp.get("subjectId");
    const detailPath = sp.get("detailPath");
    const se = Number(sp.get("se") ?? "0");
    const ep = Number(sp.get("ep") ?? "0");
    if (!subjectId || !detailPath) {
      return NextResponse.json(
        { code: 400, message: "subjectId and detailPath are required" },
        { status: 400 }
      );
    }
    // Do not cache play info - signed URLs have a short TTL.
    const data = await getPlayInfo(subjectId, detailPath, se, ep);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}
