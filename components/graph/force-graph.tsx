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

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // Get the active node (selected takes precedence over hovered)
  const getActiveNode = (): GraphNode | null => {
    return selectedNode || hoveredNode
  }

  // Check if a node is connected to the active node
  const isNodeConnected = (nodeId: string): boolean => {
    const activeNode = getActiveNode()
    if (!activeNode) return true
    if (nodeId === activeNode.id) return true
    
    // Check if node is connected via any link
    return graphDataState.links.some((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source
      const targetId = typeof link.target === 'object' ? link.target.id : link.target
      return (sourceId === activeNode.id && targetId === nodeId) ||
             (targetId === activeNode.id && sourceId === nodeId)
    })
  }

  // Check if a link is connected to the active node
  const isLinkHighlighted = (link: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return true
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    return sourceId === activeNode.id || targetId === activeNode.id
  }

  // Node color function
  const getNodeColor = (node: any) => {
    // Use node's color property for tags/folders
    if (node.color) {
      const activeNode = getActiveNode()
      if (!activeNode) return node.color

      if (node.id === activeNode.id) {
        return colors.nodeHighlight
      }

      if (!isNodeConnected(node.id)) {
        return hexToRgba(node.color, muteOpacity)
      }

      return node.color
    }

    // Default color logic for document/block nodes
    const activeNode = getActiveNode()
    if (!activeNode) return colors.node

    if (node.id === activeNode.id) {
      return colors.nodeHighlight
    }

    // Mute nodes that aren't connected to the active node
    if (!isNodeConnected(node.id)) {
      return hexToRgba(colors.node, muteOpacity)
    }

    return colors.node
  }

  // Link color function
  const getLinkColor = (link: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return colors.link
    
    if (isLinkHighlighted(link)) {
      return colors.linkHighlight
    }
    
    // Mute links that aren't connected to the active node
    return hexToRgba(colors.link, muteOpacity)
  }

  // Link width function
  const getLinkWidth = (link: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return 1
    
    if (isLinkHighlighted(link)) {
      return 2
    }
    
    return 1
  }

  // Expose recenter method via ref
  React.useImperativeHandle(ref, () => ({
    recenter: () => {
      if (graphRef.current) {
        graphRef.current.zoomToFit(400, 50)
      }
    },
  }), [])

  // Draw labels based on showLabels prop
  const drawNodeLabel = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Only show labels if showLabels is enabled
    if (!showLabels) return

    // Calculate opacity - mute label opacity for nodes not connected to active node
    let opacity = 1
    const activeNode = getActiveNode()
    if (activeNode && !isNodeConnected(node.id)) {
      opacity *= muteOpacity
    }
    
    const label = node.title
    const fontSize = 12 / globalScale
    ctx.font = `${fontSize}px Sans-Serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Draw text with opacity
    ctx.fillStyle = `rgba(${theme === 'dark' ? '229, 231, 235' : '31, 41, 55'}, ${opacity})`
    ctx.fillText(label, node.x, node.y + 12)
  }

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
      onNodeHover={(node: any) => setHoveredNode(node)}
      onNodeClick={(node: any) => onNodeClick?.(node as GraphNode)}
      onBackgroundClick={() => onBackgroundClick?.()}
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

