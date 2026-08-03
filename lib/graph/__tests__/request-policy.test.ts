import { describe, expect, test } from 'bun:test'
import {
  getRateAwareIntervalMs,
  getRetryDelayMs,
  isRetriableStatus,
  readRateLimitState,
  shouldPauseForRateLimit,
} from '../request-policy'

describe('Craft request policy', () => {
  test('reads the current relative x-ratelimit window headers', () => {
    const headers = new Headers({
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '88',
      'x-ratelimit-reset': '41',
    })

    expect(readRateLimitState(headers)).toEqual({
      limit: 100,
      remaining: 88,
      resetAfterMs: 41_000,
    })
  })

  test('slows down as the remaining request budget gets low', () => {
    const interval = getRateAwareIntervalMs(
      { limit: 100, remaining: 10, resetAfterMs: 20_000 },
      750
    )

    expect(interval).toBe(4_000)
    expect(shouldPauseForRateLimit({ remaining: 5, resetAfterMs: 20_000 })).toBe(true)
  })

  test('honors Retry-After and retries both 429 and 5xx', () => {
    const response = new Response('{}', {
      status: 429,
      headers: { 'Retry-After': '12' },
    })

    expect(getRetryDelayMs(response, 0, 500, () => 0)).toBe(12_000)
    expect(isRetriableStatus(429)).toBe(true)
    expect(isRetriableStatus(500)).toBe(true)
    expect(isRetriableStatus(502)).toBe(true)
    expect(isRetriableStatus(404)).toBe(false)
  })
})
