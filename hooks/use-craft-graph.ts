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
      let documentMetadata: DocumentMetadata[] = []
      
      const graphData = await fetcher.buildGraphStreaming({
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
          onComplete: async (finalGraphData: GraphData) => {
            console.log('[Graph] Complete:', finalGraphData.nodes.length, 'nodes,', finalGraphData.links.length, 'links')
            
            const allDocs = await fetcher.fetchDocuments(true)
            documentMetadata = allDocs.map(doc => ({
              id: doc.id,
              title: doc.title,
              lastModifiedAt: doc.lastModifiedAt,
              deleted: doc.deleted,
            }))
            
            setState(prev => ({
              ...prev,
              graphData: finalGraphData,
              isLoading: false,
            }))
            
            setCachedGraph(apiUrl, finalGraphData, documentMetadata).catch(err => {
              console.warn('[Graph] Failed to cache:', err)
            })
          },
        },
      })

      setState(prev => ({
        ...prev,
        graphData,
        isLoading: false,
      }))
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

    // Check cache age to determine refresh strategy
    const cacheAge = Date.now() - cachedWithMetadata.timestamp
    const CACHE_STALE_THRESHOLD = 1000 * 60 * 5 // 5 minutes - force full refresh
    const CACHE_RECENT_THRESHOLD = 1000 * 60 * 2 // 2 minutes - very recent, might miss changes
    
    // If cache is very old, force full refresh
    if (cacheAge > CACHE_STALE_THRESHOLD) {
      console.log('[Graph] Cache is stale (age:', Math.round(cacheAge / 1000 / 60), 'minutes), performing full refresh')
      return loadGraph(true)
    }
    
    // If cache is very recent (< 2 min), Craft API might not have updated metadata yet
    // Force full refresh to catch any link changes that happened recently
    if (cacheAge < CACHE_RECENT_THRESHOLD) {
      console.log('[Graph] Cache is very recent (age:', Math.round(cacheAge / 1000), 'seconds), performing full refresh to catch recent changes')
      return loadGraph(true)
    }

    setState(prev => ({
      ...prev,
      isRefreshing: true,
      error: null,
    }))

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      
      const result = await fetcher.buildGraphIncremental(
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
                  linkCounts.set(link.source, (linkCounts.get(link.source) || 0) + 1)
                  linkCounts.set(link.target, (linkCounts.get(link.target) || 0) + 1)
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
            onComplete: async (finalGraphData: GraphData) => {
              console.log('[Graph] Refresh complete')
              
              const allDocs = await fetcher.fetchDocuments(true)
              const documentMetadata = allDocs.map(doc => ({
                id: doc.id,
                title: doc.title,
                lastModifiedAt: doc.lastModifiedAt,
                deleted: doc.deleted,
              }))
              
              setState(prev => ({
                ...prev,
                graphData: finalGraphData,
                isRefreshing: false,
              }))
              
              setCachedGraph(apiUrl, finalGraphData, documentMetadata).catch(err => {
                console.warn('[Graph] Failed to cache:', err)
              })
            },
          },
        }
      )

      if (!result.hasChanges) {
        // Even if no changes detected, update cache timestamp to mark it as fresh
        const allDocs = await fetcher.fetchDocuments(true)
        const documentMetadata = allDocs.map(doc => ({
          id: doc.id,
          title: doc.title,
          lastModifiedAt: doc.lastModifiedAt,
          deleted: doc.deleted,
        }))
        
        // Update cache with fresh metadata even if graph data didn't change
        setCachedGraph(apiUrl, cachedWithMetadata.graphData, documentMetadata).catch(err => {
          console.warn('[Graph] Failed to update cache timestamp:', err)
        })
        
        setState(prev => ({
          ...prev,
          isRefreshing: false,
        }))
      }
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

