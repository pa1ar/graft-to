"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { GraphData, GraphNode } from "@/lib/graph"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
})

interface ForceGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  width?: number
  height?: number
}

export function ForceGraph({ data, onNodeClick, width, height }: ForceGraphProps) {
  const graphRef = React.useRef<any>(null)

  React.useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force("charge").strength(-100)
      graphRef.current.d3Force("link").distance(50)
    }
  }, [])

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={data}
      width={width}
      height={height}
      nodeLabel={(node: any) => node.title}
      nodeColor={(node: any) => node.color || "#94a3b8"}
      nodeRelSize={6}
      nodeVal={(node: any) => Math.max(3, node.linkCount)}
      linkColor={() => "#e2e8f0"}
      linkWidth={1.5}
      linkDirectionalParticles={2}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.005}
      onNodeClick={(node: any) => onNodeClick?.(node as GraphNode)}
      backgroundColor="#ffffff"
      cooldownTicks={100}
      onEngineStop={() => {
        if (graphRef.current) {
          graphRef.current.zoomToFit(400, 50)
        }
      }}
    />
  )
}

