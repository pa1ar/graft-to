"use client"

import * as React from "react"
import { track } from "@vercel/analytics/react"
import { IconAlertTriangle, IconLoader, IconCheck, IconArrowRight } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  computeTagRename,
  executeTagRename,
  createFetcher,
  type GraphNode,
  type GraphData,
  type TagRenamePreview,
  type TagRenameProgress,
  type TagRenameResult,
} from "@/lib/graph"

type DialogPhase = "input" | "confirm" | "executing" | "done" | "error"

interface TagRenameDialogProps {
  node: GraphNode
  graphData: GraphData
  onClose: () => void
  onRenameComplete: (renameMap: Map<string, string>) => void
}

const TAG_REGEX = /^[a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*$/

export function TagRenameDialog({ node, graphData, onClose, onRenameComplete }: TagRenameDialogProps) {
  const oldTagPath = node.metadata?.tagPath ?? ""
  const [newTagPath, setNewTagPath] = React.useState(oldTagPath)
  const [phase, setPhase] = React.useState<DialogPhase>("input")
  const [preview, setPreview] = React.useState<TagRenamePreview | null>(null)
  const [progress, setProgress] = React.useState<TagRenameProgress | null>(null)
  const [result, setResult] = React.useState<TagRenameResult | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const isValidTag = TAG_REGEX.test(newTagPath)
  const isUnchanged = newTagPath.trim() === oldTagPath

  function handlePreview() {
    const trimmed = newTagPath.trim()
    if (!isValidTag || isUnchanged) return

    // read document IDs directly from the in-memory graph — instant, no API call
    const p = computeTagRename(oldTagPath, trimmed, graphData)
    setPreview(p)
    setPhase("confirm")
  }

  async function handleExecute() {
    const trimmed = newTagPath.trim()
    if (!preview) return

    const apiUrl = typeof window !== "undefined" ? localStorage.getItem("craft_api_url") : null
    const apiKey = typeof window !== "undefined" ? localStorage.getItem("craft_api_key") : null
    if (!apiUrl || !apiKey) {
      setErrorMessage("No Craft API credentials found. Please connect your workspace.")
      setPhase("error")
      return
    }

    setPhase("executing")
    abortRef.current = new AbortController()

    try {
      const fetcher = createFetcher(apiUrl, apiKey)
      const res = await executeTagRename(
        fetcher,
        oldTagPath,
        trimmed,
        preview.affectedDocumentIds,
        (p) => setProgress(p),
        abortRef.current.signal
      )
      setResult(res)

      if (!abortRef.current.signal.aborted) {
        track("Tag Rename Execute", {
          documents: res.savedDocumentCount,
          errors: res.errors.length,
        })
        setPhase("done")
      }
    } catch (err) {
      if (abortRef.current?.signal.aborted) return
      track("Tag Rename Execute", {
        documents: 0,
        errors: err instanceof Error ? err.message : "unknown",
      })
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase("error")
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    onClose()
  }

  function handleDone() {
    // only patch graph/cache when all saveable docs were saved;
    // partial API failures leave some docs with the old tag — patching
    // the full renameMap would make the graph inconsistent until refresh
    if (result && result.savedDocumentCount > 0 && result.savedDocumentCount === result.affectedDocumentCount && preview) {
      onRenameComplete(preview.renameMap)
    }
    onClose()
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && phase !== "executing") onClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg border bg-background shadow-lg">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Rename Tag</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {phase === "input" && `Enter a new name for ${node.title}`}
            {phase === "confirm" && "Review the changes before proceeding"}
            {phase === "executing" && "Applying changes to your Craft documents…"}
            {phase === "done" && "Rename complete"}
            {phase === "error" && "Something went wrong"}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* INPUT phase */}
          {phase === "input" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="tag-rename-input">New tag name</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground select-none">#</span>
                  <Input
                    id="tag-rename-input"
                    value={newTagPath}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTagPath(e.target.value)}
                    placeholder={oldTagPath}
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter" && isValidTag && !isUnchanged) handlePreview()
                      if (e.key === "Escape") onClose()
                    }}
                  />
                </div>
                {newTagPath && !isValidTag && (
                  newTagPath.endsWith('/')
                    ? <p className="text-xs text-muted-foreground">Continue typing to complete the nested tag name.</p>
                    : <p className="text-xs text-destructive">Tag names can only contain letters, numbers, underscores, and slashes (for nesting).</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Renaming a parent tag (e.g. <code className="font-mono">#{oldTagPath}</code>) will also rename all its subtags
                (e.g. <code className="font-mono">#{oldTagPath}/sub</code> → <code className="font-mono">#{(isValidTag && newTagPath) || "newname"}/sub</code>).
              </p>
            </>
          )}

          {/* CONFIRM phase */}
          {phase === "confirm" && preview && (
            <>
              {/* Stats */}
              <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-1">
                <div className="font-medium">
                  {preview.affectedDocumentIds.length}{" "}
                  {preview.affectedDocumentIds.length === 1 ? "document" : "documents"} will be updated
                </div>
                <div className="text-muted-foreground">
                  {preview.affectedTagPaths.length}{" "}
                  {preview.affectedTagPaths.length === 1 ? "tag" : "tags"} will be renamed
                </div>
              </div>

              {/* Tag rename list */}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {preview.affectedTagPaths.map((oldPath: string) => (
                  <div key={oldPath} className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-muted-foreground">#{oldPath}</span>
                    <IconArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span>#{preview.renameMap.get(oldPath)}</span>
                  </div>
                ))}
              </div>

              {/* Staleness advisory */}
              <p className="text-xs text-muted-foreground">
                Document count is based on your current graph. Documents tagged after your last graph
                build won&apos;t appear above — consider refreshing the graph first if documents were recently tagged.
              </p>

              {/* Warning */}
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex gap-3">
                <IconAlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  This will modify block content directly in your Craft documents. The operation
                  cannot be undone from Graft. If you need to revert, use Craft's own version history.
                </p>
              </div>
            </>
          )}

          {/* EXECUTING phase */}
          {phase === "executing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <IconLoader className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                <span>{progress?.message ?? "Starting…"}</span>
              </div>
              {progress && progress.total > 0 && (
                <div className="w-full rounded-full bg-muted h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* DONE phase */}
          {phase === "done" && result && (() => {
            const hasErrors = result.errors.length > 0
            const hasSkips = result.skippedBlockCount > 0
            const isFullSuccess = !hasErrors && !hasSkips
            const isTotalFailure = result.savedDocumentCount === 0

            return (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                {isFullSuccess ? (
                  <IconCheck className="h-4 w-4 text-green-500 shrink-0" />
                ) : isTotalFailure ? (
                  <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <IconAlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <span>
                  {isFullSuccess
                    ? <>Renamed <code className="font-mono">#{oldTagPath}</code> to <code className="font-mono">#{newTagPath.trim()}</code></>
                    : result.savedDocumentCount > 0
                      ? <>Partially renamed <code className="font-mono">#{oldTagPath}</code></>
                      : <>Failed to rename <code className="font-mono">#{oldTagPath}</code></>
                  }
                </span>
              </div>
              <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-0.5">
                <div>{result.savedDocumentCount} of {result.affectedDocumentCount} documents saved</div>
                <div>{result.savedBlockCount} blocks modified</div>
                {hasSkips && (
                  <div className="text-amber-600 dark:text-amber-400">{result.skippedBlockCount} {result.skippedBlockCount === 1 ? 'block' : 'blocks'} skipped (unsupported markdown)</div>
                )}
                {hasErrors && (
                  <div className="text-destructive">{result.errors.length} {result.errors.length === 1 ? 'error' : 'errors'} (check console for details)</div>
                )}
              </div>
              {isFullSuccess && (
                <p className="text-xs text-muted-foreground">
                  The graph will update to reflect the changes. Did Graft help? Consider sponsoring.
                </p>
              )}
              {!isFullSuccess && result.savedDocumentCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {hasSkips && 'Some blocks contain HTML or multi-paragraph content that Craft cannot accept via API. '}
                  The graph will update for successful renames.{hasErrors && ' Refresh to retry failed documents.'}
                </p>
              )}
              {isTotalFailure && (
                <p className="text-xs text-muted-foreground">
                  {hasSkips && !hasErrors
                    ? 'All matching blocks contain unsupported markdown (HTML tags or multi-paragraph content). These must be edited manually in Craft.'
                    : 'No documents were saved. Check the browser console for the error details from the Craft API.'}
                </p>
              )}
            </div>
            )
          })()}

          {/* ERROR phase */}
          {phase === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 flex gap-3">
              <IconAlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{errorMessage ?? "An unexpected error occurred."}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-2">
          {phase === "input" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handlePreview}
                disabled={!isValidTag || isUnchanged}
              >
                Preview Changes
              </Button>
            </>
          )}
          {phase === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setPhase("input")}>Back</Button>
              <Button
                variant="destructive"
                onClick={handleExecute}
                disabled={!preview || preview.affectedDocumentIds.length === 0}
              >
                Rename
              </Button>
            </>
          )}
          {phase === "executing" && (
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          )}
          {phase === "done" && (
            <>
              {result && result.savedDocumentCount > 0 && result.errors.length === 0 && (
                <a
                  href="https://1ar.io/tools/graft"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("Sponsor Click", { source: "rename" })}
                >
                  <Button variant="outline" type="button">Sponsor</Button>
                </a>
              )}
              <Button onClick={handleDone}>Done</Button>
            </>
          )}
          {phase === "error" && (
            <>
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => setPhase("input")}>Try Again</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
