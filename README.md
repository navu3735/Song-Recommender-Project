# Pulseify — Intelligent Song Recommendation System

Pulseify is a full-stack, Spotify-inspired music recommendation platform that learns user preferences over time and delivers personalized song suggestions.

## 🚀 Features

- 🎧 YouTube search and playback integration  
- 🧠 Adaptive taste learning based on user behavior  
- 📊 AI-style ranking system for recommendations  
- 🗄️ PostgreSQL database for persistent storage  
- ⚡ Real-time interaction tracking (play, skip, like, complete)

---

## 🛠️ Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS  
- **Backend:** Node.js, API Routes  
- **Database:** PostgreSQL (Prisma ORM)  
- **APIs:** YouTube Data API  

---

## ⚙️ Setup

### 1. Environment Variables

Create a `.env` file:

```env
DATABASE_URL="postgresql://..."
YOUTUBE_API_KEY="..."
NEXT_PUBLIC_APP_NAME="Pulseify"