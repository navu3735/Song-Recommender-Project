import { NextResponse } from "next/server";
import { z } from "zod";
import { searchYouTubeSongs } from "@/lib/youtube";

const bodySchema = z.object({
  query: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const results = await searchYouTubeSongs(body.query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search songs" },
      { status: 400 }
    );
  }
}
