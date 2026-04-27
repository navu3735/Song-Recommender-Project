"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import YouTube, { YouTubeEvent, YouTubePlayer } from "react-youtube";
import { 
  Search, 
  Heart, 
  Clock, 
  Sparkles, 
  Radio, 
  Waves, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  X,
  Music
} from "lucide-react";

type Song = {
  title: string;
  artist: string;
  channelTitle: string;
  videoId: string;
  thumbnailUrl: string;
  score?: number;
  reason?: string;
};

type LibraryData = {
  likedSongs: Song[];
  recentlyPlayed: Song[];
  discoverWeekly: Song[];
  djRadio: Song[];
  focusMix: Song[];
};

const sessionKey = "pulseify-session-id";

const collections = [
  { id: "search", label: "Search", icon: Search },
  { id: "likedSongs", label: "Liked Songs", icon: Heart },
  { id: "recentlyPlayed", label: "Recently Played", icon: Clock },
  { id: "discoverWeekly", label: "Discover Weekly", icon: Sparkles },
  { id: "djRadio", label: "Artist Radio", icon: Radio },
  { id: "focusMix", label: "Focus Mix", icon: Waves }
] as const;

const getSessionId = () => {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(sessionKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(sessionKey, created);
  return created;
};

// Simple hash to derive colors for dynamic background
const stringToHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
};

