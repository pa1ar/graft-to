"use client"

import * as React from "react"
import { track } from "@vercel/analytics/react"
import { IconX, IconExternalLink, IconChevronDown, IconChevronUp, IconLoader, IconAlertCircle } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SumrIcon } from "@/components/ui/sumr-icon"
import type { GraphNode, GraphData } from "@/lib/graph"
import ReactMarkdown from 'react-markdown'

interface NodePreviewProps {
  node: GraphNode | null
  graphData: GraphData | null
  onClose: () => void
  onNodeSelect?: (nodeId: string) => void
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

export function NodePreview({ node, graphData, onClose, onNodeSelect }: NodePreviewProps) {
  const [isMinimized, setIsMinimized] = React.useState(false)
  const [summary, setSummary] = React.useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = React.useState(false)
  const [summaryError, setSummaryError] = React.useState<string | null>(null)

  // Reset summary when node changes
  React.useEffect(() => {
    setSummary(null)
    setSummaryError(null)
  }, [node?.id])

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

  const handleSummarize = async () => {
    if (node.type === 'tag' || node.type === 'folder') return

    setIsSummarizing(true)
    setSummaryError(null)
    setSummary('') // Show empty summary container immediately

    try {
      const craftUrl = localStorage.getItem('craft_api_url')
      const craftKey = localStorage.getItem('craft_api_key')

      if (!craftUrl || !craftKey) {
        throw new Error('Summarization requires Craft API credentials. Currently viewing demo graph. Connect your Craft workspace to use AI summarization.')
      }

      console.log('Summarizing node:', {
        nodeId: node.id,
        nodeType: node.type,
        hasUrl: !!craftUrl,
        hasKey: !!craftKey,
      })

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          nodeType: node.type,
          craftUrl,
          craftKey,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Summarization failed')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let accumulatedText = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulatedText += chunk
        setSummary(accumulatedText)

        // Mark as not loading after first chunk
        if (isSummarizing) {
          setIsSummarizing(false)
        }
      }

      track('Summarize Note', { nodeType: node.type })
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : String(error))
      setSummary(null)
    } finally {
      setIsSummarizing(false)
    }
  }

  // Minimized pill view
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
        <Card 
          className="cursor-pointer p-3 transition-transform hover:scale-[1.02]"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{node.title}</span>
            <IconChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </Card>
      </div>
    )
  }

  // Expanded view
  return (
    <div className="fixed left-4 right-4 top-14 z-50 md:left-auto md:right-4 md:w-96">
      <Card className="flex max-h-[calc(100vh-4.5rem)] flex-col">
        <CardHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <CardTitle className="text-lg">{node.title}</CardTitle>
              <CardDescription className="mt-1">
                <Badge variant="secondary" className="mr-2">
                  {node.type}
                </Badge>
                {node.linkCount} {node.linkCount === 1 ? "connection" : "connections"}
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="shrink-0"
                title="Close"
              >
                <IconX className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(true)}
                className="shrink-0"
                title="Minimize"
              >
                <IconChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                track("Open in Craft")
                window.open(craftUrl, "_blank")
              }}
            >
              <IconExternalLink className="mr-2 h-4 w-4" />
              Open in Craft
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleSummarize}
              disabled={node.type === 'tag' || node.type === 'folder' || isSummarizing}
            >
              {isSummarizing ? (
                <>
                  <IconLoader className="mr-2 h-4 w-4 animate-spin" />
                  Summarizing...
                </>
              ) : (
                <>
                  <SumrIcon className="mr-2 h-4 w-4" />
                  Sumr
                </>
              )}
            </Button>
          </div>
          {summary !== null && (
            <div className="mt-4 rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium py-2">AI Summary</h4>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSummary(null)
                    setSummaryError(null)
                  }}
                  title="Close summary"
                >
                  <IconX className="h-3 w-3" />
                </Button>
              </div>
              {isSummarizing && summary === '' ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
          {summaryError && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <IconAlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-destructive">{summaryError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSummarize}
                    className="mt-2"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}
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
                    <div 
                      key={linkId} 
                      onClick={() => onNodeSelect?.(linkId)}
                      className="cursor-pointer rounded bg-muted p-2 transition-colors hover:bg-muted/80"
                    >
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
                    <div 
                      key={linkId} 
                      onClick={() => onNodeSelect?.(linkId)}
                      className="cursor-pointer rounded bg-muted p-2 transition-colors hover:bg-muted/80"
                    >
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

