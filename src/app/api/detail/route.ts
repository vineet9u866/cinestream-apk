import { NextRequest, NextResponse } from "next/server";
import { cached, getDetail } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const subjectId = req.nextUrl.searchParams.get("subjectId");
    if (!subjectId) {
      return NextResponse.json(
        { code: 400, message: "subjectId is required" },
        { status: 400 }
      );
    }
    const key = `detail:${subjectId}`;
    const data = await cached(key, () => getDetail(subjectId));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}
