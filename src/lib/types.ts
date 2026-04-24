export type TasteVector = Record<string, number>;

export type SongCandidate = {
  title: string;
  artist: string;
  channelTitle: string;
  videoId: string;
  thumbnailUrl: string;
  score: number;
};
