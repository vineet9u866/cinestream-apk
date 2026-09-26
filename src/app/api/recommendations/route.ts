import { NextRequest, NextResponse } from "next/server";
import { cached, getRecommendations } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const subjectId = req.nextUrl.searchParams.get("subjectId");
    const subjectType = Number(req.nextUrl.searchParams.get("subjectType") ?? "1");
    if (!subjectId) {
      return NextResponse.json(
        { code: 400, message: "subjectId is required" },
        { status: 400 }
      );
    }
    const key = `rec:${subjectId}:${subjectType}`;
    const data = await cached(key, () => getRecommendations(subjectId, subjectType));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}
