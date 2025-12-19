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

const getResolvedBackground = () => {
  if (typeof document === "undefined") return null
  const raw = getComputedStyle(document.body).getPropertyValue("background-color").trim()
  if (!raw) return null
  const isCssColor = /^#|^rgb|^hsl/i.test(raw)
  return isCssColor ? raw : null
}

interface ForceGraph3DProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  onBackgroundClick?: () => void
  selectedNode?: GraphNode | null
  width?: number
  height?: number
  isOrbiting?: boolean
  orbitSpeed?: number
  newYearMode?: boolean
  bloomMode?: boolean
  showLabels?: boolean
}

interface InternalGraphData {
  nodes: (GraphNode & { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number })[]
  links: GraphLink[]
}

export function ForceGraph3DComponent({ data, onNodeClick, onBackgroundClick, selectedNode, width, height, isOrbiting = false, orbitSpeed = 1, newYearMode = false, bloomMode = false, showLabels = false }: ForceGraph3DProps) {
  const graphRef = React.useRef<any>(null)
  const [theme, setTheme] = React.useState<ThemeMode>(() => getInitialTheme())
  const [hoveredNode, setHoveredNode] = React.useState<GraphNode | null>(null)
  
  const stableDataRef = React.useRef<InternalGraphData>({ nodes: [], links: [] })
  const nodeMapRef = React.useRef<Map<string, any>>(new Map())
  const linkSetRef = React.useRef<Set<string>>(new Set())
  const [graphDataState, setGraphDataState] = React.useState<InternalGraphData>({ nodes: [], links: [] })
  const spriteMapRef = React.useRef<Map<string, any>>(new Map())
  const [SpriteText, setSpriteText] = React.useState<any>(null)
  const orbitAngleRef = React.useRef<number>(0)
  const orbitDistanceRef = React.useRef<number>(1400)
  const bloomPassRef = React.useRef<any>(null)
  const UnrealBloomPassRef = React.useRef<any>(null)

  const getBloomNodeColor = React.useCallback((linkCount: number): string => {
    if (linkCount === 0) return "#a855f7" // Purple
    if (linkCount <= 2) return "#1e40af" // Deep blue
    if (linkCount === 3) return "#60a5fa" // Light blue
    if (linkCount <= 5) return "#34d399" // Green
    if (linkCount <= 7) return "#f97316" // Orange
    return "#ef4444" // Red (8+)
  }, [])

  // Load SpriteText and UnrealBloomPass dynamically (pre-load for smooth transitions)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      import("three-spritetext").then((module) => {
        setSpriteText(() => module.default)
      })
      
      // Pre-load UnrealBloomPass to prevent flash when enabling bloom
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js").then((module: any) => {
        UnrealBloomPassRef.current = module.UnrealBloomPass
      }).catch((error) => {
        console.error("Failed to load UnrealBloomPass:", error)
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

  // Force graph re-render when newYearMode or bloomMode changes to prevent color flash
  React.useEffect(() => {
    if (!graphRef.current) return
    
    // Force re-render by creating new data reference
    // This ensures nodeColor function is re-evaluated for all nodes
    setGraphDataState(prev => ({
      nodes: [...prev.nodes],
      links: [...prev.links],
    }))
  }, [newYearMode, bloomMode])

  // Setup bloom pass for new year mode or bloom mode - exactly as in the reference example
  // Reference: https://github.com/vasturiano/react-force-graph/blob/master/example/bloom-effect/index.html
  React.useEffect(() => {
    if (!graphRef.current || typeof window === "undefined") return

    const composer = graphRef.current.postProcessingComposer()
    if (!composer) return

    if (newYearMode || bloomMode) {
      // Use pre-loaded UnrealBloomPass if available, otherwise load it
      const setupBloom = (UnrealBloomPass: any) => {
        if (!graphRef.current) return
        
        // If bloom pass already exists, just enable it
        if (bloomPassRef.current) {
          bloomPassRef.current.enabled = true
          return
        }
        
        // Create bloom pass exactly as in reference
        const bloomPass = new UnrealBloomPass()
        bloomPass.strength = 4
        bloomPass.radius = 1
        bloomPass.threshold = 0
        
        composer.addPass(bloomPass)
        bloomPassRef.current = bloomPass
      }

      if (UnrealBloomPassRef.current) {
        // Use pre-loaded module - no async delay
        setupBloom(UnrealBloomPassRef.current)
      } else {
        // Fallback: load if not pre-loaded yet
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js").then((module: any) => {
          UnrealBloomPassRef.current = module.UnrealBloomPass
          setupBloom(module.UnrealBloomPass)
        }).catch((error) => {
          console.error("Failed to load UnrealBloomPass:", error)
        })
      }
      
      // Ensure all existing sprites are excluded from bloom
      spriteMapRef.current.forEach((sprite) => {
        sprite.layers.set(1) // Move sprites to layer 1
        // Also ensure material doesn't contribute to bloom
        if (sprite.material) {
          if (sprite.material.emissive) {
            sprite.material.emissive.setHex(0x000000)
          }
          if (sprite.material.emissiveIntensity !== undefined) {
            sprite.material.emissiveIntensity = 0
          }
        }
      })
    } else {
      // Disable bloom pass instead of removing it to prevent flash
      if (bloomPassRef.current) {
        bloomPassRef.current.enabled = false
      }
      
      // Reset sprite layers to default (layer 0)
      spriteMapRef.current.forEach((sprite) => {
        sprite.layers.set(0)
      })
    }
  }, [newYearMode, bloomMode])

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

  const colors = React.useMemo(() => {
    const base = theme === "dark" ? DARK_THEME : LIGHT_THEME
    const resolvedBackground = getResolvedBackground()
    return { ...base, background: resolvedBackground ?? base.background }
  }, [theme])

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

  const getNodeColor = React.useCallback((node: any) => {
    // In bloom mode, use connection-based colors
    if (bloomMode) {
      const linkCount = node.linkCount ?? 0
      return getBloomNodeColor(linkCount)
    }
    
    // In new year mode, always use node's color property for colorful display
    if (newYearMode) {
      return node.color || colors.node
    }
    
    // Normal mode: use theme-based colors with highlighting
    const activeNode = getActiveNode()
    if (!activeNode) return colors.node
    
    if (node.id === activeNode.id) {
      return colors.nodeHighlight
    }
    
    return colors.node
  }, [bloomMode, newYearMode, colors, selectedNode, hoveredNode, getBloomNodeColor])

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

  // Memoize handlers to prevent infinite loops and unnecessary re-renders
  const handleNodeHover = React.useCallback((node: any) => {
    setHoveredNode(node)
  }, [])

  const handleNodeClick = React.useCallback((node: any) => {
    onNodeClick?.(node as GraphNode)
  }, [onNodeClick])

  const handleBackgroundClick = React.useCallback(() => {
    onBackgroundClick?.()
  }, [onBackgroundClick])

  // Create 3D text sprites using SpriteText
  const nodeThreeObject = React.useCallback((node: any) => {
    // Don't create sprites at all when labels are hidden
    if (!showLabels) return undefined
    if (typeof window === "undefined" || !SpriteText) return undefined
    
    const sprite = new SpriteText(node.title)
    // Use appropriate color based on mode - will be updated by effect
    if (bloomMode) {
      const linkCount = node.linkCount ?? 0
      sprite.color = getBloomNodeColor(linkCount)
    } else if (newYearMode) {
      sprite.color = node.color || colors.node
    } else {
      sprite.color = colors.node
    }
    sprite.textHeight = 8
    sprite.center.y = -0.6
    // Remove background rectangles - SpriteText should accept null or false
    sprite.backgroundColor = null
    if (sprite.material) {
      sprite.material.transparent = true
      sprite.material.opacity = 1
      sprite.material.depthWrite = false
    }
    
    // Exclude labels from bloom effect by assigning them to layer 1
    // and ensuring material doesn't contribute to bloom
    if (bloomMode || newYearMode) {
      sprite.layers.set(1)
      if (sprite.material) {
        if (sprite.material.emissive) {
          sprite.material.emissive.setHex(0x000000)
        }
        if (sprite.material.emissiveIntensity !== undefined) {
          sprite.material.emissiveIntensity = 0
        }
      }
    }
    
    // Store reference for updates
    spriteMapRef.current.set(node.id, sprite)
    
    return sprite
  }, [colors, newYearMode, bloomMode, getBloomNodeColor, showLabels])

  // Update sprite colors when theme or selection changes
  // Also clean up sprites when showLabels is disabled
  React.useEffect(() => {
    if (!showLabels) {
      // Remove all sprites when labels are hidden
      spriteMapRef.current.forEach((sprite) => {
        if (sprite.parent) {
          sprite.parent.remove(sprite)
        }
      })
      spriteMapRef.current.clear()
      // Don't call setGraphDataState here - it causes infinite loop
      // The graph will automatically update when nodeThreeObject returns undefined
      return
    }
    
    // Only update existing sprites - use stableDataRef to avoid dependency on graphDataState.nodes
    spriteMapRef.current.forEach((sprite, nodeId) => {
      const node = stableDataRef.current.nodes.find(n => n.id === nodeId)
      if (node) {
        sprite.color = getNodeColor(node)
        sprite.material.opacity = 1
        // Ensure no background is set
        sprite.backgroundColor = null
        
        // Exclude labels from bloom effect by assigning them to layer 1
        // and ensuring material doesn't contribute to bloom
        if (bloomMode || newYearMode) {
          sprite.layers.set(1)
          if (sprite.material) {
            if (sprite.material.emissive) {
              sprite.material.emissive.setHex(0x000000)
            }
            if (sprite.material.emissiveIntensity !== undefined) {
              sprite.material.emissiveIntensity = 0
            }
          }
        } else {
          sprite.layers.set(0)
        }
      }
    })
  }, [theme, hoveredNode, selectedNode, colors, newYearMode, bloomMode, getNodeColor, showLabels])

  // Clean up sprites when nodes are removed or when showLabels is disabled
  React.useEffect(() => {
    if (!showLabels) {
      // Sprites are already cleaned up in the other effect
      return
    }
    
    const currentNodeIds = new Set(graphDataState.nodes.map(n => n.id))
    const spritesToRemove: string[] = []
    
    spriteMapRef.current.forEach((sprite, nodeId) => {
      if (!currentNodeIds.has(nodeId)) {
        // Remove sprite from scene if it has a parent
        if (sprite.parent) {
          sprite.parent.remove(sprite)
        }
        spritesToRemove.push(nodeId)
      }
    })
    
    spritesToRemove.forEach(nodeId => {
      spriteMapRef.current.delete(nodeId)
    })
  }, [graphDataState.nodes, showLabels])


  // Camera orbit effect
  React.useEffect(() => {
    if (!graphRef.current || !isOrbiting) return
    
    // Set initial camera position
    if (orbitAngleRef.current === 0) {
      graphRef.current.cameraPosition({ z: orbitDistanceRef.current })
    }

    const intervalId = setInterval(() => {
      if (!graphRef.current) return
      
      // Get current camera position to track user's zoom
      const camera = graphRef.current.camera()
      if (camera) {
        const currentDistance = Math.sqrt(
          camera.position.x * camera.position.x +
          camera.position.y * camera.position.y +
          camera.position.z * camera.position.z
        )
        // Update distance ref to track zoom changes
        if (currentDistance > 0) {
          orbitDistanceRef.current = currentDistance
        }
      }
      
      graphRef.current.cameraPosition({
        x: orbitDistanceRef.current * Math.sin(orbitAngleRef.current),
        z: orbitDistanceRef.current * Math.cos(orbitAngleRef.current)
      })
      orbitAngleRef.current += (Math.PI / 300) * orbitSpeed
    }, 10)

    return () => {
      clearInterval(intervalId)
      orbitAngleRef.current = 0
    }
  }, [isOrbiting, orbitSpeed])

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
      nodeThreeObject={showLabels ? nodeThreeObject : undefined}
      nodeThreeObjectExtend={true}
      linkColor={getLinkColor}
      linkWidth={getLinkWidth}
      linkDirectionalParticles={0}
      onNodeHover={handleNodeHover}
      onNodeClick={handleNodeClick}
      onBackgroundClick={handleBackgroundClick}
      backgroundColor={newYearMode || bloomMode ? "#000003" : colors.background}
      cooldownTicks={100}
      warmupTicks={50}
      enableNodeDrag={!isOrbiting}
      enableNavigationControls={true}
      showNavInfo={false}
    />
  )
}

