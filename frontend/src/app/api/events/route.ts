import { EventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { updateTasteVector } from "@/lib/recommender";
import type { TasteVector } from "@/lib/types";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  songTitle: z.string().min(1),
  artist: z.string().min(1),
  youtubeVideoId: z.string().min(1),
  channelTitle: z.string().min(1),
  listenedMs: z.number().int().nonnegative().default(0),
  eventType: z.nativeEnum(EventType)
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const profile =
      (await db.userProfile.findUnique({ where: { sessionId: body.sessionId } })) ??
      (await db.userProfile.create({
        data: { sessionId: body.sessionId, tasteVector: {} }
      }));

    await db.listeningEvent.create({
      data: {
        userProfileId: profile.id,
        songTitle: body.songTitle,
        artist: body.artist,
        youtubeVideoId: body.youtubeVideoId,
        channelTitle: body.channelTitle,
        listenedMs: body.listenedMs,
        eventType: body.eventType
      }
    });

    const currentVector = (profile.tasteVector as TasteVector) ?? {};
    const nextVector = updateTasteVector(
      currentVector,
      { title: body.songTitle, artist: body.artist, channelTitle: body.channelTitle },
      body.eventType
    );

    await db.userProfile.update({
      where: { id: profile.id },
      data: {
        tasteVector: nextVector,
        totalPlays: { increment: body.eventType === EventType.play ? 1 : 0 }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save event" },
      { status: 400 }
    );
  }
}
