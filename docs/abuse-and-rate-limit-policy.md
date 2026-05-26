# Abuse And Rate-Limit Policy

The public demo exists to show the route-decision contract, not to provide production execution capacity.

## Current Controls

- Default limit: 60 requests per minute per observed client key.
- The limit can be changed with `BEAN_GATEWAY_RATE_LIMIT_PER_MINUTE`.
- Responses include `x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset`.
- Exceeded limits return `429 rate_limit_exceeded` with `retry-after`.
- Metrics count rate-limited requests but do not store request bodies.

## Abuse Signals

- Repeated private-input rejection attempts.
- Attempts to send credentials, secrets, local file paths, private repo refs, or internal URLs.
- Attempts to use `/v0/dispatch` for execution.
- High request volume, large bodies, or malformed JSON floods.

## Required Before Production

- Per-tenant quotas and API-key scopes.
- Persistent abuse counters.
- Alerting on rejection spikes, rate-limit spikes, and dispatch attempts.
- Manual review queue for suspicious but non-obvious requests.
- Clear suspension rules for clients and suppliers.

## Public Beta Triage

- Treat repeated private-input rejection attempts as a beta stop condition.
- Treat attempts to use the demo for customer, paid, supplier, trading, exploit, or account-mutating work as off-scope.
- Pause sharing if support load exceeds manual review capacity.
- Keep all beta feedback public or metadata-only unless a private reporting channel is added.
