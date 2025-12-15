---
description: Graft - Craft document graph visualization project
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# Graft - Craft Document Graph Visualization

## Project Overview
Graft visualizes Craft document connections as an interactive force-directed graph. Built for the Craft hackathon with clean architecture for potential integration by Craft team.

## Stack
- **Runtime**: Next.js 16 on Bun runtime (via Vercel)
- **Graph**: react-force-graph-2d for 2D visualization
- **UI**: shadcn/ui components with Craft-inspired design
- **Analytics**: Vercel Analytics
- **Deployment**: Vercel with `bunVersion: "1.x"` in vercel.json

## Architecture Principles
1. **Privacy-first proxy**: API requests proxied through `/api/craft` to avoid CORS. Credentials passed via headers, never stored server-side.
2. **Framework-agnostic graph library**: `lib/graph/` can be extracted and used independently by Craft team.
3. **Progressive loading**: Graph builds with progress feedback for better UX.

## Key Directories
- `lib/graph/`: Standalone graph library (types, parser, fetcher)
- `components/graph/`: React components for visualization
- `components/setup/`: API connection setup UI
- `hooks/`: Custom hooks for graph data management

## Development
```bash
bun dev        # Start dev server
bun build      # Build for production
```

## Craft API Integration
- Documents fetched via `/documents` endpoint
- Block content via `/blocks?id={docId}&maxDepth=-1`
- Links extracted from markdown using `block://` regex pattern
- Bidirectional link mapping for graph relationships

## Security
- No server-side storage of user data
- API credentials passed via headers only (never stored)
- Proxy route forwards requests without logging
- No database, no data retention

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
