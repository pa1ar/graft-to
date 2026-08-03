const FORWARDED_CRAFT_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
] as const

export function getCraftResponseHeaders(response: Response): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store' })

  for (const name of FORWARDED_CRAFT_HEADERS) {
    const value = response.headers.get(name)
    if (value !== null) headers.set(name, value)
  }

  return headers
}
