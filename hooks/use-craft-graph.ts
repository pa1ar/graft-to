"use client"

import * as React from "react"
import { 
  createFetcher, 
  type GraphData, 
  type GraphNode, 
  type GraphLink, 
  type DocumentMetadata,
  getCachedGraph, 
  getCachedGraphWithMetadata,
  setCachedGraph,
  calculateNodeColor,
  rebuildNodeRelationships
} from "@/lib/graph"

const STORAGE_KEY_URL = "craft_api_url"
const STORAGE_KEY_KEY = "craft_api_key"

interface UseCraftGraphState {
  graphData: GraphData | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  progress: {
    current: number
    total: number
    message: string
  }
  isFromCache: boolean
}

export function useCraftGraph() {
  const [state, setState] = React.useState<UseCraftGraphState>({
    graphData: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    progress: { current: 0, total: 0, message: "" },
    isFromCache: false,
  })

  const loadGraph = React.useCallback(async (forceRefresh = false) => {
    const apiUrl = localStorage.getItem(STORAGE_KEY_URL)
    const apiKey = localStorage.getItem(STORAGE_KEY_KEY)
    
    if (!apiUrl || !apiKey) {
      setState(prev => ({
        ...prev,
        error: "No API credentials configured",
      }))
      return
    }

    if (!forceRefresh) {
      const cached = await getCachedGraph(apiUrl)
      if (cached) {
        console.log('[Graph] Loaded from cache')
        setState(prev => ({
          ...prev,
          graphData: cached,
          isFromCache: true,
          isLoading: false,
        }))
        return
      }
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      isFromCache: false,
    }))

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      
      // Build graph - the result includes both graph data and document metadata
      const result = await fetcher.buildGraphOptimized({
        callbacks: {
          onNodesReady: (nodes: GraphNode[]) => {
            console.log('[Graph] Nodes ready:', nodes.length)
            setState(prev => ({
              ...prev,
              graphData: {
                nodes,
                links: [],
              },
            }))
          },
          onLinksDiscovered: (newLinks: GraphLink[], newNodes?: GraphNode[]) => {
            console.log('[Graph] Links discovered:', newLinks.length, 'new nodes:', newNodes?.length || 0)
            setState(prev => {
              if (!prev.graphData) return prev
              
              let updatedNodes = [...prev.graphData.nodes]
              
              if (newNodes && newNodes.length > 0) {
                const existingNodeIds = new Set(updatedNodes.map(n => n.id))
                const trulyNewNodes = newNodes.filter(n => !existingNodeIds.has(n.id))
                if (trulyNewNodes.length > 0) {
                  updatedNodes = [...updatedNodes, ...trulyNewNodes]
                }
              }
              
              const existingLinkSet = new Set(
                prev.graphData.links.map(l => `${l.source}-${l.target}`)
              )
              
              const uniqueNewLinks = newLinks.filter(
                link => !existingLinkSet.has(`${link.source}-${link.target}`)
              )
              
              if (uniqueNewLinks.length === 0 && (!newNodes || newNodes.length === 0)) return prev
              
              const updatedLinks = [...prev.graphData.links, ...uniqueNewLinks]
              
              const linkCounts = new Map<string, number>()
              for (const link of updatedLinks) {
                const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source
                const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target
                linkCounts.set(sourceId, (linkCounts.get(sourceId) || 0) + 1)
                linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1)
              }
              
              const finalNodes = updatedNodes.map(node => {
                const linkCount = linkCounts.get(node.id) || 0;
                return {
                  ...node,
                  linkCount,
                  color: calculateNodeColor(linkCount),
                };
              })
              
              // Rebuild node relationships to ensure linksTo and linkedFrom are up to date
              const graphDataWithRelationships = rebuildNodeRelationships({
                nodes: finalNodes,
                links: updatedLinks,
              });
              
              return {
                ...prev,
                graphData: graphDataWithRelationships,
              }
            })
          },
          onProgress: (current, total, message) => {
            setState(prev => ({
              ...prev,
              progress: { current, total, message },
            }))
          },
          onComplete: (finalGraphData: GraphData) => {
            console.log('[Graph] Complete:', finalGraphData.nodes.length, 'nodes,', finalGraphData.links.length, 'links')
            // State is set after buildGraphOptimized returns with full result
          },
        },
      })

      // Set final state with the complete result
      setState(prev => ({
        ...prev,
        graphData: result.graphData,
        isLoading: false,
      }))
      
      // Cache the result with document metadata (already fetched during build)
      setCachedGraph(apiUrl, result.graphData, result.documentMetadata).catch(err => {
        console.warn('[Graph] Failed to cache:', err)
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to load graph",
        isLoading: false,
      }))
    }
  }, [])

  const refreshGraph = React.useCallback(async () => {
    const apiUrl = localStorage.getItem(STORAGE_KEY_URL)
    const apiKey = localStorage.getItem(STORAGE_KEY_KEY)
    
    if (!apiUrl || !apiKey) {
      return
    }

    const cachedWithMetadata = await getCachedGraphWithMetadata(apiUrl)
    
    if (!cachedWithMetadata || !cachedWithMetadata.documentMetadata) {
      console.log('[Graph] Cache missing metadata, performing full reload')
      return loadGraph(true)
    }

    // Always use incremental updates - the optimized method properly compares timestamps
    const cacheAge = Date.now() - cachedWithMetadata.timestamp
    console.log('[Graph] Incremental refresh (cache age:', Math.round(cacheAge / 1000), 'seconds)')

    setState(prev => ({
      ...prev,
      isRefreshing: true,
      error: null,
    }))

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      
      const result = await fetcher.buildGraphIncrementalOptimized(
        cachedWithMetadata.documentMetadata,
        cachedWithMetadata.graphData,
        {
          callbacks: {
            onNodesReady: (nodes: GraphNode[]) => {
              console.log('[Graph] New nodes:', nodes.length)
              setState(prev => {
                if (!prev.graphData) return prev
                
                const existingNodeIds = new Set(prev.graphData.nodes.map(n => n.id))
                const newNodes = nodes.filter(n => !existingNodeIds.has(n.id))
                
                if (newNodes.length === 0) return prev
                
                return {
                  ...prev,
                  graphData: {
                    ...prev.graphData,
                    nodes: [...prev.graphData.nodes, ...newNodes],
                  },
                }
              })
            },
            onLinksDiscovered: (newLinks: GraphLink[], newNodes?: GraphNode[]) => {
              console.log('[Graph] New links discovered:', newLinks.length, 'new nodes:', newNodes?.length || 0)
              setState(prev => {
                if (!prev.graphData) return prev
                
                let updatedNodes = prev.graphData.nodes
                
                if (newNodes && newNodes.length > 0) {
                  const existingNodeIds = new Set(updatedNodes.map(n => n.id))
                  const trulyNewNodes = newNodes.filter(n => !existingNodeIds.has(n.id))
                  if (trulyNewNodes.length > 0) {
                    updatedNodes = [...updatedNodes, ...trulyNewNodes]
                  }
                }
                
                const existingLinkSet = new Set(
                  prev.graphData.links.map(l => `${l.source}-${l.target}`)
                )
                
                const uniqueNewLinks = newLinks.filter(
                  link => !existingLinkSet.has(`${link.source}-${link.target}`)
                )
                
                if (uniqueNewLinks.length === 0 && (!newNodes || newNodes.length === 0)) return prev
                
                const updatedLinks = [...prev.graphData.links, ...uniqueNewLinks]
                
                const linkCounts = new Map<string, number>()
                for (const link of updatedLinks) {
                  const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source
                  const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target
                  linkCounts.set(sourceId, (linkCounts.get(sourceId) || 0) + 1)
                  linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1)
                }
                
                const finalNodes = updatedNodes.map(node => {
                  const linkCount = linkCounts.get(node.id) || 0;
                  return {
                    ...node,
                    linkCount,
                    color: calculateNodeColor(linkCount),
                  };
                })
                
                // Rebuild node relationships to ensure linksTo and linkedFrom are up to date
                const graphDataWithRelationships = rebuildNodeRelationships({
                  nodes: finalNodes,
                  links: updatedLinks,
                });
                
                return {
                  ...prev,
                  graphData: graphDataWithRelationships,
                }
              })
            },
            onProgress: (current, total, message) => {
              setState(prev => ({
                ...prev,
                progress: { current, total, message },
              }))
            },
            onComplete: (finalGraphData: GraphData) => {
              console.log('[Graph] Refresh complete')
              // State is set after buildGraphIncrementalOptimized returns
            },
          },
        }
      )

      // Set final state
      setState(prev => ({
        ...prev,
        graphData: result.graphData,
        isRefreshing: false,
      }))
      
      // Update cache with result (includes fresh document metadata)
      setCachedGraph(apiUrl, result.graphData, result.documentMetadata).catch(err => {
        console.warn('[Graph] Failed to cache:', err)
      })
    } catch (err) {
      console.error('[Graph] Refresh failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to refresh graph",
        isRefreshing: false,
      }))
    }
  }, [loadGraph])

  React.useEffect(() => {
    loadGraph()
  }, [loadGraph])

  return {
    ...state,
    reload: () => loadGraph(true),
    refresh: refreshGraph,
  }
}

