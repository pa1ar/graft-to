# Graph Visualization Components

This directory contains React components for 2D and 3D graph visualization using react-force-graph.

## Components

- **`force-graph.tsx`** - 2D graph visualization with react-force-graph-2d
- **`force-graph-3d.tsx`** - 3D graph visualization with react-force-graph-3d
- **`graph-controls.tsx`** - Connection settings, refresh, stats panel
- **`node-preview.tsx`** - Node detail view with relationships

## Node Color System

### Normal Mode (2D & 3D)

**Documents:**
- Grey (`#94a3b8`) when inactive
- Yellow (`#fbbf24`) when hovered or selected
- Opacity muted when not connected to active node

**Tags:**
- Always green (`#34d399`) regardless of state
- Helps identify tags at a glance
- 2x size for visibility

**Folders:**
- Always blue (`#60a5fa`) regardless of state
- Distinguishes folders from documents
- 2x size for visibility

**Implementation (force-graph.tsx:290, force-graph-3d.tsx:328):**
```typescript
const getNodeColor = (node: any) => {
  // Tags and folders: always use custom color
  if (node.type === 'tag' || node.type === 'folder') {
    return node.color;
  }

  // Documents: grey normally, yellow when active
  const activeNode = getActiveNode();
  if (!activeNode) return colors.node;
  if (node.id === activeNode.id) return colors.nodeHighlight;
  return colors.node;
}
```

### Bloom Mode (3D Only)

Bloom mode uses **ranking-based percentile colorization** for balanced rainbow distribution.

**Why Percentile-Based:**
- Fixed thresholds (0-2, 3-5, 6-8+) fail with skewed distributions
- Equal-range segments concentrate all nodes in one color
- Percentile-based ensures ~16-17% of nodes per color
- Creates visually balanced rainbow regardless of actual link count distribution

**Algorithm:**
1. Get all document nodes (exclude tags/folders)
2. Sort by `linkCount` ascending
3. Divide into 6 equal groups based on position in sorted list
4. Assign colors: Purple → Deep Blue → Light Blue → Green → Orange → Red
5. Pre-calculate color map for O(1) lookup

**Colors:**
- Purple (`#a855f7`) - Lowest 16% (least connected)
- Deep Blue (`#1e40af`) - 16-33%
- Light Blue (`#60a5fa`) - 33-50%
- Green (`#34d399`) - 50-67%
- Orange (`#f97316`) - 67-83%
- Red (`#ef4444`) - Top 17% (most connected)

**Tags and folders keep their custom colors even in bloom mode.**

**Implementation (force-graph-3d.tsx:90-121):**
```typescript
const bloomColorMap = React.useMemo(() => {
  const colorMap = new Map<string, string>();
  const documentNodes = graphDataState.nodes.filter(
    n => n.type === 'document' || n.type === 'block'
  );

  const sorted = [...documentNodes].sort(
    (a, b) => (a.linkCount || 0) - (b.linkCount || 0)
  );

  const colors = ['#a855f7', '#1e40af', '#60a5fa', '#34d399', '#f97316', '#ef4444'];
  const nodesPerColor = Math.ceil(sorted.length / 6);

  sorted.forEach((node, index) => {
    const colorIndex = Math.min(Math.floor(index / nodesPerColor), 5);
    colorMap.set(node.id, colors[colorIndex]);
  });

  return colorMap;
}, [graphDataState.nodes]);
```

## Node Sizing

### 2D Mode (force-graph.tsx:375)
```typescript
nodeVal={(node: any) => (node.nodeSize || 1) * 2}
```

- Documents: Base size (1) × 2 = 2
- Tags/Folders: nodeSize (2) × 2 = 4

### 3D Mode (force-graph-3d.tsx:622-626)
```typescript
nodeVal={(node: any) => {
  if (node.type === 'tag' || node.type === 'folder') return 2;
  return 1;
}}
```

- Documents: 1
- Tags/Folders: 2 (2x larger)

**Why Different?**
- 2D uses `nodeRelSize` parameter, so multiply by 2
- 3D uses direct sizing

**Sprite Labels (3D):**
Text labels scale with node size for consistency:
```typescript
const nodeSize = (node.type === 'tag' || node.type === 'folder') ? 2 : 1;
sprite.textHeight = 8 * nodeSize;
sprite.center.y = -0.6 * nodeSize;
```

## Tag and Folder Visualization

### Visual Design
- **Tags**: Green (`#34d399`), 2x size, title format: `#tagname`
- **Folders**: Blue (`#60a5fa`), 2x size, title format: folder path
- **Star topology**: Connect to all related documents

### Client-Side Filtering

**Design Decision:** Always fetch tags and folders, filter on client side.

**Why:**
- Instant toggle response (no loading state)
- Avoids cache invalidation
- Simpler state management
- Better user experience

