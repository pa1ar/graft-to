# CLAUDE.md

## Project Overview

Graft — interactive 2D/3D force-directed graph visualization for Craft documents. Shows connections via links, tags, and folders. Privacy-first: all processing in browser, server is a CORS proxy only.

## Commands

```bash
bun dev            # dev server (localhost:3000)
bun build          # production build
bun test           # unit tests (lib/graph/__tests__/)
bun lint           # ESLint
```

## Tech Stack

- Next.js 16 (App Router) on Bun, deployed to Vercel
- react-force-graph-2d/3d
- shadcn/ui + Tailwind CSS 4
- IndexedDB for persistent client-side cache (no TTL)
- Vercel Analytics

## Architecture

### CORS Proxy (`app/api/craft/[...path]/route.ts`)

Browser sends `x-craft-url` and `x-craft-key` headers. Proxy forwards to Craft API with `Authorization: Bearer`. No server-side storage or logging.

### Graph Library (`lib/graph/`)

Framework-agnostic, extractable. See [`lib/graph/CLAUDE.md`](lib/graph/CLAUDE.md).

### Graph Visualization (`components/graph/`)

2D/3D rendering with react-force-graph. See [`components/graph/CLAUDE.md`](components/graph/CLAUDE.md).

## Craft API

Reference: `../craft-do-api/craft-do-api-docs.md` and `craft-do-openapi.json`

Key patterns:
- Links extracted from markdown via `block://` regex, mapped from block IDs to document IDs
- Tags extracted via hashtag regex with nested path support (`#a/b/c`)
- Folders fetched from `/folders` endpoint, star topology

## Development Notes

- Browser-only code: graph lib uses `localStorage`, `IndexedDB`, `window` — needs client-side guards in Next.js components
- Demo graph: `API_URL='...' API_KEY='...' bun scripts/build-demo-graph.ts`
