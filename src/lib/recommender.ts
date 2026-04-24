import type { EventType } from "@prisma/client";
import type { TasteVector, SongCandidate } from "@/lib/types";

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

type SimilarityTarget = {
  title: string;
  artist: string;
  channelTitle: string;
};

const eventWeight: Record<EventType, number> = {
  play: 1,
  complete: 2,
  skip: -1.5,
  like: 3
};

export function updateTasteVector(
  current: TasteVector,
  song: { title: string; artist: string; channelTitle: string },
  event: EventType
): TasteVector {
  const next: TasteVector = { ...current };
  const tokens = new Set([...tokenize(song.title), ...tokenize(song.artist), ...tokenize(song.channelTitle)]);
  const delta = eventWeight[event] ?? 0;

  for (const token of tokens) {
    next[token] = (next[token] ?? 0) + delta;
  }

  return next;
}

export function scoreCandidates(candidates: Omit<SongCandidate, "score">[], tasteVector: TasteVector): SongCandidate[] {
  const normalized = Object.entries(tasteVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
    .reduce<Record<string, number>>((acc, [token, weight]) => {
      acc[token] = weight;
      return acc;
    }, {});

  const maxWeight = Math.max(1, ...Object.values(normalized).map((value) => Math.abs(value)));

  return candidates
    .map((candidate) => {
      const tokens = new Set([
        ...tokenize(candidate.title),
        ...tokenize(candidate.artist),
        ...tokenize(candidate.channelTitle)
      ]);

      let score = 0;
      for (const token of tokens) {
        score += (normalized[token] ?? 0) / maxWeight;
      }

      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function similarityScore(base: SimilarityTarget, candidate: SimilarityTarget): number {
  const baseTokens = new Set([...tokenize(base.title), ...tokenize(base.artist), ...tokenize(base.channelTitle)]);
  const candidateTokens = new Set([
    ...tokenize(candidate.title),
    ...tokenize(candidate.artist),
    ...tokenize(candidate.channelTitle)
  ]);

  const shared = [...candidateTokens].filter((token) => baseTokens.has(token)).length;
  const union = new Set([...baseTokens, ...candidateTokens]).size || 1;
  const artistPenalty = base.artist.toLowerCase() === candidate.artist.toLowerCase() ? 0.35 : 0;
  return shared / union - artistPenalty;
}

export function diversifyByArtist(candidates: SongCandidate[], maxPerArtist = 2): SongCandidate[] {
  const artistCount = new Map<string, number>();
  const diversified: SongCandidate[] = [];

  for (const candidate of candidates) {
    const artist = candidate.artist.toLowerCase();
    const count = artistCount.get(artist) ?? 0;
    if (count >= maxPerArtist) {
      continue;
    }
    artistCount.set(artist, count + 1);
    diversified.push(candidate);
  }

  return diversified;
}

export function topTasteTerms(tasteVector: TasteVector, count = 8): string[] {
  return Object.entries(tasteVector)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([token]) => token);
}
