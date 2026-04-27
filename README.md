# Pulseify - Intelligent Song Recommendation System

Pulseify is a full-stack, Spotify-inspired music recommendation platform that learns user preferences over time and delivers personalized song suggestions.
https://pulsify-one.vercel.app/

## Project Structure

- `frontend/` - Next.js App Router UI, API route handlers, Tailwind, and app configuration.
- `backend/` - Backend-owned project files, including the Prisma database schema.
- `package.json` - Root command hub that forwards common scripts to the frontend workspace.

The API routes currently remain in `frontend/src/app/api` so the existing Next.js app behavior stays unchanged.

## Features

- YouTube search and playback integration
- Adaptive taste learning based on user behavior
- AI-style ranking system for recommendations
- PostgreSQL database through Prisma ORM
- Interaction tracking for play, skip, like, and completion events

## Tech Stack

- Frontend: Next.js App Router, React, Tailwind CSS
- Backend: Next.js API route handlers, Prisma schema in `backend/prisma`
- Database: PostgreSQL
- APIs: YouTube Data API

## Setup

Create `frontend/.env`:

```env
DATABASE_URL="postgresql://..."
YOUTUBE_API_KEY="..."
NEXT_PUBLIC_APP_NAME="Pulseify"
```

Install dependencies from the repository root:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Run the app:

```bash
npm run dev
```

You can also run commands directly inside `frontend/` if needed.
