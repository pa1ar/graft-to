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
  const abortControllerRef = React.useRef<AbortController | null>(null)
  const isCancelledRef = React.useRef(false)

  const loadGraph = React.useCallback(async (forceRefresh = false) => {
    // Reset cancellation flag
    isCancelledRef.current = false
    
    // Abort any existing loading
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller for this load
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    
    const apiUrl = localStorage.getItem(STORAGE_KEY_URL)
    const apiKey = localStorage.getItem(STORAGE_KEY_KEY)
    
    if (!apiUrl || !apiKey) {
      // Load demo graph when no credentials are configured
      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }))
        
        const response = await fetch('/demo-graph.json', { signal })
        if (!response.ok) {
          throw new Error('Failed to load demo graph')
        }
        
        if (signal.aborted) return
        
        const demoData: GraphData = await response.json()
        
        if (signal.aborted) return
        
        setState(prev => ({
          ...prev,
          graphData: demoData,
          isLoading: false,
          error: null,
          isFromCache: false,
        }))
      } catch (err) {
        if (signal.aborted || isCancelledRef.current) return
        setState(prev => ({
          ...prev,
          error: "Failed to load demo graph",
          isLoading: false,
        }))
      }
      return
    }

    if (!forceRefresh) {
      const cached = await getCachedGraph(apiUrl)
      if (cached) {
        if (signal.aborted) return
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

    if (signal.aborted) return

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      isFromCache: false,
      progress: { current: 0, total: 0, message: "" },
    }))

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      
      // Build graph - the result includes both graph data and document metadata
      const result = await fetcher.buildGraphOptimized({
        signal,
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
            if (signal.aborted || isCancelledRef.current) return
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

      if (signal.aborted || isCancelledRef.current) return

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
      if (signal.aborted || isCancelledRef.current) return
      // Don't show error for aborted operations
      if (err instanceof Error && err.message === 'Operation aborted') {
        return
      }
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to load graph",
        isLoading: false,
      }))
    }
  }, [])

  const refreshGraph = React.useCallback(async () => {
    // Reset cancellation flag
    isCancelledRef.current = false
    
    // Abort any existing loading
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller for this refresh
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    
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

    if (signal.aborted) return

    setState(prev => ({
      ...prev,
      isRefreshing: true,
      error: null,
      progress: { current: 0, total: 0, message: "" },
    }))

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      
      const result = await fetcher.buildGraphIncrementalOptimized(
        cachedWithMetadata.documentMetadata,
        cachedWithMetadata.graphData,
        {
          signal,
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
              if (signal.aborted || isCancelledRef.current) return
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

      if (signal.aborted || isCancelledRef.current) return

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
      if (signal.aborted || isCancelledRef.current) return
      // Don't show error for aborted operations
      if (err instanceof Error && err.message === 'Operation aborted') {
        return
      }
      console.error('[Graph] Refresh failed:', err)
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to refresh graph",
        isRefreshing: false,
      }))
    }
  }, [loadGraph])

  const cancelLoading = React.useCallback(() => {
    isCancelledRef.current = true
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setState(prev => ({
      ...prev,
      isLoading: false,
      isRefreshing: false,
      progress: { current: 0, total: 0, message: "" },
    }))
  }, [])

  React.useEffect(() => {
    // Only auto-load if not cancelled
    if (!isCancelledRef.current) {
      loadGraph()
    }
  }, [loadGraph])

  return {
    ...state,
    reload: () => loadGraph(true),
    refresh: refreshGraph,
    cancel: cancelLoading,
  }
}

