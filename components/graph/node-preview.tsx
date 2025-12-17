"use client"

import * as React from "react"
import { IconX, IconExternalLink } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { GraphNode, GraphData } from "@/lib/graph"

interface NodePreviewProps {
  node: GraphNode | null
  graphData: GraphData | null
  onClose: () => void
}

function getSpaceId(): string | null {
  // Try to get spaceId from localStorage
  const storedSpaceId = localStorage.getItem("craft_space_id")
  if (storedSpaceId) return storedSpaceId
  
  // Try to extract from API URL if it contains spaceId
  const apiUrl = localStorage.getItem("craft_api_url") || ""
  if (apiUrl) {
    // Check if spaceId is in the URL path (e.g., /spaces/{spaceId}/...)
    const spaceIdMatch = apiUrl.match(/\/spaces\/([a-f0-9-]+)/i)
    if (spaceIdMatch) return spaceIdMatch[1]
    
    // Check if spaceId is a query parameter
    try {
      const url = new URL(apiUrl)
      const spaceIdParam = url.searchParams.get("spaceId")
      if (spaceIdParam) return spaceIdParam
    } catch {
      // Invalid URL, ignore
    }
  }
  
  return null
}

export function NodePreview({ node, graphData, onClose }: NodePreviewProps) {
  if (!node) return null

  // Use clickableLink from node if available, otherwise construct it
  let craftUrl: string;
  if (node.clickableLink) {
    // Use the API-provided clickableLink directly
    craftUrl = node.clickableLink;
  } else {
    // Fallback: construct the URL with blockId and spaceId
    const spaceId = getSpaceId();
    craftUrl = spaceId 
      ? `craftdocs://open?blockId=${node.id}&spaceId=${spaceId}`
      : `craftdocs://open?blockId=${node.id}`;
  }
  
  const getNodeTitle = (nodeId: string): string => {
    const foundNode = graphData?.nodes.find(n => n.id === nodeId)
    return foundNode?.title || nodeId
  }

  return (
    <div className="fixed right-4 top-4 z-50 w-96">
      <Card className="flex max-h-[calc(100vh-2rem)] flex-col">
        <CardHeader className="shrink-0 border-b">
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
          <div className="mt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(craftUrl, "_blank")}
            >
              <IconExternalLink className="mr-2 h-4 w-4" />
              Open in Craft
            </Button>
          </div>
        </CardHeader>
        <CardContent className="node-preview-content flex-1 overflow-y-auto px-6">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium">Document ID</h3>
              <code className="rounded bg-muted px-2 py-1 text-xs break-all">{node.id}</code>
            </div>
            
            {node.linksTo && node.linksTo.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Links to ({node.linksTo.length})</h3>
                <div className="space-y-2">
                  {node.linksTo.map((linkId) => (
                    <div key={linkId} className="rounded bg-muted p-2">
                      <div className="text-sm font-medium">{getNodeTitle(linkId)}</div>
                      <code className="text-xs text-muted-foreground break-all">{linkId}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {node.linkedFrom && node.linkedFrom.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Linked from ({node.linkedFrom.length})</h3>
                <div className="space-y-2">
                  {node.linkedFrom.map((linkId) => (
                    <div key={linkId} className="rounded bg-muted p-2">
                      <div className="text-sm font-medium">{getNodeTitle(linkId)}</div>
                      <code className="text-xs text-muted-foreground break-all">{linkId}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

