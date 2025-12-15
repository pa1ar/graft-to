"use client"

import * as React from "react"
import { IconRefresh, IconHome } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { GraphStats } from "@/lib/graph"
import { getGraphStats } from "@/lib/graph"

interface GraphControlsProps {
  graphData: any
  onReload: () => void
  onHome: () => void
}

export function GraphControls({ graphData, onReload, onHome }: GraphControlsProps) {
  const stats = graphData ? getGraphStats(graphData) : null

  return (
    <div className="fixed left-4 top-4 z-40 space-y-2">
      <Card className="p-2">
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={onHome} title="Back to setup">
            <IconHome className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onReload} title="Reload graph">
            <IconRefresh className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {stats && (
        <Card className="p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Documents:</span>
              <span className="font-medium">{stats.totalDocuments}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Nodes:</span>
              <span className="font-medium">{stats.totalNodes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Links:</span>
              <span className="font-medium">{stats.totalLinks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Orphans:</span>
              <span className="font-medium">{stats.orphanNodes}</span>
            </div>
            {stats.mostConnectedNode && (
              <div className="border-t pt-2">
                <div className="text-xs text-muted-foreground">Most connected:</div>
                <div className="truncate text-xs font-medium" title={stats.mostConnectedNode.title}>
                  {stats.mostConnectedNode.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats.mostConnectedNode.connections} connections
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

