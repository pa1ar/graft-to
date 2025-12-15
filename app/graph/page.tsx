"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ForceGraph } from "@/components/graph/force-graph"
import { NodePreview } from "@/components/graph/node-preview"
import { GraphControls } from "@/components/graph/graph-controls"
import { useCraftGraph } from "@/hooks/use-craft-graph"
import type { GraphNode } from "@/lib/graph"

export default function GraphPage() {
  const router = useRouter()
  const { graphData, isLoading, error, progress, reload } = useCraftGraph()
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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">Error loading graph</h2>
          <p className="mb-4 text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="text-primary underline"
          >
            Go back to setup
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-xl font-semibold">Loading graph...</div>
          {progress.total > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {progress.current} / {progress.total}
              </div>
              <div className="text-sm text-muted-foreground">{progress.message}</div>
              <div className="mx-auto h-2 w-64 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!graphData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">No data</h2>
          <button
            onClick={() => router.push("/")}
            className="text-primary underline"
          >
            Go back to setup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <GraphControls
        graphData={graphData}
        onReload={reload}
        onHome={() => router.push("/")}
      />
      
      <ForceGraph
        data={graphData}
        onNodeClick={setSelectedNode}
        width={dimensions.width}
        height={dimensions.height}
      />

      <NodePreview node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  )
}

