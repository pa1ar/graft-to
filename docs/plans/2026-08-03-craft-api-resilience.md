# Craft API resilience

Craft issue: 1SS-400

## Outcome

Graft stays within Craft's published response limits during full graph scans, recovers from transient 429 and 5xx responses, and never stores an incomplete graph as a successful cache entry.

## Verified context

- craft-cli uses the current `connect.craft.do/links/.../api/v1` contract.
- craft-cli retries 429 and 5xx responses, honors `Retry-After`, and otherwise uses exponential backoff.
- Current Craft responses expose `x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset`.
- A first Graft load performs one `/blocks` request per document plus document and folder requests. Concurrency alone does not keep a 352-document space below a 100-request window.

## Scope

1. Forward Craft rate-limit and retry headers through the Next.js proxy.
2. Add shared request pacing and response-aware cooldowns in the browser fetcher.
3. Retry 429, transient 5xx, and network failures with bounded exponential backoff and jitter.
4. Record document fetch failures and reject incomplete full builds instead of caching them.
5. Add unit tests for pacing, retry behavior, and failed full builds.
6. Run lint, tests, production build, browser smoke QA, and deploy graft.to.

## Proof of done

- `bun test`
- `bun lint`
- `bun build`
- Production deployment and live graft.to smoke check
- Craft issue log and 01ar Graft project trace updated

