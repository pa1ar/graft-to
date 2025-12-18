"use client"

import * as React from "react"
import { 
  IconMoon, 
  IconRefresh, 
  IconSun, 
  IconUnlink,
  IconMenu2,
  IconLayoutSidebarLeftCollapse,
  IconPlug,
  IconChartBar,
  IconSearch
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { GraphData } from "@/lib/graph"
import { createFetcher, getGraphStats, clearAllData } from "@/lib/graph"

const STORAGE_KEY_URL = "craft_api_url"
const STORAGE_KEY_KEY = "craft_api_key"
const STORAGE_KEY_THEME = "graft_theme"
const THEME_EVENT = "graft:theme-change"

type Theme = "light" | "dark"

interface ProgressState {
  current: number
  total: number
  message: string
}

interface GraphControlsProps {
  graphData: GraphData | null
  isLoading: boolean
  isRefreshing?: boolean
  progress: ProgressState
  error?: string | null
  onReload: () => void
  onRefresh?: () => void
}

type PanelType = 'connect' | 'stats' | 'search' | null

// Connect Panel Component
interface ConnectPanelProps {
  apiUrl: string
  apiKey: string
  isConnecting: boolean
  isLoading: boolean
  formError: string | null
  error?: string | null
  progress: ProgressState
  onApiUrlChange: (value: string) => void
  onApiKeyChange: (value: string) => void
  onConnect: (event: React.FormEvent<HTMLFormElement>) => void
  onDisconnect: () => void
}

function ConnectPanel({ 
  apiUrl, 
  apiKey, 
  isConnecting, 
  isLoading,
  formError, 
  error,
  progress,
  onApiUrlChange, 
  onApiKeyChange, 
  onConnect,
  onDisconnect 
}: ConnectPanelProps) {
  return (
    <form onSubmit={onConnect} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="graph-api-url">API URL</FieldLabel>
        <Input
          id="graph-api-url"
          type="url"
          placeholder="https://connect.craft.do/links/ID/api/v1"
          value={apiUrl}
          onChange={(event) => onApiUrlChange(event.target.value)}
          required
          disabled={isConnecting}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="graph-api-key">API Key</FieldLabel>
        <Input
          id="graph-api-key"
          type="password"
          placeholder="Your Craft API key"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          required
          disabled={isConnecting}
        />
      </Field>

      {formError ? (
        <p className="text-sm text-destructive">{formError}</p>
      ) : (
        error && !isConnecting && (
          <p className="text-sm text-destructive">{error}</p>
        )
      )}

      {isLoading && (
        <div className="space-y-2 rounded-2xl bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-medium text-foreground">Loading graph</span>
            {progress.total > 0 && (
              <span>
                {progress.current} / {progress.total}
              </span>
            )}
          </div>
          {progress.message && (
            <div className="text-muted-foreground">{progress.message}</div>
          )}
          {progress.total > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={isConnecting} className="w-full">
        {isConnecting ? "Connecting..." : "Save connection"}
      </Button>

      {(apiUrl || apiKey) && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full" type="button">
              <IconUnlink className="mr-2 h-4 w-4" />
              Remove connection
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove connection?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear your API credentials, cached graph data, and IndexedDB storage. 
                You'll need to reconnect to view your graph again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDisconnect}>
                Remove connection
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </form>
  )
}

// Stats Panel Component
interface StatsPanelProps {
  stats: ReturnType<typeof getGraphStats> | null
}

function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <Tabs defaultValue="stats" className="w-full">
      <TabsList className="grid grid-cols-1 rounded-3xl bg-muted/40 p-1">
        <TabsTrigger value="stats">Stats</TabsTrigger>
      </TabsList>
      <TabsContent value="stats">
        {stats ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">
            Stats will appear once the graph finishes loading.
          </p>
        )}
      </TabsContent>
    </Tabs>
  )
}

// Search Panel Component
function SearchPanel() {
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="graph-search">Search documents</FieldLabel>
        <Input
          id="graph-search"
          type="search"
          placeholder="Search..."
          disabled
        />
      </Field>
      <p className="text-xs text-muted-foreground">Search functionality coming soon</p>
    </div>
  )
}

export function GraphControls({ graphData, isLoading, isRefreshing, progress, error, onReload, onRefresh }: GraphControlsProps) {
  const [dotCount, setDotCount] = React.useState(1)
  
  React.useEffect(() => {
    if (!isRefreshing) return
    
    const interval = setInterval(() => {
      setDotCount(prev => (prev % 3) + 1)
    }, 500)
    
    return () => clearInterval(interval)
  }, [isRefreshing])
  
  const stats = React.useMemo(() => (graphData ? getGraphStats(graphData) : null), [graphData])
  const [apiUrl, setApiUrl] = React.useState("")
  const [apiKey, setApiKey] = React.useState("")
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = React.useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [activePanel, setActivePanel] = React.useState<PanelType>(null)

  const applyTheme = React.useCallback((mode: Theme) => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    root.classList.toggle("dark", mode === "dark")
    localStorage.setItem(STORAGE_KEY_THEME, mode)
    setIsDarkMode(mode === "dark")
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: mode }))
    }
  }, [])

  React.useEffect(() => {
    const storedUrl = localStorage.getItem(STORAGE_KEY_URL)
    const storedKey = localStorage.getItem(STORAGE_KEY_KEY)
    if (storedUrl) setApiUrl(storedUrl)
    if (storedKey) setApiKey(storedKey)

    // Show connect panel if no credentials are stored
    if (!storedUrl && !storedKey) {
      setActivePanel('connect')
    }

    const storedTheme = localStorage.getItem(STORAGE_KEY_THEME) as Theme | null
    const prefersDark =
      storedTheme ??
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")
    applyTheme(prefersDark)
  }, [applyTheme])

  const handlePanelToggle = (panel: PanelType) => {
    setActivePanel(prev => prev === panel ? null : panel)
  }

  const toggleTheme = () => {
    applyTheme(isDarkMode ? "light" : "dark")
  }

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setIsConnecting(true)

    try {
      const url = new URL(apiUrl)
      if (!url.protocol.startsWith("http")) {
        throw new Error("URL must use HTTP or HTTPS protocol")
      }

      const fetcher = createFetcher(apiUrl, apiKey)
      const isConnected = await fetcher.testConnection()

      if (!isConnected) {
        throw new Error("Failed to connect to Craft API")
      }

      localStorage.setItem(STORAGE_KEY_URL, apiUrl)
      localStorage.setItem(STORAGE_KEY_KEY, apiKey)
      onReload()
    } catch (err) {
      if (err instanceof TypeError) {
        setFormError("Invalid URL format")
      } else if (err instanceof Error) {
        setFormError(err.message)
      } else {
        setFormError("Failed to connect to Craft API")
      }
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY_URL)
      localStorage.removeItem(STORAGE_KEY_KEY)
      
      await clearAllData()
      
      setApiUrl("")
      setApiKey("")
      setActivePanel("connect")
      
      window.location.reload()
    } catch (error) {
      console.error("Failed to disconnect:", error)
    }
  }

  return (
    <>
      {/* Hamburger menu when sidebar is collapsed */}
      {sidebarCollapsed && (
        <div className="fixed left-4 top-14 z-40">
          <Card className="p-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
            >
              <IconMenu2 className="h-4 w-4" />
            </Button>
          </Card>
        </div>
      )}

      {/* Main sidebar */}
      <div 
        className={`fixed left-4 right-4 top-14 z-40 w-[calc(100%-2rem)] space-y-2 transition-transform duration-200 ease-out md:right-auto md:w-[320px] ${
          sidebarCollapsed ? '-translate-x-[calc(100%+1rem)]' : 'translate-x-0'
        }`}
      >
        {/* Toolbar */}
        <Card className="p-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(true)}
              title="Collapse sidebar"
            >
              <IconLayoutSidebarLeftCollapse className="h-4 w-4" />
            </Button>
            <Button
              variant={activePanel === 'connect' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handlePanelToggle('connect')}
              title="Connect"
            >
              <IconPlug className="h-4 w-4" />
            </Button>
            <Button
              variant={activePanel === 'stats' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handlePanelToggle('stats')}
              title="Stats"
              disabled={!stats}
            >
              <IconChartBar className="h-4 w-4" />
            </Button>
            <Button
              variant={activePanel === 'search' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handlePanelToggle('search')}
              title="Search"
            >
              <IconSearch className="h-4 w-4" />
            </Button>
            
            {/* Spacer */}
            <div className="flex-1" />
            
            {/* Right-aligned buttons */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <IconSun className="h-4 w-4" />
              ) : (
                <IconMoon className="h-4 w-4" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onRefresh || onReload} 
              title="Refresh graph"
              disabled={isRefreshing}
            >
              <IconRefresh className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {isRefreshing && (
              <span className="ml-2 text-xs text-muted-foreground">
                refreshing{'.'.repeat(dotCount)}
              </span>
            )}
          </div>
        </Card>

        {/* Panel content */}
        {activePanel && (
          <Card className="p-4">
            {activePanel === 'connect' && (
              <ConnectPanel
                apiUrl={apiUrl}
                apiKey={apiKey}
                isConnecting={isConnecting}
                isLoading={isLoading}
                formError={formError}
                error={error}
                progress={progress}
                onApiUrlChange={setApiUrl}
                onApiKeyChange={setApiKey}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            )}
            {activePanel === 'stats' && (
              <StatsPanel stats={stats} />
            )}
            {activePanel === 'search' && (
              <SearchPanel />
            )}
          </Card>
        )}
      </div>
    </>
  )
}

