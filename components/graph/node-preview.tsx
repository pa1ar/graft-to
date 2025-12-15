"use client"

import * as React from "react"
import { IconX, IconExternalLink } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GraphNode } from "@/lib/graph"

interface NodePreviewProps {
  node: GraphNode | null
  onClose: () => void
}

export function NodePreview({ node, onClose }: NodePreviewProps) {
  if (!node) return null

  const craftUrl = `craft://open?blockId=${node.id}`

  return (
    <div className="fixed right-0 top-0 z-50 h-full w-96 border-l bg-background shadow-lg">
      <Card className="h-full rounded-none border-0">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">{node.title}</CardTitle>
              <CardDescription className="mt-1">
                <Badge variant="secondary" className="mr-2">
                  {node.type}
                </Badge>
                {node.linkCount} {node.linkCount === 1 ? "connection" : "connections"}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="shrink-0"
            >
              <IconX className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium">Document ID</h3>
              <code className="rounded bg-muted px-2 py-1 text-xs">{node.id}</code>
            </div>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(craftUrl, "_blank")}
            >
              <IconExternalLink className="mr-2 h-4 w-4" />
              Open in Craft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

