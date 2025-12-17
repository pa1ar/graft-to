"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { GraphData, GraphNode, GraphLink } from "@/lib/graph"

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
  linkHighlight: "#fbbf24",
  node: "#9ca3af",
  nodeHighlight: "#fbbf24",
}

const DARK_THEME: ThemeColors = {
  background: "#020617",
  link: "#475569",
  linkHighlight: "#f59e0b",
  node: "#6b7280",
  nodeHighlight: "#f59e0b",
}

const THEME_EVENT = "graft:theme-change"

const getInitialTheme = (): ThemeMode => {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

interface ForceGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  width?: number
  height?: number
}

// Stable internal graph data that persists node positions
interface InternalGraphData {
  nodes: (GraphNode & { x?: number; y?: number; vx?: number; vy?: number })[]
  links: GraphLink[]
}

export function ForceGraph({ data, onNodeClick, width, height }: ForceGraphProps) {
  const graphRef = React.useRef<any>(null)
  const [theme, setTheme] = React.useState<ThemeMode>(() => getInitialTheme())
  const [hoveredNode, setHoveredNode] = React.useState<GraphNode | null>(null)
  const [zoomLevel, setZoomLevel] = React.useState<number>(1)
  
  // Maintain stable graph data - single source of truth
  const stableDataRef = React.useRef<InternalGraphData>({ nodes: [], links: [] })
  const nodeMapRef = React.useRef<Map<string, any>>(new Map())
  const linkSetRef = React.useRef<Set<string>>(new Set())
  
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
    
    // Clean up links that reference removed nodes
    stableData.links = stableData.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target
      const linkKey = `${sourceId}-${targetId}`
      
      if (!currentNodeMap.has(sourceId) || !currentNodeMap.has(targetId)) {
        currentLinkSet.delete(linkKey)
        return false
      }
      return true
    })
  }, [data])

  React.useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force("charge").strength(-100)
      graphRef.current.d3Force("link").distance(50)
    }
  }, [])

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

  const colors = theme === "dark" ? DARK_THEME : LIGHT_THEME

  // Check if a link is connected to the hovered node
  const isLinkHighlighted = (link: any) => {
    if (!hoveredNode) return false
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    return sourceId === hoveredNode.id || targetId === hoveredNode.id
  }

  // Node color function
  const getNodeColor = (node: any) => {
    return hoveredNode && node.id === hoveredNode.id
      ? colors.nodeHighlight
      : colors.node
  }

  // Link color function
  const getLinkColor = (link: any) => {
    return isLinkHighlighted(link) ? colors.linkHighlight : colors.link
  }

  // Draw labels based on zoom level
  const drawNodeLabel = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Show labels when zoomed in (zoom > 1.5)
    const minZoomForLabels = 1.5
    if (globalScale < minZoomForLabels) return

    // Calculate opacity based on zoom level for smooth fade-in
    const opacity = Math.min(1, (globalScale - minZoomForLabels) / 0.5)
    
    const label = node.title
    const fontSize = 12 / globalScale
    ctx.font = `${fontSize}px Sans-Serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Draw text with fade-in opacity
    ctx.fillStyle = `rgba(${theme === 'dark' ? '229, 231, 235' : '31, 41, 55'}, ${opacity})`
    ctx.fillText(label, node.x, node.y + 12)
  }

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={stableDataRef.current}
      width={width}
      height={height}
      nodeId="id"
      linkSource="source"
      linkTarget="target"
      nodeLabel={(node: any) => node.title}
      nodeColor={getNodeColor}
      nodeRelSize={4}
      nodeVal={(node: any) => Math.max(2, node.linkCount * 0.8)}
      linkColor={getLinkColor}
      linkWidth={(link: any) => isLinkHighlighted(link) ? 3 : 1.5}
      linkDirectionalParticles={0}
      onNodeHover={(node: any) => setHoveredNode(node)}
      onNodeClick={(node: any) => onNodeClick?.(node as GraphNode)}
      onZoom={(transform: any) => setZoomLevel(transform.k)}
      nodeCanvasObject={drawNodeLabel}
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
}

