/**
 * Craft API Proxy
 * 
 * Proxies requests to Craft API to avoid CORS issues.
 * Credentials are passed via headers and never stored on server.
 */

import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const craftUrl = request.headers.get('x-craft-url')
  const craftKey = request.headers.get('x-craft-key')

  if (!craftUrl || !craftKey) {
    return Response.json(
      { error: 'Missing Craft API credentials' },
      { status: 401 }
    )
  }

  const resolvedParams = await params
  const path = resolvedParams.path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `${craftUrl}/${path}${searchParams ? `?${searchParams}` : ''}`

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
        { status: response.status }
      )
    }

    const data = await response.json()

    return Response.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Craft API proxy error:', error)
    return Response.json(
      { error: 'Failed to fetch from Craft API', details: String(error) },
      { status: 500 }
    )
  }
}

