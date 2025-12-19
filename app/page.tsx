"use client"

import * as React from "react"

import { ForceGraph } from "@/components/graph/force-graph"
import { ForceGraph3DComponent } from "@/components/graph/force-graph-3d"
import { NodePreview } from "@/components/graph/node-preview"
import { GraphControls } from "@/components/graph/graph-controls"
import { useCraftGraph } from "@/hooks/use-craft-graph"
import type { GraphData, GraphNode } from "@/lib/graph"

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }
const HEADER_EVENT = "graft:header-size-change"
const HEADER_FALLBACK = 56

export default function Page() {
  const { graphData, isLoading, isRefreshing, error, progress, reload, refresh } = useCraftGraph()
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })
  const [is3D, setIs3D] = React.useState(false)
  const [isOrbiting, setIsOrbiting] = React.useState(false)
  const [orbitSpeed, setOrbitSpeed] = React.useState(1)
  const [bloomMode, setBloomMode] = React.useState(false)
  const [showLabels, setShowLabels] = React.useState(false)

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
