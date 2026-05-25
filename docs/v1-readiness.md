# V1 Readiness Checklist

## Product

- Define one narrow beachhead: agent platforms and developer tools that already receive generic outcome prompts.
- Keep the product source-agnostic: GitHub, chat, browser, workflow tools, and app wrappers are demand adapters, not the product boundary.
- Preserve the gateway promise: find the right path to outcome execution at the moment an agent is deciding what to do.

## API

- Version every endpoint under `/v1`.
- Add authenticated tenants, API keys, scopes, rate limits, and idempotency guarantees.
- Keep dry-run route decisions separate from executable dispatch. V0 exposes `/v0/dispatch` only as a disabled proof endpoint.
- Add supplier bid schema with price, latency, compute location, model/tool claims, evidence, and acceptance terms.
- Add outcome acceptance schema with dispute states and rework reasons.

## Marketplace

- Start with owned local agents and verified internal tools as supply.
- Add external supply only after quality scoring, identity, abuse controls, and payment settlement are defined.
- Rank on more than price: quality, latency, cost, data-boundary fit, tool fit, reliability, and verifier confidence.
- Avoid pay-only-on-acceptance as the default. Compute-bearing suppliers need rejected-work and cancellation rules.

## Trust

- Add private-context mode only after auth, audit, retention, and encryption exist.
- Add explicit red team fixtures for prompt injection, secret exfiltration, supplier collusion, and malicious requester prompts.
- Add operational monitoring for high rejection rates, suspicious repeated private-input attempts, and cost anomalies.

## Commercial

- Keep pricing micro and usage-based.
- Charge for route calls, successful dispatch, or accepted outcomes only when cost accounting is real.
- Do not sell a subscription before usage caps, budget controls, and value metrics are proven.

## Distribution

- Embed where agents already decide how to execute: IDE agents, app wrappers, workflow runners, browser agents, and internal automation desks.
- Provide a simple HTTP API first. MCP can be an adapter later, not the product shape.
- Make docs and examples readable by both developers and agents.
