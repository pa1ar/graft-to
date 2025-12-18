"use client"

import * as React from "react"

import { ForceGraph } from "@/components/graph/force-graph"
import { ForceGraph3DComponent } from "@/components/graph/force-graph-3d"
import { NodePreview } from "@/components/graph/node-preview"
import { GraphControls } from "@/components/graph/graph-controls"
import { useCraftGraph } from "@/hooks/use-craft-graph"
import type { GraphData, GraphNode } from "@/lib/graph"

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }

export default function Page() {
  const { graphData, isLoading, isRefreshing, error, progress, reload, refresh } = useCraftGraph()
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })
  const [is3D, setIs3D] = React.useState(false)
  const [isOrbiting, setIsOrbiting] = React.useState(false)
  const [orbitSpeed, setOrbitSpeed] = React.useState(1)

  React.useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  // Disable orbit when switching to 2D mode
  React.useEffect(() => {
    if (!is3D && isOrbiting) {
      setIsOrbiting(false)
    }
  }, [is3D, isOrbiting])

  const handleNodeSelect = React.useCallback((nodeId: string) => {
    if (!graphData) return
    const node = graphData.nodes.find(n => n.id === nodeId)
    if (node) {
      setSelectedNode(node)
    }
  }, [graphData])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
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
        />
      ) : (
        <ForceGraph
          data={graphData ?? EMPTY_GRAPH}
          onNodeClick={setSelectedNode}
          onBackgroundClick={() => setSelectedNode(null)}
          selectedNode={selectedNode}
          width={dimensions.width}
          height={dimensions.height}
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
