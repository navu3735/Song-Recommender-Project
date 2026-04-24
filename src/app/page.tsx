"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import YouTube, { type YouTubeEvent } from "react-youtube";

type Song = {
  title: string;
  artist: string;
  channelTitle: string;
  videoId: string;
  thumbnailUrl: string;
  score?: number;
};

type LibraryData = {
  likedSongs: Song[];
  recentlyPlayed: Song[];
  discoverWeekly: Song[];
  djRadio: Song[];
  focusMix: Song[];
};

const sessionKey = "pulseify-session-id";

const getSessionId = () => {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(sessionKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(sessionKey, created);
  return created;
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [current, setCurrent] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [progressSec, setProgressSec] = useState(0);
  const [status, setStatus] = useState("Ready to discover your next favorite.");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sidebarPalette, setSidebarPalette] = useState("from-emerald-500/40 to-slate-900");
  const [djMode, setDjMode] = useState(true);
  const [activeCollection, setActiveCollection] = useState("search");
  const [library, setLibrary] = useState<LibraryData>({
    likedSongs: [],
    recentlyPlayed: [],
    discoverWeekly: [],
    djRadio: [],
    focusMix: []
  });
  const startedAt = useRef<number>(0);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    const loadLibrary = async () => {
      if (!sessionId) return;
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      if (!res.ok) return;
      const data = (await res.json()) as LibraryData;
      setLibrary(data);
    };
    loadLibrary();
  }, [sessionId]);

  useEffect(() => {
    if (!current) return;
    const gradients = [
      "from-emerald-500/40 to-slate-900",
      "from-purple-500/40 to-slate-900",
      "from-blue-500/40 to-slate-900",
      "from-pink-500/40 to-slate-900"
    ];
    setSidebarPalette(gradients[current.videoId.charCodeAt(0) % gradients.length]);
  }, [current]);

  useEffect(() => {
    if (!playerRef.current || !isPlaying) return;
    const timer = window.setInterval(async () => {
      if (!playerRef.current) return;
      const currentTime = await playerRef.current.getCurrentTime();
      setProgressSec(currentTime);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const searchSongs = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setStatus("Searching YouTube...");
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setStatus(data.error ?? "Search failed");
      return;
    }
    const fetched = data.results as Song[];
    setResults(fetched);
    setQueue(fetched);
    setQueueIndex(-1);
    setStatus(`Found ${data.results.length} songs.`);
  };

  const sendEvent = async (eventType: "play" | "complete" | "skip" | "like", song: Song, listenedMs = 0) => {
    if (!sessionId) return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        songTitle: song.title,
        artist: song.artist,
        youtubeVideoId: song.videoId,
        channelTitle: song.channelTitle,
        listenedMs,
        eventType
      })
    });
  };

  const getRecommendations = async (seed: string, mode: "normal" | "dj" = "normal", currentSong?: Song) => {
    if (!sessionId) return;
    const excludeVideoIds = queue.map((song) => song.videoId).slice(0, 20);
    const res = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        seed,
        mode,
        excludeVideoIds,
        currentSong: currentSong
          ? {
              title: currentSong.title,
              artist: currentSong.artist,
              channelTitle: currentSong.channelTitle
            }
          : undefined
      })
    });
    const data = await res.json();
    if (res.ok) {
      const nextRecommendations = data.recommendations as Song[];
      setRecommendations(nextRecommendations);
      if (currentSong && nextRecommendations.length) {
        const mixedQueue = [currentSong, ...nextRecommendations];
        setQueue(mixedQueue);
        setQueueIndex(0);
      }
    }
  };

  const playSong = async (song: Song, nextQueue?: Song[]) => {
    if (current) {
      const listened = Math.max(Date.now() - startedAt.current, 0);
      await sendEvent(listened < 25_000 ? "skip" : "complete", current, listened);
    }
    if (nextQueue?.length) {
      setQueue(nextQueue);
      setQueueIndex(nextQueue.findIndex((item) => item.videoId === song.videoId));
    }
    setCurrent(song);
    setProgressSec(0);
    startedAt.current = Date.now();
    setStatus(`Now playing: ${song.title}`);
    await sendEvent("play", song, 0);
    await getRecommendations(song.title, djMode ? "dj" : "normal", song);
  };

  const likeCurrent = async () => {
    if (!current) return;
    await sendEvent("like", current, Math.max(Date.now() - startedAt.current, 0));
    setStatus("Saved your preference. Recommendations are adapting.");
    await getRecommendations(current.title, djMode ? "dj" : "normal", current);
    if (sessionId) {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      if (res.ok) {
        setLibrary((await res.json()) as LibraryData);
      }
    }
  };

  const playNext = async () => {
    const source = queue.length ? queue : recommendations.length ? recommendations : results;
    if (!source.length) return;
    const nextIndex = queueIndex >= 0 && queueIndex < source.length - 1 ? queueIndex + 1 : 0;
    await playSong(source[nextIndex], source);
  };

  const playPrevious = async () => {
    const source = queue.length ? queue : recommendations.length ? recommendations : results;
    if (!source.length) return;
    const prevIndex = queueIndex > 0 ? queueIndex - 1 : source.length - 1;
    await playSong(source[prevIndex], source);
  };

  const togglePlayback = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      return;
    }
    playerRef.current.playVideo();
    setIsPlaying(true);
  };

  const seekTo = (percent: number) => {
    if (!playerRef.current || durationSec <= 0) return;
    const target = (percent / 100) * durationSec;
    playerRef.current.seekTo(target, true);
    setProgressSec(target);
  };

  const onPlayerReady = async (event: YouTubeEvent) => {
    playerRef.current = event.target;
    setDurationSec(await event.target.getDuration());
    setIsPlaying(true);
  };

  const onPlayerStateChange = async (event: YouTubeEvent<number>) => {
    if (event.data === 1) {
      setIsPlaying(true);
      const length = await event.target.getDuration();
      setDurationSec(length);
    }
    if (event.data === 2) {
      setIsPlaying(false);
    }
    if (event.data === 0) {
      if (current) {
        await sendEvent("complete", current, Math.max(Date.now() - startedAt.current, 0));
      }
      if (djMode && current) {
        await getRecommendations(current.title, "dj", current);
      }
      await playNext();
    }
  };

  useEffect(() => {
    if (!current || !isPlaying) return;
    const interval = window.setInterval(() => {
      getRecommendations(current.title, djMode ? "dj" : "normal", current);
    }, 12000);
    return () => window.clearInterval(interval);
    // We intentionally poll recommendations during active playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, isPlaying, djMode, sessionId]);

  const progressPercent = useMemo(() => {
    if (!durationSec) return 0;
    return Math.min((progressSec / durationSec) * 100, 100);
  }, [durationSec, progressSec]);

  const formatTime = (timeSec: number) => {
    const total = Math.max(Math.floor(timeSec), 0);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  const loadCollection = async (collection: keyof LibraryData, autoPlay = false) => {
    setActiveCollection(collection);
    const items = library[collection] ?? [];
    setQueue(items);
    setQueueIndex(-1);
    const label = collection.replace(/([A-Z])/g, " $1").trim();
    setStatus(items.length ? `Loaded ${items.length} songs from ${label}.` : `No songs in ${label} yet.`);
    if (autoPlay && items.length) {
      await playSong(items[0], items);
    }
  };

  return (
    <main className="spotify-shell">
      <aside className="spotify-nav">
        <h1 className="text-2xl font-bold">Pulseify</h1>
        <button className={`nav-item ${activeCollection === "search" ? "active" : ""}`} onClick={() => setActiveCollection("search")}>
          <span>🏠</span>
          <span>Home</span>
        </button>
        <button className={`nav-item ${activeCollection === "search" ? "active" : ""}`} onClick={() => setActiveCollection("search")}>
          <span>🔍</span>
          <span>Search</span>
        </button>
        <button
          className={`nav-item ${activeCollection === "recentlyPlayed" ? "active" : ""}`}
          onClick={() => loadCollection("recentlyPlayed")}
        >
          <span>📚</span>
          <span>Your Library</span>
        </button>
        <h3 className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-400">Playlists</h3>
        <div className="playlist-list">
          <button
            className={`playlist-item ${activeCollection === "discoverWeekly" ? "active" : ""}`}
            onClick={() => loadCollection("discoverWeekly", true)}
          >
            Discover Weekly
          </button>
          <button
            className={`playlist-item ${activeCollection === "djRadio" ? "active" : ""}`}
            onClick={() => loadCollection("djRadio", true)}
          >
            AI DJ Radio
          </button>
          <button
            className={`playlist-item ${activeCollection === "likedSongs" ? "active" : ""}`}
            onClick={() => loadCollection("likedSongs")}
          >
            Liked Songs
          </button>
          <button
            className={`playlist-item ${activeCollection === "focusMix" ? "active" : ""}`}
            onClick={() => loadCollection("focusMix", true)}
          >
            Focus Mix
          </button>
        </div>
      </aside>

      <section className="spotify-left">
        <div className="spotify-header">
          <h2 className="text-3xl font-bold">Good evening</h2>
          <p className="mt-1 text-sm text-slate-300">{status}</p>
        </div>

        <div className="spotify-search">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSongs()}
              placeholder="What do you want to play?"
            />
          </div>
          <button
            onClick={searchSongs}
            disabled={loading}
            className="rounded-full bg-brand-500 px-6 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? "Searching" : "Search"}
          </button>
        </div>

        <h2 className="mt-8 mb-3 text-lg font-semibold">
          {activeCollection === "search" ? "Search Results" : activeCollection.replace(/([A-Z])/g, " $1")}
        </h2>
        <div className="song-grid">
          {(activeCollection === "search" ? results : queue).map((song) => (
            <button key={song.videoId} onClick={() => playSong(song, activeCollection === "search" ? results : queue)} className="song-card">
              <img src={song.thumbnailUrl} alt={song.title} className="song-card-image" />
              <div className="song-card-meta">
                <p className="song-title">{song.title}</p>
                <p className="song-subtitle">{song.artist}</p>
              </div>
            </button>
          ))}
        </div>

        <h2 className="mt-8 mb-3 text-lg font-semibold">Made For You</h2>
        <div className="song-grid">
          {recommendations.map((song) => (
            <button key={`rec-${song.videoId}`} onClick={() => playSong(song, recommendations)} className="song-card">
              <img src={song.thumbnailUrl} alt={song.title} className="song-card-image" />
              <div className="song-card-meta">
                <p className="song-title">{song.title}</p>
                <p className="song-subtitle">{song.artist}</p>
                <p className="song-score">match {Math.max(Math.round(song.score ?? 0), 0)}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <aside className={`spotify-player bg-gradient-to-b ${sidebarPalette}`}>
        <div className="w-full">
          <h2 className="text-lg font-semibold">Now Playing</h2>
        </div>

        <div className="player-art">
          {current ? (
            <img src={current.thumbnailUrl} alt={current.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Pick a track to start</div>
          )}
        </div>

        <div className="w-full">
          <p className="text-xl font-semibold">{current?.title ?? "No song selected"}</p>
          <p className="text-sm text-slate-300">{current?.artist ?? "Search and play to begin"}</p>
        </div>

        <div className="w-full">
          <div
            className="progress-track"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const percent = ((event.clientX - rect.left) / rect.width) * 100;
              seekTo(Math.max(0, Math.min(percent, 100)));
            }}
          >
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-300">
            <span>{formatTime(progressSec)}</span>
            <span>{formatTime(durationSec)}</span>
          </div>
        </div>

        <div className="player-controls">
          <button onClick={playPrevious} className="control-button">
            ⏮
          </button>
          <button onClick={togglePlayback} className="control-button primary">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button onClick={playNext} className="control-button">
            ⏭
          </button>
          <button onClick={likeCurrent} className="control-button">
            ❤
          </button>
        </div>
        <button className={`dj-toggle ${djMode ? "on" : ""}`} onClick={() => setDjMode((value) => !value)}>
          DJ {djMode ? "ON" : "OFF"}
        </button>

        <div className="sr-only">
          {current && (
            <YouTube
              videoId={current.videoId}
              opts={{
                width: "1",
                height: "1",
                playerVars: {
                  autoplay: 1,
                  rel: 0
                }
              }}
              onReady={onPlayerReady}
              onStateChange={onPlayerStateChange}
            />
          )}
        </div>

        <div className="w-full">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-300">Up Next</h3>
          <div className="space-y-2">
            {(queue.length ? queue : recommendations).slice(0, 5).map((song) => (
              <button
                key={`queue-${song.videoId}`}
                onClick={() => playSong(song, queue.length ? queue : recommendations)}
                className="flex w-full items-center gap-3 rounded-xl bg-black/20 p-2 text-left hover:bg-black/30"
              >
                <img src={song.thumbnailUrl} alt={song.title} className="h-12 w-12 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  <p className="truncate text-xs text-slate-300">{song.artist}</p>
                </div>
              </button>
            ))}
            {!queue.length && !recommendations.length && (
              <p className="text-sm text-slate-300">Your queue will appear here once playback starts.</p>
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}
