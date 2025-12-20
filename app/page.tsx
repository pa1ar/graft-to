"use client"

import * as React from "react"
import { track } from "@vercel/analytics/react"

import { ForceGraph, type ForceGraphRef } from "@/components/graph/force-graph"
import { ForceGraph3DComponent, type ForceGraph3DRef } from "@/components/graph/force-graph-3d"
import { NodePreview } from "@/components/graph/node-preview"
import { GraphControls } from "@/components/graph/graph-controls"
import { useCraftGraph } from "@/hooks/use-craft-graph"
import type { GraphData, GraphNode } from "@/lib/graph"

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }
const HEADER_EVENT = "graft:header-size-change"
const HEADER_FALLBACK = 56

const STORAGE_KEY_3D_MODE = "graft_3d_mode"
const STORAGE_KEY_ORBITING = "graft_orbiting"
const STORAGE_KEY_ORBIT_SPEED = "graft_orbit_speed"
const STORAGE_KEY_BLOOM_MODE = "graft_bloom_mode"
const STORAGE_KEY_SHOW_LABELS = "graft_show_labels"

const getStoredBoolean = (key: string, defaultValue: boolean): boolean => {
  if (typeof window === "undefined") return defaultValue
  const stored = localStorage.getItem(key)
  return stored !== null ? stored === "true" : defaultValue
}

const getStoredNumber = (key: string, defaultValue: number): number => {
  if (typeof window === "undefined") return defaultValue
  const stored = localStorage.getItem(key)
  const parsed = stored !== null ? parseFloat(stored) : defaultValue
  return Number.isFinite(parsed) ? parsed : defaultValue
}

export default function Page() {
  const { graphData, isLoading, isRefreshing, error, progress, reload, refresh, cancel } = useCraftGraph()
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })
  const [is3D, setIs3D] = React.useState(() => getStoredBoolean(STORAGE_KEY_3D_MODE, false))
  const [isOrbiting, setIsOrbiting] = React.useState(() => getStoredBoolean(STORAGE_KEY_ORBITING, false))
  const [orbitSpeed, setOrbitSpeed] = React.useState(() => getStoredNumber(STORAGE_KEY_ORBIT_SPEED, 1))
  const [bloomMode, setBloomMode] = React.useState(() => getStoredBoolean(STORAGE_KEY_BLOOM_MODE, false))
  const [showLabels, setShowLabels] = React.useState(() => getStoredBoolean(STORAGE_KEY_SHOW_LABELS, false))
  
  const graph2DRef = React.useRef<ForceGraphRef>(null)
  const graph3DRef = React.useRef<ForceGraph3DRef>(null)
  const sessionStartRef = React.useRef<number>(Date.now())

  const getHeaderHeight = React.useCallback(() => {
    if (typeof document === "undefined") return HEADER_FALLBACK
    const value = getComputedStyle(document.documentElement).getPropertyValue("--header-height")
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : HEADER_FALLBACK
  }, [])

  React.useEffect(() => {
    const updateDimensions = () => {
      const headerHeight = getHeaderHeight()
      setDimensions({
        width: window.innerWidth,
        height: Math.max(0, window.innerHeight - headerHeight),
      })
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    window.addEventListener(HEADER_EVENT, updateDimensions)
    return () => {
      window.removeEventListener("resize", updateDimensions)
      window.removeEventListener(HEADER_EVENT, updateDimensions)
    }
  }, [getHeaderHeight])

  // Track session duration
  React.useEffect(() => {
    const trackSessionEnd = () => {
      const sessionDuration = Math.floor((Date.now() - sessionStartRef.current) / 1000)
      track("Session End", {
        duration: sessionDuration,
        unit: "seconds"
      })
    }

    window.addEventListener("beforeunload", trackSessionEnd)
    
    return () => {
      window.removeEventListener("beforeunload", trackSessionEnd)
    }
  }, [])

  // Save settings to localStorage
  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY_3D_MODE, String(is3D))
  }, [is3D])

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORBITING, String(isOrbiting))
  }, [isOrbiting])

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORBIT_SPEED, String(orbitSpeed))
  }, [orbitSpeed])

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BLOOM_MODE, String(bloomMode))
  }, [bloomMode])

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHOW_LABELS, String(showLabels))
  }, [showLabels])

  // Disable orbit and bloom mode when switching to 2D mode
  React.useEffect(() => {
    if (!is3D) {
      if (isOrbiting) {
        setIsOrbiting(false)
      }
      if (bloomMode) {
        setBloomMode(false)
      }
    }
  }, [is3D, isOrbiting, bloomMode])

  const handleNodeSelect = React.useCallback((nodeId: string) => {
    if (!graphData) return
    const node = graphData.nodes.find(n => n.id === nodeId)
    if (node) {
      setSelectedNode(node)
    }
  }, [graphData])

  const handleRecenter = React.useCallback(() => {
    if (is3D) {
      graph3DRef.current?.recenter()
    } else {
      graph2DRef.current?.recenter()
    }
  }, [is3D])

  return (
    <div className="relative w-screen overflow-hidden" style={{ height: "calc(100vh - var(--header-height))" }}>
      <GraphControls
        graphData={graphData}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        progress={progress}
        error={error}
        onReload={reload}
        onRefresh={refresh}
        onCancel={cancel}
        onRecenter={handleRecenter}
        is3DMode={is3D}
        onIs3DModeChange={setIs3D}
        isOrbiting={isOrbiting}
        onIsOrbitingChange={setIsOrbiting}
        orbitSpeed={orbitSpeed}
        onOrbitSpeedChange={setOrbitSpeed}
        onNodeSelect={handleNodeSelect}
        bloomMode={bloomMode}
        onBloomModeChange={setBloomMode}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
      />
      
      {is3D ? (
        <ForceGraph3DComponent
          ref={graph3DRef}
          data={graphData ?? EMPTY_GRAPH}
          onNodeClick={setSelectedNode}
          onBackgroundClick={() => setSelectedNode(null)}
          selectedNode={selectedNode}
          width={dimensions.width}
          height={dimensions.height}
          isOrbiting={isOrbiting}
          orbitSpeed={orbitSpeed}
          bloomMode={bloomMode}
          showLabels={showLabels}
        />
      ) : (
        <ForceGraph
          ref={graph2DRef}
          data={graphData ?? EMPTY_GRAPH}
          onNodeClick={setSelectedNode}
          onBackgroundClick={() => setSelectedNode(null)}
          selectedNode={selectedNode}
          width={dimensions.width}
          height={dimensions.height}
          showLabels={showLabels}
        />
      )}

      <NodePreview 
        node={selectedNode} 
        graphData={graphData}
        onClose={() => setSelectedNode(null)}
        onNodeSelect={handleNodeSelect}
      />
    </div>
  )
}
