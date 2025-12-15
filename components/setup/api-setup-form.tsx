"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { createFetcher } from "@/lib/graph"

const STORAGE_KEY_URL = "craft_api_url"
const STORAGE_KEY_KEY = "craft_api_key"

export function ApiSetupForm() {
  const router = useRouter()
  const [apiUrl, setApiUrl] = React.useState("")
  const [apiKey, setApiKey] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const storedUrl = localStorage.getItem(STORAGE_KEY_URL)
    const storedKey = localStorage.getItem(STORAGE_KEY_KEY)
    if (storedUrl) setApiUrl(storedUrl)
    if (storedKey) setApiKey(storedKey)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

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
      router.push("/graph")
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Invalid URL format")
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to connect to Craft API")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Connect to Craft</CardTitle>
        <CardDescription>
          Enter your Craft API URL to visualize your document graph
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="api-url">API URL</FieldLabel>
            <Input
              id="api-url"
              type="url"
              placeholder="https://connect.craft.do/links/YOUR_LINK/api/v1"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              required
              disabled={isLoading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="api-key">API Key</FieldLabel>
            <Input
              id="api-key"
              type="password"
              placeholder="Your Craft API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              disabled={isLoading}
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Connecting..." : "Connect"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

