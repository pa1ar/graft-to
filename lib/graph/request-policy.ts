const RATE_LIMIT_RESERVE = 5

export interface RateLimitState {
  limit?: number
  remaining?: number
  resetAfterMs?: number
}

function parseFiniteNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseDelayHeader(value: string | null, now: number): number | undefined {
  if (value === null || value.trim() === '') return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000

  const date = Date.parse(value)
  if (Number.isFinite(date)) return Math.max(0, date - now)

  return undefined
}

export function readRateLimitState(headers: Headers, now = Date.now()): RateLimitState {
  const reset = parseFiniteNumber(headers.get('x-ratelimit-reset'))
  let resetAfterMs: number | undefined

  if (reset !== undefined && reset >= 0) {
    resetAfterMs = reset > 1_000_000_000
      ? Math.max(0, reset * 1000 - now)
      : reset * 1000
  }

  return {
    limit: parseFiniteNumber(headers.get('x-ratelimit-limit')),
    remaining: parseFiniteNumber(headers.get('x-ratelimit-remaining')),
    resetAfterMs,
  }
}

export function getRateAwareIntervalMs(
  state: RateLimitState,
  minimumIntervalMs: number
): number {
  if (state.remaining === undefined || state.resetAfterMs === undefined) {
    return minimumIntervalMs
  }

  const usableRequests = Math.max(1, state.remaining - RATE_LIMIT_RESERVE)
  return Math.max(minimumIntervalMs, Math.ceil(state.resetAfterMs / usableRequests))
}

export function shouldPauseForRateLimit(state: RateLimitState): boolean {
  return state.remaining !== undefined
    && state.remaining <= RATE_LIMIT_RESERVE
    && state.resetAfterMs !== undefined
    && state.resetAfterMs > 0
}

export function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export function getRetryDelayMs(
  response: Response,
  attempt: number,
  backoffBaseMs: number,
  random = Math.random,
  now = Date.now()
): number {
  const retryAfterMs = parseDelayHeader(response.headers.get('retry-after'), now)
  if (retryAfterMs !== undefined) {
    return retryAfterMs + Math.round(random() * 250)
  }

  if (response.status === 429) {
    const resetAfterMs = readRateLimitState(response.headers, now).resetAfterMs
    if (resetAfterMs !== undefined && resetAfterMs > 0) {
      return resetAfterMs + Math.round(random() * 250)
    }
  }

  const exponential = backoffBaseMs * Math.pow(2, attempt)
  return Math.round(exponential * (0.8 + random() * 0.4))
}