**Implementation (app/page.tsx):**
```typescript
const filteredGraphData = React.useMemo(() => {
  if (!graphData) return null;

  const nodes = graphData.nodes.filter(node => {
    if (node.type === 'tag') return showTags;
    if (node.type === 'folder') return showFolders;
    return true; // Always show documents
  });

  const links = showWikilinks
    ? graphData.links.filter(/* link filtering */)
    : [];

  return { nodes, links };
}, [graphData, showWikilinks, showTags, showFolders]);
```

**State Management:**
- `showWikilinks` - default: true (localStorage key: `graft_show_wikilinks`)
- `showTags` - default: false (localStorage key: `graft_show_tags`)
- `showFolders` - default: false (localStorage key: `graft_show_folders`)

### UI Controls (graph-controls.tsx)

"Linking Type" section in Customize panel with 3 toggles:
- **Wikilinks** - Document-to-document links (enabled by default)
- **Tags** - Hashtag-based connections (optional)
- **Folders** - Folder-based grouping (optional)

All three can be enabled simultaneously.

## Theme System

### Colors (LIGHT_THEME / DARK_THEME)
```typescript
const LIGHT_THEME = {
  background: "#ffffff",
  link: "#cbd5e1",
  linkHighlight: "#1e293b",
  node: "#9ca3af",          // Grey for inactive documents
  nodeHighlight: "#fbbf24", // Yellow for active documents
}

const DARK_THEME = {
  background: "#020617",
  link: "#475569",
  linkHighlight: "#64748b",
  node: "#6b7280",
  nodeHighlight: "#f59e0b",
}
```

### Theme Detection
- Reads from `document.documentElement.classList.contains('dark')`
- Listens for `graft:theme-change` custom events
- Uses `MutationObserver` for automatic updates
- Resolves actual background color from CSS for accuracy

### Special Modes

**New Year Mode (3D):**
- Colorful display using node's color property
- Dark background (`#000003`)
- Bloom effect disabled

**Bloom Mode (3D):**
- Dark background (`#000003`)
- UnrealBloomPass post-processing
- Ranking-based rainbow colorization
- Labels excluded from bloom (layer 1)

## Position Stability

The force-graph components maintain stable node positions across updates:

**Strategy:**
- Use stable data references (`stableDataRef`)
- Track nodes by ID in `nodeMapRef`
- Update properties without recreating objects
- Preserve `x, y, z, vx, vy, vz` physics properties

**Implementation (force-graph-3d.tsx:116-173):**
```typescript
const stableDataRef = React.useRef<InternalGraphData>({ nodes: [], links: [] });
const nodeMapRef = React.useRef<Map<string, any>>(new Map());

React.useEffect(() => {
  for (const node of data.nodes) {
    if (!nodeMapRef.has(node.id)) {
      // New node - add it
      const newNode = { ...node };
      nodeMapRef.set(node.id, newNode);
      stableData.nodes.push(newNode);
    } else {
      // Existing node - update properties, keep position
      const existingNode = nodeMapRef.get(node.id);
      existingNode.title = node.title;
      existingNode.linkCount = node.linkCount;
      existingNode.color = node.color;
      existingNode.type = node.type;
      // x, y, z, vx, vy, vz remain unchanged
    }
  }
}, [data]);
```

**Why:** Prevents graph from "jumping" when toggling filters or updating data.

## Force Simulation Settings

### 2D (force-graph.tsx:161-164)
```typescript
graphRef.current.d3Force("charge").strength(-100);
graphRef.current.d3Force("link").distance(50);
```

### 3D (force-graph-3d.tsx:176-179)
```typescript
graphRef.current.d3Force("charge").strength(-200);
graphRef.current.d3Force("link").distance(100);
```

**3D has stronger forces and larger distances for better spatial distribution.**

## Performance Considerations

### Bloom Pass Pre-loading (3D)
UnrealBloomPass is pre-loaded to prevent flash when enabling bloom mode:

```typescript
React.useEffect(() => {
  if (typeof window !== "undefined") {
    import("three/examples/jsm/postprocessing/UnrealBloomPass.js").then(
      (module) => {
        UnrealBloomPassRef.current = module.UnrealBloomPass;
      }
    );
  }
}, []);
```

### Sprite Management (3D)
- Sprites only created when `showLabels` is true
- Cleaned up when labels disabled or nodes removed
- References tracked in `spriteMapRef` for efficient updates

### Memoization
- `bloomColorMap` memoized and only recalculates when nodes change
- `filteredGraphData` memoized for client-side filtering
- Color functions use `React.useCallback` to prevent re-renders

## Common Patterns

### Hex to RGBA Conversion (for opacity muting)
```typescript
const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

### Node Connection Check
```typescript
const isNodeConnected = (nodeId: string): boolean => {
  const activeNode = getActiveNode();
  if (!activeNode) return true;
  if (nodeId === activeNode.id) return true;

  return links.some(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    return (sourceId === activeNode.id && targetId === nodeId) ||
           (targetId === activeNode.id && sourceId === nodeId);
  });
}
```

### Recenter Camera
Both 2D and 3D components expose `recenter()` method via ref:
- **2D**: `graphRef.current.zoomToFit(400, 50)`
- **3D**: Calculates bounding box and positions camera accordingly
