"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { GraphData, GraphNode } from "@/lib/graph"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
})

type ThemeMode = "light" | "dark"
type ThemeColors = {
  background: string
  link: string
  particle: string
  nodeLow: string
  nodeMid: string
  nodeHigh: string
  nodeExtreme: string
  orphan: string
}

const LIGHT_THEME: ThemeColors = {
  background: "#ffffff",
  link: "#cbd5e1",
  particle: "#cbd5e1",
  orphan: "#94a3b8",
  nodeLow: "#60a5fa",
  nodeMid: "#34d399",
  nodeHigh: "#fbbf24",
  nodeExtreme: "#f87171",
}

const DARK_THEME: ThemeColors = {
  background: "#020617",
  link: "#475569",
  particle: "#64748b",
  orphan: "#94a3b8",
  nodeLow: "#38bdf8",
  nodeMid: "#4ade80",
  nodeHigh: "#facc15",
  nodeExtreme: "#fb7185",
}

const THEME_EVENT = "graft:theme-change"

const getInitialTheme = (): ThemeMode => {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

const getNodeColorForTheme = (linkCount: number, colors: ThemeColors) => {
  if (linkCount === 0) return colors.orphan
  if (linkCount <= 2) return colors.nodeLow
  if (linkCount <= 5) return colors.nodeMid
  if (linkCount <= 10) return colors.nodeHigh
  return colors.nodeExtreme
}

interface ForceGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  width?: number
  height?: number
}

export function ForceGraph({ data, onNodeClick, width, height }: ForceGraphProps) {
  const graphRef = React.useRef<any>(null)
  const [theme, setTheme] = React.useState<ThemeMode>(() => getInitialTheme())

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

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={data}
      width={width}
      height={height}
      nodeLabel={(node: any) => node.title}
      nodeColor={(node: any) => getNodeColorForTheme(node.linkCount ?? 0, colors)}
      nodeRelSize={8}
      nodeVal={(node: any) => Math.max(4, node.linkCount * 1.5)}
      linkColor={() => colors.link}
      linkDirectionalParticleColor={() => colors.particle}
      linkWidth={2.5}
      linkDirectionalParticles={3}
      linkDirectionalParticleWidth={3}
      linkDirectionalParticleSpeed={0.006}
      onNodeClick={(node: any) => onNodeClick?.(node as GraphNode)}
      backgroundColor={colors.background}
      cooldownTicks={100}
      onEngineStop={() => {
        if (graphRef.current) {
          graphRef.current.zoomToFit(400, 50)
        }
      }}
    />
  )
}