function Visualizer({ isPlaying }: { isPlaying: boolean }) {
  const bars = Array.from({ length: 40 }, (_, i) => i);
  
  return (
    <div className="visualizer" aria-hidden="true">
      <div className="visualizer-bars">
        {bars.map((bar) => (
          <span
            key={bar}
            style={{
              height: isPlaying ? `${Math.random() * 80 + 20}%` : "10%",
              transition: "height 0.15s ease-in-out",
              opacity: 0.1 + (bar / 40) * 0.2
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function SongDiscoveryApp() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [recommendations, setRecommendations] = useState<Song[]>([]);
  const [upNext, setUpNext] = useState<Song[]>([]);
  const [current, setCurrent] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [progressSec, setProgressSec] = useState(0);
  const [status, setStatus] = useState("Search for a track to start a personalized station.");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [activeCollection, setActiveCollection] = useState("search");
  const [fullScreenPlayer, setFullScreenPlayer] = useState(false);
  const [library, setLibrary] = useState<LibraryData>({
    likedSongs: [],
    recentlyPlayed: [],
    discoverWeekly: [],
    djRadio: [],
    focusMix: []
  });

  const startedAt = useRef(0);
  const playerRef = useRef<YouTubePlayer | null>(null);

  useEffect(() => setSessionId(getSessionId()), []);

  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setLibrary(data as LibraryData));
  }, [sessionId, current]);

  useEffect(() => {
    if (current) {
      const hue1 = stringToHue(current.videoId);
      const hue2 = (hue1 + 40) % 360;
      document.body.style.setProperty("--dynamic-bg-1", `hsl(${hue1}, 40%, 20%)`);
      document.body.style.setProperty("--dynamic-bg-2", `hsl(${hue2}, 40%, 15%)`);
    }
  }, [current]);

  useEffect(() => {
    if (!playerRef.current || !isPlaying) return;
    const timer = window.setInterval(async () => {
      if (playerRef.current) {
        setProgressSec(await playerRef.current.getCurrentTime());
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const displaySongs =
    activeCollection === "search"
      ? results
      : library[activeCollection as keyof LibraryData] ?? [];

  const rightRailSongs = recommendations.slice(0, 6);
  const nextSongs = useMemo(() => {
    if (queueIndex >= 0 && queue.length > queueIndex + 1) {
      return queue.slice(queueIndex + 1, queueIndex + 7);
    }
    return upNext.slice(0, 6);
  }, [queue, queueIndex, upNext]);

  const searchSongs = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setStatus("Searching...");
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setStatus(data.error ?? "Search failed");
      return;
    }
    setResults(data.results as Song[]);
    setActiveCollection("search");
    setStatus(`Found ${data.results.length} tracks.`);
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

  const getRecommendations = async (seed: string, currentSong?: Song) => {
    if (!sessionId) return;
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        seed,
        mode: "dj",
        excludeVideoIds: queue.map((song) => song.videoId).slice(0, 20),
        currentSong: currentSong
          ? {
              title: currentSong.title,
              artist: currentSong.artist,
              channelTitle: currentSong.channelTitle
            }
          : undefined
      })
    });
    const data = await response.json();
    if (!response.ok) return;

    const recs = data.recommendations as Song[];
    const next = (data.upNext as Song[] | undefined) ?? recs.slice(0, 8);
    setRecommendations(recs);
    setUpNext(next);
    if (currentSong && next.length) {
      setQueue([currentSong, ...next]);
      setQueueIndex(0);
    }
  };

  const playSong = async (song: Song, nextQueue?: Song[]) => {
    if (current) {
      const listened = Math.max(Date.now() - startedAt.current, 0);
      await sendEvent(listened < 25000 ? "skip" : "complete", current, listened);
    }

    const resolvedQueue = nextQueue?.length ? nextQueue : [song, ...upNext];
    setQueue(resolvedQueue);
    setQueueIndex(resolvedQueue.findIndex((item) => item.videoId === song.videoId));
    setCurrent(song);
    setProgressSec(0);
    startedAt.current = Date.now();
    setStatus(`Playing ${song.title}`);
    await sendEvent("play", song, 0);
    if (playerRef.current) playerRef.current.setVolume(55);
    await getRecommendations(song.title, song);
  };

  const playNext = async () => {
    const source = queue.length ? queue : upNext;
    const next = source[queueIndex + 1];
    if (next) await playSong(next, source);
  };

  const playPrevious = async () => {
    if (queueIndex > 0) {
      const previous = queue[queueIndex - 1];
      await playSong(previous, queue);
    }
  };

  const togglePlayback = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const seekTo = (percent: number) => {
    if (!playerRef.current || durationSec <= 0) return;
    const target = (percent / 100) * durationSec;
    playerRef.current.seekTo(target, true);
    setProgressSec(target);
  };

  const formatTime = (time: number) => {
    const seconds = Math.max(Math.floor(time), 0);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };

  return (
    <main className="app-shell">
      <Visualizer isPlaying={isPlaying} />
      
      <header className="app-header">
        <div className="brand-mark">
          <div className="brand-icon">
            <Music size={20} fill="currentColor" />
          </div>
          <div>
            <h1>Pulseify</h1>
            <p>{status}</p>
          </div>
        </div>

        <div className="search-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchSongs()}
            placeholder="Search artists, songs, or genres..."
          />
          <button onClick={searchSongs} disabled={loading}>
            {loading ? "..." : "Search"}
          </button>
        </div>
      </header>

      <nav className="side-nav">
        <div className="nav-stack">
          {collections.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${activeCollection === item.id ? "active" : ""}`}
              onClick={() => setActiveCollection(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <section className="content-panel">
        <div className="hero-player">
          <div className="hero-copy">
            <p>{current ? "NOW PLAYING" : "GET STARTED"}</p>
            <h2>{current?.title || "Discover New Music"}</h2>
            <span>{current?.artist || "Pulseify uses advanced recommendations to build the perfect queue for you."}</span>
          </div>
        </div>

        <div className="track-grid">
          {displaySongs.map((song) => (
            <button key={song.videoId} className="track-card" onClick={() => playSong(song, displaySongs)}>
              <img src={song.thumbnailUrl} alt={song.title} />
              <span>{song.title}</span>
              <small>{song.artist}</small>
            </button>
          ))}
        </div>
      </section>

      <aside className="right-rail">
        <section className="right-rail-section player-panel">
          <div className="now-playing">
            {current && <img src={current.thumbnailUrl} alt={current.title} />}
            <div>
              <h3>{current?.title || "No track playing"}</h3>
              <p>{current?.artist || "Select a song"}</p>
            </div>
          </div>

          <div className="progress-area">
            <div className="progress-track" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo(((e.clientX - rect.left) / rect.width) * 100);
            }}>
              <span style={{ width: `${(progressSec / (durationSec || 1)) * 100}%` }} />
            </div>
            <div className="time-row">
              <span>{formatTime(progressSec)}</span>
              <span>{formatTime(durationSec)}</span>
            </div>
          </div>

          <div className="player-controls">
            <button onClick={playPrevious}><SkipBack size={20} fill="currentColor" /></button>
            <button className="play-button" onClick={togglePlayback}>
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
            </button>
            <button onClick={playNext}><SkipForward size={20} fill="currentColor" /></button>
          </div>
        </section>

        <section className="right-rail-section recommend-panel">
          <h3>Recommended</h3>
          {rightRailSongs.map((song) => (
            <button key={song.videoId} className="list-item" onClick={() => playSong(song)}>
              <img src={song.thumbnailUrl} alt={song.title} />
              <div className="list-item-info">
                <strong>{song.title}</strong>
                <small>{song.artist}</small>
              </div>
            </button>
          ))}
        </section>

        <section className="right-rail-section queue-panel">
          <h3>Up Next</h3>
          {nextSongs.map((song) => (
            <button key={song.videoId} className="list-item" onClick={() => playSong(song, queue)}>
              <img src={song.thumbnailUrl} alt={song.title} />
              <div className="list-item-info">
                <strong>{song.title}</strong>
                <small>{song.artist}</small>
              </div>
            </button>
          ))}
        </section>
      </aside>

      {fullScreenPlayer && current && (
        <div className="fullscreen-player">
          <button className="close-button" onClick={() => setFullScreenPlayer(false)}><X size={32} /></button>
          <div className="fullscreen-meta">
            <img src={current.thumbnailUrl} alt={current.title} />
            <div>
              <h2>{current.title}</h2>
              <p>{current.artist}</p>
            </div>
          </div>
        </div>
      )}

      <div className="hidden-player">
        {current && (
          <YouTube
            videoId={current.videoId}
            opts={{ width: "1", height: "1", playerVars: { autoplay: 1 } }}
            onReady={(e: YouTubeEvent) => {
              playerRef.current = e.target;
              setDurationSec(e.target.getDuration());
              setIsPlaying(true);
            }}
            onStateChange={(e: YouTubeEvent<number>) => {
              setIsPlaying(e.data === 1);
              if (e.data === 0) playNext();
            }}
          />
        )}
      </div>
    </main>
  );
}
