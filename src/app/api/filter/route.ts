import { NextRequest, NextResponse } from "next/server";
import { cached, filterSubjects, FilterParams } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const params = (await req.json()) as FilterParams;
    const key = `filter:${JSON.stringify(params)}`;
    const data = await cached(key, () => filterSubjects(params));
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}
