# Pulseify - Song Recommendation System

End-to-end Spotify-inspired recommendation app with:

- YouTube search + playback
- Adaptive user taste learning over time
- PostgreSQL persistence
- AI-style ranking from listening behavior

## 1) Environment

You already have `.env`, but make sure it contains:

```env
DATABASE_URL="postgresql://..."
YOUTUBE_API_KEY="..."
NEXT_PUBLIC_APP_NAME="Pulseify"
```

## 2) Install + database

```bash
npm install
npm run prisma:generate
npm run prisma:push
```

## 3) Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## How learning works

- Every play/skip/complete/like is recorded in PostgreSQL.
- The backend updates a user taste vector from song title/artist/channel tokens.
- Future recommendations are scored based on similarity to that learned vector.
- Session identity is stored in browser localStorage, so behavior adapts over time for that user.
