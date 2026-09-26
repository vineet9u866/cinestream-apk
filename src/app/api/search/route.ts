import { NextRequest, NextResponse } from "next/server";
import { cached, searchSubjects } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { keyword, page, perPage, subjectType } = await req.json();
    if (!keyword || typeof keyword !== "string") {
      return NextResponse.json(
        { code: 400, message: "keyword is required" },
        { status: 400 }
      );
    }
    const key = `search:${keyword}:${page ?? 1}:${perPage ?? 18}`;
    const data = await cached(key, () =>
      searchSubjects(keyword, page ?? 1, perPage ?? 18, subjectType ?? 0)
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        code: 500,
        message: (e as Error).message,
        data: {
          pager: { hasMore: false, nextPage: "", page: "1", perPage: 18, totalCount: 0 },
          items: [],
        },
      },
      { status: 500 }
    );
  }
}
