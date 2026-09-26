import { NextRequest, NextResponse } from "next/server";
import { cached, getHome } from "@/lib/moviebox";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const data = await cached("home", () => getHome());
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: (e as Error).message },
      { status: 500 }
    );
  }
}
