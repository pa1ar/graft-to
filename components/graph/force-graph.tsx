"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { GraphData, GraphNode, GraphLink } from "@/lib/graph"
import {
  buildAdjacencyIndex,
  isNodeConnected as checkNodeConnected,
  isLinkHighlighted as checkLinkHighlighted,
  hexToRgba,
  type AdjacencyIndex,
} from "@/lib/graph/interaction"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
})

type ThemeMode = "light" | "dark"
type ThemeColors = {
  background: string
  link: string
  linkHighlight: string
  node: string
  nodeHighlight: string
}

const LIGHT_THEME: ThemeColors = {
  background: "#ffffff",
  link: "#cbd5e1",
  linkHighlight: "#1e293b",
  node: "#9ca3af",
  nodeHighlight: "#fbbf24",
}

const DARK_THEME: ThemeColors = {
  background: "#020617",
  link: "#475569",
  linkHighlight: "#64748b",
  node: "#6b7280",
  nodeHighlight: "#f59e0b",
}

const THEME_EVENT = "graft:theme-change"

// custom boundary force that pulls nodes inward when they exceed max radius
function createBoundaryForce(boundaryRadius: number) {
  let nodes: any[] = []

  function force() {
    for (const node of nodes) {
      const dist = Math.sqrt((node.x || 0) ** 2 + (node.y || 0) ** 2)
      if (dist > boundaryRadius) {
        // push toward center, strength increases with distance
        const k = (dist - boundaryRadius) * 0.01
        node.vx -= (node.x / dist) * k
        node.vy -= (node.y / dist) * k
      }
    }
  }

  force.initialize = (n: any[]) => { nodes = n }
  return force
}

const getInitialTheme = (): ThemeMode => {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

const getResolvedBackground = () => {
  if (typeof document === "undefined") return null
  const raw = getComputedStyle(document.body).getPropertyValue("background-color").trim()
  if (!raw) return null
  const isCssColor = /^#|^rgb|^hsl/i.test(raw)
  return isCssColor ? raw : null
}

interface ForceGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  onBackgroundClick?: () => void
  selectedNode?: GraphNode | null
  width?: number
  height?: number
  showLabels?: boolean
}

export interface ForceGraphRef {
  recenter: () => void
}

// Stable internal graph data that persists node positions
interface InternalGraphData {
  nodes: (GraphNode & { x?: number; y?: number; vx?: number; vy?: number })[]
  links: GraphLink[]
}

