import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { diversifyByArtist, scoreCandidates, similarityScore, topTasteTerms } from "@/lib/recommender";
import { searchYouTubeSongs } from "@/lib/youtube";
import type { TasteVector } from "@/lib/types";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  seed: z.string().min(1),
  mode: z.enum(["normal", "dj"]).optional().default("normal"),
  excludeVideoIds: z.array(z.string()).optional().default([]),
  currentSong: z
    .object({
      title: z.string(),
      artist: z.string(),
      channelTitle: z.string()
    })
    .optional()
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const profile = await db.userProfile.findUnique({ where: { sessionId: body.sessionId } });
    const tasteVector = ((profile?.tasteVector as TasteVector) ?? {}) as TasteVector;
    const recentEvents = profile
      ? await db.listeningEvent.findMany({
          where: { userProfileId: profile.id },
          orderBy: { createdAt: "desc" },
          take: 60
        })
      : [];

    const recentVideoIds = new Set([...recentEvents.map((event) => event.youtubeVideoId), ...body.excludeVideoIds]);
    const recentArtists = new Set(recentEvents.slice(0, 30).map((event) => event.artist.toLowerCase()));
    const skipCounts = recentEvents
      .filter((event) => event.eventType === "skip")
      .reduce<Record<string, number>>((acc, event) => {
        const key = event.artist.toLowerCase();
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
    const tasteTerms = topTasteTerms(tasteVector, body.mode === "dj" ? 12 : 8);
    const expandedSeeds = [
      body.seed,
      `${body.seed} radio`,
      `${body.seed} similar songs`,
      tasteTerms.length ? `${tasteTerms.join(" ")} playlist` : "",
      tasteTerms.length ? `${tasteTerms.slice(0, 3).join(" ")} mix` : ""
    ].filter(Boolean);

    const queries = body.mode === "dj" ? expandedSeeds : expandedSeeds.slice(0, 3);
    const candidateBuckets = await Promise.all(queries.map((query) => searchYouTubeSongs(query)));

    const unique = new Map<string, (typeof candidateBuckets)[number][number]>();
    candidateBuckets.flat().forEach((song) => {
      if (recentVideoIds.has(song.videoId)) return;
      unique.set(song.videoId, song);
    });

    const reranked = scoreCandidates([...unique.values()], tasteVector).map((song) => {
      const artistKey = song.artist.toLowerCase();
      const artistSeenPenalty = recentArtists.has(artistKey) ? 0.35 : 0;
      const skipPenalty = (skipCounts[artistKey] ?? 0) * 0.7;
      const similarityBoost = body.currentSong
        ? similarityScore(body.currentSong, {
            title: song.title,
            artist: song.artist,
            channelTitle: song.channelTitle
          }) * 2.25
        : 0;
      return { ...song, score: song.score - artistSeenPenalty - skipPenalty + similarityBoost };
    });

    const ranked = diversifyByArtist(reranked.sort((a, b) => b.score - a.score), 1).slice(0, body.mode === "dj" ? 20 : 12);
    return NextResponse.json({ recommendations: ranked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get recommendations" },
      { status: 400 }
    );
  }
}
