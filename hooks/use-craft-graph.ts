"use client"

import * as React from "react"
import { createFetcher, type GraphData } from "@/lib/graph"

const STORAGE_KEY_URL = "craft_api_url"
const STORAGE_KEY_KEY = "craft_api_key"

interface UseCraftGraphState {
  graphData: GraphData | null
  isLoading: boolean
  error: string | null
  progress: {
    current: number
    total: number
    message: string
  }
}

export function useCraftGraph() {
  const [state, setState] = React.useState<UseCraftGraphState>({
    graphData: null,
    isLoading: false,
    error: null,
    progress: { current: 0, total: 0, message: "" },
  })

  const loadGraph = React.useCallback(async () => {
    const apiUrl = localStorage.getItem(STORAGE_KEY_URL)
    const apiKey = localStorage.getItem(STORAGE_KEY_KEY)
    
    if (!apiUrl || !apiKey) {
      setState(prev => ({
        ...prev,
        error: "No API credentials configured",
      }))
      return
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }))

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      
      const graphData = await fetcher.buildGraph({
        onProgress: (current, total, message) => {
          setState(prev => ({
            ...prev,
            progress: { current, total, message },
          }))
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

  React.useEffect(() => {
    loadGraph()
  }, [loadGraph])

  return {
    ...state,
    reload: loadGraph,
  }
}

