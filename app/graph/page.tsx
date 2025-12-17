"use client"

import * as React from "react"

import { ForceGraph } from "@/components/graph/force-graph"
import { NodePreview } from "@/components/graph/node-preview"
import { GraphControls } from "@/components/graph/graph-controls"
import { useCraftGraph } from "@/hooks/use-craft-graph"
import type { GraphData, GraphNode } from "@/lib/graph"

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }

export default function GraphPage() {
  const { graphData, isLoading, isRefreshing, error, progress, reload, refresh } = useCraftGraph()
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 })

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
      />
      
      <ForceGraph
        data={graphData ?? EMPTY_GRAPH}
        onNodeClick={setSelectedNode}
        onBackgroundClick={() => setSelectedNode(null)}
        selectedNode={selectedNode}
        width={dimensions.width}
        height={dimensions.height}
      />

      <NodePreview 
        node={selectedNode} 
        graphData={graphData}
        onClose={() => setSelectedNode(null)} 
      />
    </div>
  )
}

