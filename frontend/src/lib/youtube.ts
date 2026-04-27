import { z } from "zod";

const youtubeItemSchema = z.object({
  id: z.object({
    videoId: z.string()
  }),
  snippet: z.object({
    title: z.string(),
    channelTitle: z.string(),
    thumbnails: z.object({
      high: z.object({ url: z.string() }).optional(),
      medium: z.object({ url: z.string() }).optional(),
      default: z.object({ url: z.string() }).optional()
    })
  })
});

const youtubeResponseSchema = z.object({
  items: z.array(youtubeItemSchema)
});

export type YouTubeSong = {
  title: string;
  artist: string;
  channelTitle: string;
  videoId: string;
  thumbnailUrl: string;
};

const cleanTitle = (title: string) => title.replace(/\[[^\]]+\]|\([^)]+\)/g, "").trim();

const parseArtist = (title: string, channelTitle: string) => {
  const normalized = cleanTitle(title);
  if (normalized.includes("-")) {
    return normalized.split("-")[0].trim();
  }
  return channelTitle;
};

export async function searchYouTubeSongs(query: string): Promise<YouTubeSong[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY");
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: `${query} official audio`,
    maxResults: "15",
    type: "video",
    videoCategoryId: "10",
    key: apiKey
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    let details = `status ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: { message?: string } };
      if (errorBody?.error?.message) {
        details = errorBody.error.message;
      }
    } catch {
      // ignore parse failures and keep HTTP status detail
    }
    throw new Error(`YouTube API error: ${details}`);
  }

  const json = await response.json();
  const parsed = youtubeResponseSchema.parse(json);

  return parsed.items.map((item) => ({
    title: cleanTitle(item.snippet.title),
    artist: parseArtist(item.snippet.title, item.snippet.channelTitle),
    channelTitle: item.snippet.channelTitle,
    videoId: item.id.videoId,
    thumbnailUrl:
      item.snippet.thumbnails.high?.url ??
      item.snippet.thumbnails.medium?.url ??
      item.snippet.thumbnails.default?.url ??
      `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`
  }));
}
