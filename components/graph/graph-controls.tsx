"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { track } from "@vercel/analytics/react"
import { 
  IconMoon, 
  IconRefresh, 
  IconSun, 
  IconUnlink,
  IconMenu2,
  IconLayoutSidebarLeftCollapse,
  IconPlug,
  IconChartBar,
  IconSearch,
  IconAdjustments,
  IconBox,
  IconSquare,
  IconRotate360,
  IconSparkles,
  IconTag,
  IconCircle,
  IconPoint,
  IconEyeOff,
  IconFocus,
  IconX,
  IconCheck
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
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
import { createFetcher, getGraphStats, clearAllData, clearCache } from "@/lib/graph"

// Storage keys for user preferences and credentials
const STORAGE_KEY_URL = "craft_api_url"
const STORAGE_KEY_KEY = "craft_api_key"
const STORAGE_KEY_THEME = "graft_theme"

// Graph visualization settings (persisted in page.tsx):
// - graft_3d_mode: 3D visualization toggle
// - graft_orbiting: Auto-orbit mode
// - graft_orbit_speed: Orbit speed value
// - graft_bloom_mode: Bloom effect toggle
// - graft_show_labels: Node labels toggle

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
  onCancel?: () => void
  onRecenter?: () => void
  is3DMode?: boolean
  onIs3DModeChange?: (is3D: boolean) => void
  isOrbiting?: boolean
  onIsOrbitingChange?: (isOrbiting: boolean) => void
  orbitSpeed?: number
  onOrbitSpeedChange?: (speed: number) => void
  onNodeSelect?: (nodeId: string) => void
  bloomMode?: boolean
  onBloomModeChange?: (bloomMode: boolean) => void
  showLabels?: boolean
  onShowLabelsChange?: (showLabels: boolean) => void
  showWikilinks?: boolean
  onShowWikilinksChange?: (show: boolean) => void
  showTags?: boolean
  onShowTagsChange?: (show: boolean) => void
  showFolders?: boolean
  onShowFoldersChange?: (show: boolean) => void
}

