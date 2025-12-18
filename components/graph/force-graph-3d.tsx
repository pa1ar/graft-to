"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { GraphData, GraphNode, GraphLink } from "@/lib/graph"

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
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

interface ForceGraph3DProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  onBackgroundClick?: () => void
  selectedNode?: GraphNode | null
  width?: number
  height?: number
}

interface InternalGraphData {
  nodes: (GraphNode & { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number })[]
  links: GraphLink[]
}

export function ForceGraph3DComponent({ data, onNodeClick, onBackgroundClick, selectedNode, width, height }: ForceGraph3DProps) {
  const graphRef = React.useRef<any>(null)
  const [theme, setTheme] = React.useState<ThemeMode>(() => getInitialTheme())
  const [hoveredNode, setHoveredNode] = React.useState<GraphNode | null>(null)
  
  const stableDataRef = React.useRef<InternalGraphData>({ nodes: [], links: [] })
  const nodeMapRef = React.useRef<Map<string, any>>(new Map())
  const linkSetRef = React.useRef<Set<string>>(new Set())
  const [graphDataState, setGraphDataState] = React.useState<InternalGraphData>({ nodes: [], links: [] })
  const spriteMapRef = React.useRef<Map<string, any>>(new Map())
  const [SpriteText, setSpriteText] = React.useState<any>(null)
  const cameraDistanceRef = React.useRef<number>(1000)

  // Load SpriteText dynamically
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      import("three-spritetext").then((module) => {
        setSpriteText(() => module.default)
      })
    }
  }, [])
  
  // Update stable data incrementally
  React.useEffect(() => {
    const currentNodeMap = nodeMapRef.current
    const currentLinkSet = linkSetRef.current
    const stableData = stableDataRef.current
    
    const incomingNodeIds = new Set(data.nodes.map(n => n.id))
    
    for (const node of data.nodes) {
      if (!currentNodeMap.has(node.id)) {
        const newNode = { ...node }
        currentNodeMap.set(node.id, newNode)
        stableData.nodes.push(newNode)
      } else {
        const existingNode = currentNodeMap.get(node.id)
        existingNode.title = node.title
        existingNode.linkCount = node.linkCount
        existingNode.color = node.color
        existingNode.type = node.type
      }
    }
    
    stableData.nodes = stableData.nodes.filter(node => {
      if (!incomingNodeIds.has(node.id)) {
        currentNodeMap.delete(node.id)
        return false
      }
      return true
    })
    
    const incomingLinkKeys = new Set(data.links.map(l => `${l.source}-${l.target}`))
    
    for (const link of data.links) {
      const linkKey = `${link.source}-${link.target}`
      if (!currentLinkSet.has(linkKey)) {
        if (currentNodeMap.has(link.source) && currentNodeMap.has(link.target)) {
          currentLinkSet.add(linkKey)
          stableData.links.push({ ...link })
        }
      }
    }
    
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
    
    setGraphDataState({
      nodes: [...stableData.nodes],
      links: [...stableData.links],
    })
  }, [data])

  React.useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force("charge").strength(-200)
      graphRef.current.d3Force("link").distance(100)
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

  const getActiveNode = (): GraphNode | null => {
    return selectedNode || hoveredNode
  }

  const isLinkHighlighted = (link: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return true
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    return sourceId === activeNode.id || targetId === activeNode.id
  }

  const getNodeColor = (node: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return colors.node
    
    if (node.id === activeNode.id) {
      return colors.nodeHighlight
    }
    
    return colors.node
  }

  const getLinkColor = (link: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return colors.link
    
    if (isLinkHighlighted(link)) {
      return colors.linkHighlight
    }
    
    return colors.link
  }

  const getLinkWidth = (link: any) => {
    const activeNode = getActiveNode()
    if (!activeNode) return 1
    
    if (isLinkHighlighted(link)) {
      return 2
    }
    
    return 1
  }

  // Create 3D text sprites using SpriteText
  const nodeThreeObject = React.useCallback((node: any) => {
    if (typeof window === "undefined" || !SpriteText) return undefined
    
    const sprite = new SpriteText(node.title)
    sprite.color = colors.node // Use base color initially, updated by effect
    sprite.textHeight = 8
    sprite.center.y = -0.6
    sprite.backgroundColor = false // Remove background rectangles
    
    // Make text transparent initially, visibility updated by camera tracking
    sprite.material.transparent = true
    sprite.material.opacity = cameraDistanceRef.current < 800 ? 1 : 0
    
    // Store reference for camera distance updates
    spriteMapRef.current.set(node.id, sprite)
    
    return sprite
  }, [colors])

  // Update sprite colors when theme or selection changes (without triggering camera movement)
  React.useEffect(() => {
    spriteMapRef.current.forEach((sprite, nodeId) => {
      const node = graphDataState.nodes.find(n => n.id === nodeId)
      if (node) {
        sprite.color = getNodeColor(node)
      }
    })
  }, [theme, hoveredNode, selectedNode, graphDataState.nodes, colors])

  // Clean up sprites when nodes are removed
  React.useEffect(() => {
    const currentNodeIds = new Set(graphDataState.nodes.map(n => n.id))
    const spritesToRemove: string[] = []
    
    spriteMapRef.current.forEach((_, nodeId) => {
      if (!currentNodeIds.has(nodeId)) {
        spritesToRemove.push(nodeId)
      }
    })
    
    spritesToRemove.forEach(nodeId => {
      spriteMapRef.current.delete(nodeId)
    })
  }, [graphDataState.nodes])

  // Track camera distance and update label visibility based on zoom
  React.useEffect(() => {
    if (!graphRef.current) return
    
    const updateLabelVisibility = () => {
      const camera = graphRef.current?.camera()
      if (!camera) return
      
      const distance = camera.position.length()
      cameraDistanceRef.current = distance
      
      // Show labels when zoomed in (distance < 800), hide when zoomed out
      const showLabels = distance < 800
      const targetOpacity = showLabels ? 1 : 0
      
      spriteMapRef.current.forEach((sprite) => {
        if (sprite.material.opacity !== targetOpacity) {
          sprite.material.opacity = targetOpacity
        }
      })
    }
    
    // Update on animation frames for smooth visibility transitions
    const intervalId = setInterval(updateLabelVisibility, 100)
    
    return () => clearInterval(intervalId)
  }, [graphDataState.nodes])

  return (
    <ForceGraph3D
      ref={graphRef}
      graphData={graphDataState}
      width={width}
      height={height}
      nodeId="id"
      linkSource="source"
      linkTarget="target"
      nodeLabel={(node: any) => node.title}
      nodeColor={getNodeColor}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={true}
      linkColor={getLinkColor}
      linkWidth={getLinkWidth}
      linkDirectionalParticles={0}
      onNodeHover={(node: any) => setHoveredNode(node)}
      onNodeClick={(node: any) => onNodeClick?.(node as GraphNode)}
      onBackgroundClick={() => onBackgroundClick?.()}
      backgroundColor={colors.background}
      cooldownTicks={100}
      warmupTicks={50}
    />
  )
}

