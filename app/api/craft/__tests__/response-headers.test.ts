import { describe, expect, test } from 'bun:test'
import { getCraftResponseHeaders } from '../response-headers'

describe('getCraftResponseHeaders', () => {
  test('forwards Craft retry and rate-limit headers', () => {
    const upstream = new Response('{}', {
      headers: {
        'Retry-After': '42',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '4',
        'X-RateLimit-Reset': '38',
        'Set-Cookie': 'private=value',
      },
    })

    const headers = getCraftResponseHeaders(upstream)

    expect(headers.get('retry-after')).toBe('42')
    expect(headers.get('x-ratelimit-limit')).toBe('100')
    expect(headers.get('x-ratelimit-remaining')).toBe('4')
    expect(headers.get('x-ratelimit-reset')).toBe('38')
    expect(headers.get('cache-control')).toBe('no-store')
    expect(headers.get('set-cookie')).toBeNull()
  })
})
