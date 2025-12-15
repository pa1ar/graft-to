# Graft

**Graph visualization for Craft documents**

Graft creates an interactive force-directed graph of your Craft document connections, making it easy to see how your notes relate to each other.

## Features

- **Interactive Graph**: Force-directed layout shows document relationships
- **Privacy First**: All API calls happen in your browser - your API URL never touches our servers
- **Progressive Loading**: Real-time progress as your graph builds
- **Node Preview**: Click any node to see document details
- **Graph Statistics**: See connection counts, orphan nodes, and most-connected documents
- **Direct Links**: Open documents directly in Craft app

## Getting Started

### Prerequisites

- A Craft account with API access
- Your Craft API URL (from Craft settings)
- Your Craft API Key (from Craft settings)

### Development

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Build for production
bun build
```

### Deployment

This project is configured to run on Vercel with the Bun runtime:

1. Push to GitHub
2. Import to Vercel
3. Deploy (no configuration needed - `vercel.json` handles Bun setup)

## Architecture

### Privacy-First Proxy

To avoid CORS issues, API requests are proxied through a Next.js API route (`/api/craft/[...path]`). Your API credentials are:
- Stored in browser `localStorage` only
- Passed via request headers (never stored on server)
- Never logged or persisted server-side

The proxy simply forwards requests with your credentials and returns responses - no data is retained.

### Reusable Graph Library

The core graph processing logic lives in `lib/graph/` and is framework-agnostic. Craft developers can extract and use this library independently:

```typescript
import { createFetcher } from './lib/graph'

const fetcher = createFetcher(apiUrl)
const graph = await fetcher.buildGraph({
  onProgress: (current, total, message) => {
    console.log(`${current}/${total}: ${message}`)
  }
})
```

## Project Structure

```
lib/graph/          # Standalone graph library
├── types.ts        # TypeScript types
├── parser.ts       # Link extraction and graph building
├── fetcher.ts      # Craft API client
└── index.ts        # Public exports

components/
├── graph/          # Graph visualization components
└── setup/          # API setup form

app/
├── page.tsx        # Landing page
└── graph/          # Graph visualization page
```

## How It Works

1. **Fetch Documents**: Retrieves all documents from your Craft space
2. **Extract Links**: Parses markdown content for `block://` links
3. **Build Graph**: Creates nodes and edges from document relationships
4. **Visualize**: Renders interactive force-directed graph

## Tech Stack

- **Runtime**: Next.js 16 on Bun (via Vercel)
- **Graph**: react-force-graph-2d
- **UI**: shadcn/ui with Craft-inspired design
- **Analytics**: Vercel Analytics

## Security

- API credentials (URL and key) stored in browser `localStorage` only
- Credentials passed via headers, never stored on server
- Proxy route forwards requests without logging or persistence
- No database, no data retention

## License

MIT

## Contributing

Built for the Craft hackathon. Contributions welcome!
