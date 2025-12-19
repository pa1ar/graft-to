"use client"

import * as React from "react"

const HEADER_EVENT = "graft:header-size-change"
const HEADER_FALLBACK = 56
const HEADER_GAP = 12

export function Header() {
  const headerRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const headerEl = headerRef.current
    if (!headerEl) return

    const updateHeaderVars = () => {
      const height = headerEl.getBoundingClientRect().height || HEADER_FALLBACK
      const offset = height + HEADER_GAP

      const root = document.documentElement
      root.style.setProperty("--header-height", `${height}px`)
      root.style.setProperty("--header-offset", `${offset}px`)

      window.dispatchEvent(new CustomEvent(HEADER_EVENT, { detail: { height, offset } }))
    }

    const resizeObserver = new ResizeObserver(updateHeaderVars)
    resizeObserver.observe(headerEl)

    window.addEventListener("resize", updateHeaderVars)
    updateHeaderVars()

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateHeaderVars)
    }
  }, [])

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-9999 border-b border-border bg-background/80 backdrop-blur-md"
    >
      <div className="flex items-center justify-between px-6 py-2">
        <div className="flex items-center gap-2">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="20" 
            height="20" 
            viewBox="0 0 24 24"
            className="rotate-180"
          >
            <path 
              fill="none" 
              stroke="currentColor" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              d="M18 16v.01M6 16v.01M12 5v.01M12 12v.01M12 1a4 4 0 0 1 2.001 7.464l.001.072a4 4 0 0 1 1.987 3.758l.22.128a4 4 0 0 1 1.591-.417L18 12a4 4 0 1 1-3.994 3.77l-.28-.16c-.522.25-1.108.39-1.726.39c-.619 0-1.205-.14-1.728-.391l-.279.16L10 16a4 4 0 1 1-2.212-3.579l.222-.129a4 4 0 0 1 1.988-3.756L10 8.465A4 4 0 0 1 8.005 5.2L8 5a4 4 0 0 1 4-4"
            />
          </svg>
          <span className="font-semibold text-sm">Graft Docs</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-xs text-muted-foreground">
            made with &lt;3 for{' '}
            <a 
              href="https://www.craft.do/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-2"
            >
              Craft
            </a>
            {' '}by{' '}
            <a 
              href="https://x.com/pa1ar" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-2"
            >
              pa1ar
            </a>
          </div>
          
          <a
            href="https://github.com/pa1ar/graft-do/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="View on GitHub"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  )
}
