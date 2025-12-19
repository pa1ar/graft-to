"use client"

import * as React from "react"
import { IconChevronDown } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

interface AccordionProps {
  children: React.ReactNode
  className?: string
}

interface AccordionItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

interface AccordionTriggerProps {
  children: React.ReactNode
  className?: string
}

interface AccordionContentProps {
  children: React.ReactNode
  className?: string
}

const AccordionContext = React.createContext<{
  openItems: Set<string>
  toggleItem: (value: string) => void
}>({
  openItems: new Set(),
  toggleItem: () => {},
})

const ItemContext = React.createContext<{
  value: string
  isOpen: boolean
}>({
  value: "",
  isOpen: false,
})

function Accordion({ children, className }: AccordionProps) {
  const [openItems, setOpenItems] = React.useState<Set<string>>(new Set())

  const toggleItem = React.useCallback((value: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }, [])

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem }}>
      <div className={cn("space-y-2", className)}>{children}</div>
    </AccordionContext.Provider>
  )
}

function AccordionItem({ value, children, className }: AccordionItemProps) {
  const { openItems } = React.useContext(AccordionContext)
  const isOpen = openItems.has(value)

  return (
    <ItemContext.Provider value={{ value, isOpen }}>
      <div
        className={cn(
          "rounded-2xl border bg-card overflow-hidden",
          className
        )}
      >
        {children}
      </div>
    </ItemContext.Provider>
  )
}

function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const { value, isOpen } = React.useContext(ItemContext)
  const { toggleItem } = React.useContext(AccordionContext)

  return (
    <button
      type="button"
      onClick={() => toggleItem(value)}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50",
        className
      )}
    >
      <span>{children}</span>
      <IconChevronDown
        className={cn(
          "h-4 w-4 transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  )
}

function AccordionContent({ children, className }: AccordionContentProps) {
  const { isOpen } = React.useContext(ItemContext)

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-200",
        isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
      )}
    >
      <div className={cn("px-4 pb-3 text-sm text-muted-foreground", className)}>
        {children}
      </div>
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }

