# CineStream — Movie & Series Streaming App

A Netflix-style streaming web app built with Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Prisma + SQLite, and the z-ai-web-dev-sdk for AI subtitle translation.

## Features

- **Home** with hero carousel + movie rails (Netflix / PrimeVideo / Disney / AppleTV categories)
- **Browse** by Movies / Series / Genre, plus full-text search
- **Detail page** with recommendations, season/episode picker
- **Video player** with quality selector, audio language switcher (dubs), subtitle picker, AI-translated captions
- **Watch Party** — host/join with 6-digit code, synced playback, live chat
- **Responsive**: desktop persistent sidebar; mobile hamburger drawer

## Tech Stack

- Next.js 16 (Turbopack) + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui (40+ Radix components)
- Prisma ORM + SQLite (pre-seeded `db/custom.db`)
- Zustand for state, framer-motion for animation
- z-ai-web-dev-sdk for AI subtitle translation

## Requirements

- Node.js 20+ (recommended: Node 24) or Bun
- That's it — no external database needed (SQLite is bundled)

## Quick Start

```bash
# 1. Extract the archive
tar -xzf cinestream.tar.gz
cd cinestream

# 2. Install dependencies (pick one)
bun install          # fastest, recommended
# OR
npm install

# 3. Generate the Prisma client
bunx prisma generate
# OR
npx prisma generate

# 4. (Optional) Reset the database to a clean state
#    Skip this if you want to keep the bundled pre-seeded DB
# bunx prisma db push

# 5. Start the dev server
bun run dev          # starts on http://localhost:3000
# OR
npm run dev
```

Open **http://localhost:3000** in your browser.

## Production Build

```bash
bun run build
bun run start
```

## Environment

The `.env` file contains:

```
DATABASE_URL=file:./db/custom.db
```

If you move the project, make sure this path still resolves (it's relative to the project root).

## Project Structure

```
cinestream/
├── prisma/
│   └── schema.prisma          # User / Post / Party models
├── db/
│   └── custom.db              # Pre-seeded SQLite database
├── public/                    # Static assets (favicon, logo)
├── src/
│   ├── app/
│   │   ├── api/               # API routes (home, search, detail, play, party, etc.)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── cinestream/        # App-specific components (Sidebar, Navbar, VideoPlayer, etc.)
│   │   └── ui/                # shadcn/ui primitives
│   ├── hooks/
│   ├── lib/                   # db client, moviebox API, utils
│   └── stores/                # Zustand stores (app, party)
├── scripts/                   # Dev/test scripts
├── .env
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── README.md                  # this file
```

## Notes

- The dev server uses Turbopack for fast HMR.
- TypeScript build errors are ignored (`typescript.ignoreBuildErrors: true` in `next.config.ts`) — this matches the original project setup.
- The Watch Party registry is in-memory and resets on server restart; parties auto-expire after 4h of inactivity.
- The MovieBox API integration fetches live movie/series metadata, so an internet connection is required for full functionality.

## Troubleshooting

**`prisma generate` fails** — make sure your `DATABASE_URL` in `.env` points to a writable location.

**Port 3000 already in use** — start on a different port: `bun run dev -- -p 3001`

**Blank screen / API errors** — the app calls live MovieBox endpoints; check your network connection.