export const ForceGraph = React.forwardRef<ForceGraphRef, ForceGraphProps>(
  ({ data, onNodeClick, onBackgroundClick, selectedNode, width, height, showLabels = false }, ref) => {
  const graphRef = React.useRef<any>(null)
  const [theme, setTheme] = React.useState<ThemeMode>(() => getInitialTheme())
  const [hoveredNode, setHoveredNode] = React.useState<GraphNode | null>(null)
  const [zoomLevel, setZoomLevel] = React.useState<number>(1)
  const [muteOpacity, setMuteOpacity] = React.useState<number>(1)
  const animationFrameRef = React.useRef<number | null>(null)
  const currentOpacityRef = React.useRef<number>(1)
  const zoomUpdateFrameRef = React.useRef<number | null>(null)
  
  // Maintain stable graph data - single source of truth
  const stableDataRef = React.useRef<InternalGraphData>({ nodes: [], links: [] })
  const nodeMapRef = React.useRef<Map<string, any>>(new Map())
  const linkSetRef = React.useRef<Set<string>>(new Set())
  const [graphDataState, setGraphDataState] = React.useState<InternalGraphData>({ nodes: [], links: [] })
  
  // Update stable data incrementally without recreating the object
  React.useEffect(() => {
    const currentNodeMap = nodeMapRef.current
    const currentLinkSet = linkSetRef.current
    const stableData = stableDataRef.current
    
    // Track which nodes we should have
    const incomingNodeIds = new Set(data.nodes.map(n => n.id))
    
    // Add or update nodes incrementally
    for (const node of data.nodes) {
      if (!currentNodeMap.has(node.id)) {
        // New node - add it to the array and map
        const newNode = { ...node }
        currentNodeMap.set(node.id, newNode)
        stableData.nodes.push(newNode)
      } else {
        // Existing node - update its properties (but keep x, y, vx, vy)
        const existingNode = currentNodeMap.get(node.id)
        existingNode.title = node.title
        existingNode.linkCount = node.linkCount
        existingNode.color = node.color
        existingNode.type = node.type
      }
    }
    
    // Remove nodes that are no longer in the data
    stableData.nodes = stableData.nodes.filter(node => {
      if (!incomingNodeIds.has(node.id)) {
        currentNodeMap.delete(node.id)
        return false
      }
      return true
    })
    
    // Track incoming links
    const incomingLinkKeys = new Set(data.links.map(l => `${l.source}-${l.target}`))
    
    // Add new links incrementally
    for (const link of data.links) {
      const linkKey = `${link.source}-${link.target}`
      if (!currentLinkSet.has(linkKey)) {
        // Only add if both nodes exist
        if (currentNodeMap.has(link.source) && currentNodeMap.has(link.target)) {
          currentLinkSet.add(linkKey)
          stableData.links.push({ ...link })
        }
      }
    }
    
    // Clean up links that reference removed nodes or are no longer in data
    stableData.links = stableData.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target
      const linkKey = `${sourceId}-${targetId}`
      
      if (!currentNodeMap.has(sourceId) || !currentNodeMap.has(targetId) || !incomingLinkKeys.has(linkKey)) {
        currentLinkSet.delete(linkKey)
        return false
      }
      return true
    })
    
    // Force re-render by creating a new object reference
    // react-force-graph needs a new reference to detect changes and re-render
    // We create new arrays but keep the same node objects to preserve positions (x, y, vx, vy)
    setGraphDataState({
      nodes: [...stableData.nodes],
      links: [...stableData.links],
    })
  }, [data])

  React.useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force("charge").strength(-100)
      graphRef.current.d3Force("link").distance(50)

      // add boundary force to keep disconnected nodes from drifting too far
      const nodeCount = graphDataState.nodes.length
      const boundaryRadius = Math.max(300, Math.sqrt(nodeCount) * 30)
      graphRef.current.d3Force("boundary", createBoundaryForce(boundaryRadius))
    }
  }, [graphDataState.nodes.length])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const updateTheme = () => setTheme(getInitialTheme())
    const handleThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<ThemeMode>).detail
      if (detail) {
        setTheme(detail)
      } else {
        updateTheme()
      }
    }

    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    window.addEventListener(THEME_EVENT, handleThemeEvent as EventListener)

    return () => {
      observer.disconnect()
      window.removeEventListener(THEME_EVENT, handleThemeEvent as EventListener)
    }
  }, [])

  // Smooth opacity transition when hover or selection state changes
  React.useEffect(() => {
    // Set target opacity: 0.5 when hovering or selecting, 1.0 when not
    const activeNode = selectedNode || hoveredNode
    const targetOpacity = activeNode ? 0.5 : 1.0

    // Easing function for smooth transition (ease-in-out)
    const easeInOut = (t: number): number => {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    }

    const startTime = performance.now()
    const duration = 300 // 300ms transition
    const startOpacity = currentOpacityRef.current

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeInOut(progress)
      
      const newOpacity = startOpacity + (targetOpacity - startOpacity) * easedProgress
      currentOpacityRef.current = newOpacity
      setMuteOpacity(newOpacity)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        currentOpacityRef.current = targetOpacity
        setMuteOpacity(targetOpacity)
      }
    }

    // Cancel any existing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [hoveredNode, selectedNode])

  // Cleanup zoom update frame on unmount
  React.useEffect(() => {
    return () => {
      if (zoomUpdateFrameRef.current !== null) {
        cancelAnimationFrame(zoomUpdateFrameRef.current)
      }
    }
  }, [])

  const colors = React.useMemo(() => {
    const base = theme === "dark" ? DARK_THEME : LIGHT_THEME
    const resolvedBackground = getResolvedBackground()
    return { ...base, background: resolvedBackground ?? base.background }
  }, [theme])

  // O(1) adjacency lookup — rebuilt only when links change
  const adjacencyIndex = React.useMemo<AdjacencyIndex>(
    () => buildAdjacencyIndex(graphDataState.links),
    [graphDataState.links]
  )

  const activeNodeId = (selectedNode || hoveredNode)?.id ?? null

  // Stable color/width callbacks — only update when dependencies actually change
  const getNodeColor = React.useCallback((node: any) => {
    if (node.type === 'tag' || node.type === 'folder') {
      if (!activeNodeId) return node.color
      if (!checkNodeConnected(node.id, activeNodeId, adjacencyIndex)) {
        return hexToRgba(node.color, muteOpacity)
      }
      return node.color
    }

    if (!activeNodeId) return colors.node
    if (node.id === activeNodeId) return colors.nodeHighlight
    if (!checkNodeConnected(node.id, activeNodeId, adjacencyIndex)) {
      return hexToRgba(colors.node, muteOpacity)
    }
    return colors.node
  }, [activeNodeId, adjacencyIndex, muteOpacity, colors.node, colors.nodeHighlight])

  const getLinkColor = React.useCallback((link: any) => {
    if (!activeNodeId) return colors.link
    if (checkLinkHighlighted(link, activeNodeId)) return colors.linkHighlight
    return hexToRgba(colors.link, muteOpacity)
  }, [activeNodeId, muteOpacity, colors.link, colors.linkHighlight])

  const getLinkWidth = React.useCallback((link: any) => {
    if (!activeNodeId) return 1
    return checkLinkHighlighted(link, activeNodeId) ? 2 : 1
  }, [activeNodeId])

  // Expose recenter method via ref
  React.useImperativeHandle(ref, () => ({
    recenter: () => {
      if (graphRef.current) {
        graphRef.current.zoomToFit(400, 50)
      }
    },
  }), [])

  // Draw labels based on showLabels prop
  const drawNodeLabel = React.useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!showLabels) return

    let opacity = 1
    if (activeNodeId && !checkNodeConnected(node.id, activeNodeId, adjacencyIndex)) {
      opacity *= muteOpacity
    }

    const label = node.title
    const fontSize = 12 / globalScale
    ctx.font = `${fontSize}px Sans-Serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.fillStyle = `rgba(${theme === 'dark' ? '229, 231, 235' : '31, 41, 55'}, ${opacity})`
    ctx.fillText(label, node.x, node.y + 12)
  }, [showLabels, activeNodeId, adjacencyIndex, muteOpacity, theme])

  // throttled hover — limit state updates to once per 50ms
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHoverRef = React.useRef<GraphNode | null>(null)
  const handleNodeHover = React.useCallback((node: any) => {
    pendingHoverRef.current = node
    if (hoverTimerRef.current === null) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredNode(pendingHoverRef.current)
        hoverTimerRef.current = null
      }, 50)
    }
  }, [])

  // cleanup hover timer on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const handleNodeClick = React.useCallback((node: any) => {
    onNodeClick?.(node as GraphNode)
  }, [onNodeClick])

  const handleBackgroundClick = React.useCallback(() => {
    onBackgroundClick?.()
  }, [onBackgroundClick])

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={graphDataState}
      width={width}
      height={height}
      nodeId="id"
      linkSource="source"
      linkTarget="target"
      nodeLabel={(node: any) => node.title}
      nodeColor={getNodeColor}
      nodeRelSize={4}
      nodeVal={(node: any) => (node.nodeSize || 1) * 2}
      linkColor={getLinkColor}
      linkWidth={getLinkWidth}
      linkDirectionalParticles={0}
      onNodeHover={handleNodeHover}
      onNodeClick={handleNodeClick}
      onBackgroundClick={handleBackgroundClick}
      onZoom={(transform: any) => {
        // Defer state update to avoid updating during render
        if (zoomUpdateFrameRef.current !== null) {
          cancelAnimationFrame(zoomUpdateFrameRef.current)
        }
        zoomUpdateFrameRef.current = requestAnimationFrame(() => {
          setZoomLevel(transform.k)
          zoomUpdateFrameRef.current = null
        })
      }}
      nodeCanvasObject={showLabels ? drawNodeLabel : undefined}
      nodeCanvasObjectMode={() => 'after'}
      backgroundColor={colors.background}
      cooldownTicks={100}
      warmupTicks={50}
      onEngineStop={() => {
        if (graphRef.current) {
          graphRef.current.zoomToFit(400, 50)
        }
      }}
    />
  )
})

ForceGraph.displayName = "ForceGraph"

