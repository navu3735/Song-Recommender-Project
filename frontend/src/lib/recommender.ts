import type { EventType } from "@prisma/client";
import type { SongCandidate, TasteVector } from "@/lib/types";

type SimilarityTarget = {
  title: string;
  artist: string;
  channelTitle: string;
};

type CandidateContext = {
  currentSong?: SimilarityTarget;
  recentArtists?: Set<string>;
  skipCounts?: Record<string, number>;
};

const stopWords = new Set([
  "official", "audio", "video", "lyrics", "lyric", "music", "feat", "ft",
  "remastered", "live", "visualizer", "topic", "provided", "youtube", "records", "vevo"
]);

const eventWeight: Record<EventType, number> = {
  play: 1.0,
  complete: 3.5,
  skip: -5.0, // Aggressive skip penalty
  like: 8.0   // Strong like boost
};

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));

const uniqueTokens = (song: SimilarityTarget) =>
  new Set([...tokenize(song.title), ...tokenize(song.artist), ...tokenize(song.channelTitle)]);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function updateTasteVector(
  current: TasteVector,
  song: SimilarityTarget,
  event: EventType
): TasteVector {
  const next: TasteVector = { ...current };
  const tokens = uniqueTokens(song);
  const delta = eventWeight[event] ?? 0;

  for (const token of tokens) {
    next[token] = clamp((next[token] ?? 0) + delta, -20, 40);
  }

  // Decay old tokens slightly to keep taste fresh
  for (const token in next) {
    if (!tokens.has(token)) {
      next[token] *= 0.98;
    }
  }

  return Object.fromEntries(
    Object.entries(next)
      .filter(([, weight]) => Math.abs(weight) >= 0.1)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 200)
  );
}

export function similarityScore(base: SimilarityTarget, candidate: SimilarityTarget): number {
  const baseTokens = uniqueTokens(base);
  const candidateTokens = uniqueTokens(candidate);
  const shared = [...candidateTokens].filter((token) => baseTokens.has(token)).length;
  const union = new Set([...baseTokens, ...candidateTokens]).size || 1;
  
  const titleOverlap = shared / union;
  const sameArtist = base.artist.toLowerCase() === candidate.artist.toLowerCase();
  
  return clamp(titleOverlap * 0.7 + (sameArtist ? 0.3 : 0), 0, 1);
}

export function scoreCandidates(
  candidates: Omit<SongCandidate, "score">[],
  tasteVector: TasteVector,
  context: CandidateContext = {}
): SongCandidate[] {
  const maxWeight = Math.max(1, ...Object.values(tasteVector).map(Math.abs));
  const normalizedTaste = Object.fromEntries(
    Object.entries(tasteVector).map(([token, weight]) => [token, weight / maxWeight])
  );

  return candidates
    .map((candidate) => {
      const tokens = uniqueTokens(candidate);
      const artistKey = candidate.artist.toLowerCase();
      
      const tasteScore = [...tokens].reduce((sum, token) => sum + (normalizedTaste[token] ?? 0), 0) / Math.max(tokens.size, 1);
      const currentSimilarity = context.currentSong ? similarityScore(context.currentSong, candidate) : 0;
      
      const recentArtistPenalty = context.recentArtists?.has(artistKey) ? 0.4 : 0;
      const skipPenalty = Math.min((context.skipCounts?.[artistKey] ?? 0) * 0.2, 0.6);

      // Spotify-style scoring components
      const score = clamp(
        (tasteScore * 0.4 + currentSimilarity * 0.6) * 100 - 
        (recentArtistPenalty * 50) - 
        (skipPenalty * 50),
        1, 100
      );

      const reason = currentSimilarity > 0.5 
        ? "Similar to what's playing" 
        : tasteScore > 0.2 
          ? "Matches your vibe" 
          : "Fresh find for you";

      return { ...candidate, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildUpcomingQueue(candidates: SongCandidate[], currentSong?: SimilarityTarget, count = 10): SongCandidate[] {
  const pool = [...candidates];
  const queue: SongCandidate[] = [];
  const artists = new Set<string>();

  while (pool.length && queue.length < count) {
    const nextIndex = pool.findIndex((song) => {
      const artist = song.artist.toLowerCase();
      if (artists.has(artist)) return false; // Avoid artist repetition in immediate queue
      return true;
    });

    const index = nextIndex >= 0 ? nextIndex : 0;
    const [next] = pool.splice(index, 1);
    artists.add(next.artist.toLowerCase());
    queue.push(next);
  }

  return queue;
}

export function topTasteTerms(tasteVector: TasteVector, limit: number): string[] {
  return Object.entries(tasteVector)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

export function diversifyByArtist(candidates: SongCandidate[], maxPerArtist: number): SongCandidate[] {
  const result: SongCandidate[] = [];
  const artistCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    const artist = candidate.artist.toLowerCase();
    const count = artistCounts[artist] ?? 0;
    if (count < maxPerArtist) {
      result.push(candidate);
      artistCounts[artist] = count + 1;
    }
  }

  return result;
}
