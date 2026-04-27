import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { topTasteTerms } from "@/lib/recommender";
import type { TasteVector } from "@/lib/types";
import { searchYouTubeSongs } from "@/lib/youtube";

const bodySchema = z.object({
  sessionId: z.string().min(1)
});

type LibrarySong = {
  title: string;
  artist: string;
  channelTitle: string;
  videoId: string;
  thumbnailUrl: string;
};

const uniq = (songs: LibrarySong[]) => {
  const map = new Map<string, LibrarySong>();
  songs.forEach((song) => map.set(song.videoId, song));
  return [...map.values()];
};

export async function POST(request: Request) {
  try {
    const { sessionId } = bodySchema.parse(await request.json());
    const profile = await db.userProfile.findUnique({ where: { sessionId } });
    if (!profile) {
      return NextResponse.json({
        likedSongs: [],
        recentlyPlayed: [],
        discoverWeekly: [],
        djRadio: [],
        focusMix: []
      });
    }

    const events = await db.listeningEvent.findMany({
      where: { userProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 120
    });

    const likedEvents = events.filter((event) => event.eventType === "like");
    const completeEvents = events.filter((event) => event.eventType === "complete");
    const recentUnique = uniq(
      events.map((event) => ({
        title: event.songTitle,
        artist: event.artist,
        channelTitle: event.channelTitle,
        videoId: event.youtubeVideoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${event.youtubeVideoId}/hqdefault.jpg`
      }))
    );
    const likedSongs = uniq(
      likedEvents.map((event) => ({
        title: event.songTitle,
        artist: event.artist,
        channelTitle: event.channelTitle,
        videoId: event.youtubeVideoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${event.youtubeVideoId}/hqdefault.jpg`
      }))
    );

    const terms = topTasteTerms((profile.tasteVector as TasteVector) ?? {}, 6);
    const baseSeed = completeEvents[0]?.songTitle ?? likedEvents[0]?.songTitle ?? terms[0] ?? "top hits";
    const artistSeed = completeEvents[0]?.artist ?? likedEvents[0]?.artist ?? terms[1] ?? "indie";

    const [discoverWeekly, djRadio, focusMix] = await Promise.all([
      searchYouTubeSongs(`${baseSeed} weekly mix songs`),
      searchYouTubeSongs(`${artistSeed} radio mix`),
      searchYouTubeSongs(`${terms.join(" ")} focus chill mix`)
    ]);

    return NextResponse.json({
      likedSongs: likedSongs.slice(0, 30),
      recentlyPlayed: recentUnique.slice(0, 30),
      discoverWeekly: uniq(discoverWeekly).slice(0, 30),
      djRadio: uniq(djRadio).slice(0, 30),
      focusMix: uniq(focusMix).slice(0, 30)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load library" },
      { status: 400 }
    );
  }
}
