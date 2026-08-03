/**
 * Craft API Proxy
 *
 * Proxies requests to Craft API to avoid CORS issues.
 * Credentials are passed via headers and never stored on server.
 */

import { NextRequest } from 'next/server'
import { getCraftResponseHeaders } from '../response-headers'

function getCredentials(request: NextRequest): { craftUrl: string; craftKey: string } | null {
  const craftUrl = request.headers.get('x-craft-url')
  const craftKey = request.headers.get('x-craft-key')
  if (!craftUrl || !craftKey) return null
  return { craftUrl, craftKey }
}

function buildTargetUrl(request: NextRequest, craftUrl: string, path: string[]): string {
  const searchParams = request.nextUrl.searchParams.toString()
  return `${craftUrl}/${path.join('/')}${searchParams ? `?${searchParams}` : ''}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const credentials = getCredentials(request)
  if (!credentials) {
    return Response.json({ error: 'Missing Craft API credentials' }, { status: 401 })
  }

  const { craftUrl, craftKey } = credentials
  const resolvedParams = await params
  const url = buildTargetUrl(request, craftUrl, resolvedParams.path)

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${craftKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Craft API error:', response.status, errorText)
      return Response.json(
        { error: `Craft API error: ${response.statusText}`, details: errorText },
        { status: response.status, headers: getCraftResponseHeaders(response) }
      )
    }

    const data = await response.json()
    return Response.json(data, {
      status: response.status,
      headers: getCraftResponseHeaders(response),
    })
  } catch (error) {
    console.error('Craft API proxy error:', error)
    return Response.json(
      { error: 'Failed to fetch from Craft API', details: String(error) },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const credentials = getCredentials(request)
  if (!credentials) {
    return Response.json({ error: 'Missing Craft API credentials' }, { status: 401 })
  }

  const { craftUrl, craftKey } = credentials
  const resolvedParams = await params
  const url = buildTargetUrl(request, craftUrl, resolvedParams.path)

  try {
    const body = await request.text()
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${craftKey}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Craft API error:', response.status, errorText)
      return Response.json(
        { error: `Craft API error: ${response.statusText}`, details: errorText },
        { status: response.status, headers: getCraftResponseHeaders(response) }
      )
    }

    const data = await response.json()
    return Response.json(data, {
      status: response.status,
      headers: getCraftResponseHeaders(response),
    })
  } catch (error) {
    console.error('Craft API proxy error:', error)
    return Response.json(
      { error: 'Failed to fetch from Craft API', details: String(error) },
      { status: 500 }
    )
  }
}