type PanelType = 'connect' | 'stats' | 'search' | 'customize' | null

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
  onClearCache: () => void
  onCancelLoading?: () => void
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
  onDisconnect,
  onClearCache,
  onCancelLoading
}: ConnectPanelProps) {
  return (
    <form onSubmit={onConnect} className="space-y-4">
      <Accordion>
        <AccordionItem value="how-it-works">
          <AccordionTrigger>What's Graft?</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 text-xs">
              <p>
                <a href="https://1ar.craft.me/graft" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors">Graft</a> is a read-only, <a href="https://github.com/pa1ar/graft-to" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors">open-source</a> graph visualization of your <a href="https://craft.do" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors">Craft Docs</a> space.
              </p>
              
              <div>
                <p className="font-medium mb-2">What you need:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li><strong>API URL</strong></li>
                  <li><strong>API Key</strong></li>
                </ul>
                <p className="mt-2 text-muted-foreground">
                  Create one in Craft → <a 
                    href="https://www.craft.do/imagine" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Imagine
                  </a>
                </p>
              </div>

              <div className="pt-3 border-t border-border">
                <p className="text-muted-foreground">
                  Your API credentials are stored locally in your browser only. They are passed via headers through a proxy to avoid CORS issues, but <strong className="text-foreground">never logged or stored on the server</strong>.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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

      <Button type="submit" disabled={isConnecting} className="w-full">
        {isConnecting ? "Connecting..." : "Save connection"}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full" 
            type="button"
            disabled={!(apiUrl || apiKey)}
          >
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

      <Button 
        variant="outline" 
        className="w-full" 
        type="button"
        onClick={onClearCache}
        disabled={!apiUrl || isConnecting || isLoading}
      >
        Clear cache
      </Button>

      {isLoading && (
        <div className="space-y-2 rounded-2xl bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="font-medium text-foreground">Loading graph</span>
            <div className="flex items-center gap-2">
              {progress.total > 0 ? (
                <span>
                  {progress.current} / {progress.total}
                </span>
              ) : (
                <span className="opacity-0">0 / 0</span>
              )}
              {onCancelLoading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={onCancelLoading}
                  title="Cancel loading"
                >
                  <IconX className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {/* Reserve space for 2 lines of message to prevent layout shift when text wraps */}
          <div className="min-h-10 text-muted-foreground">
            {progress.message && <div>{progress.message}</div>}
          </div>
          {/* Always render progress bar to maintain stable height, start at 0% */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{
                width: `${progress.total > 0 ? Math.min(100, (progress.current / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
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
interface SearchPanelProps {
  graphData: GraphData | null
  onNodeSelect?: (nodeId: string) => void
}

function SearchPanel({ graphData, onNodeSelect }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  
  const searchResults = React.useMemo(() => {
    if (!graphData || !searchQuery.trim()) return []
    
    const query = searchQuery.toLowerCase()
    return graphData.nodes
      .filter(node => node.title.toLowerCase().includes(query))
      .slice(0, 10) // Limit to 10 results
  }, [graphData, searchQuery])
  
  const handleResultClick = (nodeId: string) => {
    onNodeSelect?.(nodeId)
    setSearchQuery("") // Clear search after selection
  }
  
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="graph-search">Search documents</FieldLabel>
        <Input
          id="graph-search"
          type="search"
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Field>
      
      {searchQuery.trim() && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Results ({searchResults.length})
          </p>
          {searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map((node) => (
                <div
                  key={node.id}
                  onClick={() => handleResultClick(node.id)}
                  className="cursor-pointer rounded bg-muted p-2 transition-colors hover:bg-muted/80"
                >
                  <div className="text-sm font-medium">{node.title}</div>
                  <code className="text-xs text-muted-foreground break-all">{node.id}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No results found</p>
          )}
        </div>
      )}
    </div>
  )
}

// Customize Panel Component
interface CustomizePanelProps {
  isDarkMode: boolean
  is3DMode: boolean
  isOrbiting: boolean
  orbitSpeed: number
  bloomMode: boolean
  showLabels: boolean
  showWikilinks: boolean
  showTags: boolean
  showFolders: boolean
  onThemeChange: (isDark: boolean) => void
  on3DModeChange: (is3D: boolean) => void
  onOrbitingChange: (isOrbiting: boolean) => void
  onOrbitSpeedChange: (speed: number) => void
  onBloomModeChange: (bloomMode: boolean) => void
  onShowLabelsChange: (showLabels: boolean) => void
  onWikilinksChange: (show: boolean) => void
  onTagsChange: (show: boolean) => void
  onFoldersChange: (show: boolean) => void
}

function CustomizePanel({
  isDarkMode,
  is3DMode,
  isOrbiting,
  orbitSpeed,
  bloomMode,
  showLabels,
  showWikilinks,
  showTags,
  showFolders,
  onThemeChange,
  on3DModeChange,
  onOrbitingChange,
  onOrbitSpeedChange,
  onBloomModeChange,
  onShowLabelsChange,
  onWikilinksChange,
  onTagsChange,
  onFoldersChange
}: CustomizePanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Theme</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onThemeChange(false)}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              !isDarkMode 
                ? 'border-primary text-primary' 
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconSun className="h-5 w-5" />
            <span className="text-xs font-medium">Light</span>
          </button>
          <button
            type="button"
            onClick={() => onThemeChange(true)}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              isDarkMode 
                ? 'border-primary text-primary' 
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconMoon className="h-5 w-5" />
            <span className="text-xs font-medium">Dark</span>
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Labels</p>
          {bloomMode && (
            <span className="text-xs text-muted-foreground">Bloom disables</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onShowLabelsChange(false)}
            disabled={bloomMode}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              bloomMode
                ? 'cursor-not-allowed opacity-40'
                : !showLabels 
                  ? 'border-primary text-primary' 
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconEyeOff className="h-5 w-5" />
            <span className="text-xs font-medium">Hidden</span>
          </button>
          <button
            type="button"
            onClick={() => onShowLabelsChange(true)}
            disabled={bloomMode}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              bloomMode
                ? 'cursor-not-allowed opacity-40'
                : showLabels 
                  ? 'border-primary text-primary' 
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconTag className="h-5 w-5" />
            <span className="text-xs font-medium">Show</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Linking Type</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onWikilinksChange(!showWikilinks)}
            className={`flex w-full items-center justify-between rounded-lg border-2 bg-transparent p-3 transition-all duration-300 ease-in-out ${
              showWikilinks
                ? 'border-primary text-primary'
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <span className="text-sm font-medium">Wikilinks</span>
            {showWikilinks ? <IconCheck className="h-4 w-4" /> : <IconX className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => onTagsChange(!showTags)}
            className={`flex w-full items-center justify-between rounded-lg border-2 bg-transparent p-3 transition-all duration-300 ease-in-out ${
              showTags
                ? 'border-primary text-primary'
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <span className="text-sm font-medium">Tags</span>
            {showTags ? <IconCheck className="h-4 w-4" /> : <IconX className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => onFoldersChange(!showFolders)}
            className={`flex w-full items-center justify-between rounded-lg border-2 bg-transparent p-3 transition-all duration-300 ease-in-out ${
              showFolders
                ? 'border-primary text-primary'
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <span className="text-sm font-medium">Folders</span>
            {showFolders ? <IconCheck className="h-4 w-4" /> : <IconX className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">View Mode</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => on3DModeChange(false)}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              !is3DMode 
                ? 'border-primary text-primary' 
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconSquare className="h-5 w-5" />
            <span className="text-xs font-medium">2D</span>
          </button>
          <button
            type="button"
            onClick={() => on3DModeChange(true)}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              is3DMode 
                ? 'border-primary text-primary' 
                : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconBox className="h-5 w-5" />
            <span className="text-xs font-medium">3D</span>
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Bloom Mode</p>
          {!is3DMode && (
            <span className="text-xs text-muted-foreground">3D only</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onBloomModeChange(false)}
            disabled={!is3DMode}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              !is3DMode
                ? 'cursor-not-allowed opacity-40'
                : !bloomMode 
                  ? 'border-primary text-primary' 
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconPoint className="h-5 w-5" />
            <span className="text-xs font-medium">None</span>
          </button>
          <button
            type="button"
            onClick={() => onBloomModeChange(true)}
            disabled={!is3DMode}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              !is3DMode
                ? 'cursor-not-allowed opacity-40'
                : bloomMode 
                  ? 'border-primary text-primary' 
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconSparkles className="h-5 w-5" />
            <span className="text-xs font-medium">Bloom</span>
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Camera</p>
          {!is3DMode && (
            <span className="text-xs text-muted-foreground">3D only</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onOrbitingChange(false)}
            disabled={!is3DMode}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              !is3DMode
                ? 'cursor-not-allowed opacity-40'
                : !isOrbiting 
                  ? 'border-primary text-primary' 
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconCircle className="h-5 w-5" />
            <span className="text-xs font-medium">Static</span>
          </button>
          <button
            type="button"
            onClick={() => onOrbitingChange(true)}
            disabled={!is3DMode}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 bg-transparent p-4 transition-all duration-300 ease-in-out ${
              !is3DMode
                ? 'cursor-not-allowed opacity-40'
                : isOrbiting 
                  ? 'border-primary text-primary' 
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
            }`}
          >
            <IconRotate360 className="h-5 w-5" />
            <span className="text-xs font-medium">Orbit</span>
          </button>
        </div>
        
        <div className={`space-y-2 pt-2 transition-opacity duration-200 ${!is3DMode || !isOrbiting ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Speed</p>
            <span className="text-xs text-muted-foreground">{orbitSpeed.toFixed(1)}x</span>
          </div>
          <Slider
            value={[orbitSpeed]}
            onValueChange={(values) => onOrbitSpeedChange(values[0])}
            min={0.1}
            max={2}
            step={0.1}
            className="w-full"
            disabled={!is3DMode || !isOrbiting}
          />
        </div>
      </div>
    </div>
  )
}

export function GraphControls({
  graphData,
  isLoading,
  isRefreshing,
  progress,
  error,
  onReload,
  onRefresh,
  onCancel,
  onRecenter,
  is3DMode = false,
  onIs3DModeChange,
  isOrbiting = false,
  onIsOrbitingChange,
  orbitSpeed = 1,
  onOrbitSpeedChange,
  onNodeSelect,
  bloomMode = false,
  onBloomModeChange,
  showLabels = false,
  onShowLabelsChange,
  showWikilinks = true,
  onShowWikilinksChange,
  showTags = false,
  onShowTagsChange,
  showFolders = false,
  onShowFoldersChange
}: GraphControlsProps) {
  const stats = React.useMemo(() => (graphData ? getGraphStats(graphData) : null), [graphData])
  const [apiUrl, setApiUrl] = React.useState("")
  const [apiKey, setApiKey] = React.useState("")
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    if (typeof window === "undefined") return false
    const storedTheme = localStorage.getItem(STORAGE_KEY_THEME) as Theme | null
    const theme = storedTheme ?? (
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
    )
    return theme === "dark"
  })
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
    const theme =
      storedTheme ??
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")
    applyTheme(theme)
  }, [applyTheme])

  const handlePanelToggle = (panel: PanelType) => {
    setActivePanel(prev => prev === panel ? null : panel)
  }

  const handleThemeChange = (isDark: boolean) => {
    applyTheme(isDark ? "dark" : "light")
  }

  const handle3DModeChange = (is3D: boolean) => {
    onIs3DModeChange?.(is3D)
  }

  const handleOrbitingChange = (orbiting: boolean) => {
    onIsOrbitingChange?.(orbiting)
  }

  const handleOrbitSpeedChange = (speed: number) => {
    onOrbitSpeedChange?.(speed)
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
      
      // Track successful connection
      track("Connection Success", {
        timestamp: new Date().toISOString()
      })
      
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

  const handleClearCache = async () => {
    try {
      if (apiUrl) {
        await clearCache(apiUrl)
        onReload()
      }
    } catch (error) {
      console.error("Failed to clear cache:", error)
    }
  }

  const handleCancelLoading = () => {
    onCancel?.()
  }

  return (
    <>
      <AnimatePresence initial={false}>
        {sidebarCollapsed ? (
          // Hamburger button when collapsed
          <motion.div
            key="sidebar-container"
            layoutId="sidebar-container"
            className="fixed left-4 z-40"
            style={{ top: "var(--header-offset)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.15,
            }}
          >
            <motion.div
              layoutId="sidebar-card"
              className="rounded-2xl border bg-card shadow-sm"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                duration: 0.4,
              }}
            >
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(false)}
                  title="Expand sidebar"
                >
                  <IconMenu2 className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          // Full sidebar when expanded
          <motion.div
            key="sidebar-container"
            layoutId="sidebar-container"
            className="fixed left-4 right-4 z-40 w-[calc(100%-2rem)] md:right-auto md:w-[320px]"
            style={{ top: "var(--header-offset)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.15,
            }}
          >
            <div className="space-y-2">
              {/* Toolbar */}
              <motion.div
                layoutId="sidebar-card"
                className="rounded-2xl border bg-card shadow-sm"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  duration: 0.4,
                }}
              >
                <div className="p-2">
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
                      variant={activePanel === 'customize' ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => handlePanelToggle('customize')}
                      title="Customize"
                    >
                      <IconAdjustments className="h-4 w-4" />
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
                      onClick={onRecenter} 
                      title="Recenter graph"
                      disabled={!graphData || isLoading}
                    >
                      <IconFocus className="h-4 w-4" />
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
                  </div>
                </div>
              </motion.div>

              {/* Panel content */}
              <AnimatePresence mode="wait">
                {activePanel && (
                  <motion.div
                    key={activePanel}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{
                      duration: 0.2,
                      layout: { duration: 0 }
                    }}
                  >
                    <Card className="flex max-h-[calc(100vh-var(--header-offset)-5rem)] flex-col overflow-hidden pt-2 pb-4" style={{ willChange: 'contents' }}>
                      <div className="node-preview-content flex-1 overflow-y-auto overflow-x-hidden p-4">
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
                            onClearCache={handleClearCache}
                            onCancelLoading={handleCancelLoading}
                          />
                        )}
                        {activePanel === 'stats' && (
                          <StatsPanel stats={stats} />
                        )}
                        {activePanel === 'search' && (
                          <SearchPanel 
                            graphData={graphData}
                            onNodeSelect={onNodeSelect}
                          />
                        )}
                        {activePanel === 'customize' && (
                          <CustomizePanel
                            isDarkMode={isDarkMode}
                            is3DMode={is3DMode}
                            isOrbiting={isOrbiting}
                            orbitSpeed={orbitSpeed}
                            bloomMode={bloomMode}
                            showLabels={showLabels}
                            showWikilinks={showWikilinks ?? true}
                            showTags={showTags ?? false}
                            showFolders={showFolders ?? false}
                            onThemeChange={handleThemeChange}
                            on3DModeChange={handle3DModeChange}
                            onOrbitingChange={handleOrbitingChange}
                            onOrbitSpeedChange={handleOrbitSpeedChange}
                            onBloomModeChange={onBloomModeChange || (() => {})}
                            onShowLabelsChange={onShowLabelsChange || (() => {})}
                            onWikilinksChange={onShowWikilinksChange || (() => {})}
                            onTagsChange={onShowTagsChange || (() => {})}
                            onFoldersChange={onShowFoldersChange || (() => {})}
                          />
                        )}
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

