---
description: Graft - Craft document graph visualization project
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# Graft - Craft Document Graph Visualization

For comprehensive project documentation, see **[CLAUDE.md](CLAUDE.md)** in the project root.

## Quick Links

- **[Main Documentation](CLAUDE.md)** - Project overview, architecture, getting started
- **[Graph Library Internals](lib/graph/CLAUDE.md)** - Link/tag/folder extraction, caching, graph building
- **[Visualization Components](components/graph/CLAUDE.md)** - Color systems, bloom mode, 2D/3D rendering

## Quick Reference

### Commands
```bash
bun dev          # Start development server
bun build        # Build for production
bun lint         # Run ESLint
```

### Key Paths
- Main directory: `/Users/pavel/_code/craft-docs/graft-do`
- Graph library: `lib/graph/` (framework-agnostic, reusable)
- Components: `components/graph/` (React visualization)
- API proxy: `app/api/craft/[...path]/` (privacy-first CORS proxy)

### Tech Stack
- Next.js 16 on Bun runtime
- react-force-graph-2d & react-force-graph-3d
- shadcn/ui + Tailwind CSS 4
- IndexedDB for client-side caching

See [CLAUDE.md](CLAUDE.md) for detailed documentation.
