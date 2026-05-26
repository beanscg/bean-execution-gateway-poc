# Product Definition

## One-Sentence Claim

Bean Execution Gateway helps agents turn a requested outcome into a safe execution path by checking policy, cost, context risk, supplier eligibility, and verifier requirements before any work is performed.

## First User

The first user is a developer or agent operator who wants to hand a vague outcome to an agent while preventing accidental spend, private-data handling, public writes, account mutation, or external supplier execution.

## First Buyer

The first buyer is not a broad consumer marketplace. The first credible buyer is an agent platform, developer-tool vendor, or internal automation team that already has agent demand and needs a routing, policy, and verification layer before tools or workers are selected.

## Current Product Surface

- `POST /v0/route`: classify a public or synthetic request and return a route decision.
- `POST /v0/outcomes`: record accepted, rejected, or reworked outcomes.
- `GET /v0/ledger/summary`: summarize outcomes and actual external actions.
- Local CLI and SDK stubs for the same route engine.
- Static hosted demo served by the API process.
- Executor registry with local zero-cost executors and blocked external supplier classes.
- V1 local-contract endpoints for tenant contracts, context envelopes, supplier bid evaluation, acceptance records, payment quote gates, abuse cases, audit summaries, replay metrics, and the 80-goal checklist.
- V2 product-delivery endpoints for the full 120-goal product map, outcome intake, route decisions, supply bids, execution plans, acceptance/payment state, metadata-only feedback, trust reviews, learning summaries, operations, quality, commercial readiness, and go-to-market packet.

## Future Product Surface

- Authenticated tenant workspaces.
- Private-context mode with explicit data-boundary controls.
- Supplier registry with quality, speed, price, compute-location, and reliability scoring.
- Outcome acceptance workflow with escrow-like payment state, not blind pay-on-acceptance risk.
- Agent and tool adapters that can bid, prove capability, and carry their own compute/token costs.
- Abuse controls for spam, data exfiltration, prompt injection, Sybil suppliers, and payment gaming.
- Replacement of contract-only V1 rails with real authenticated, durable, audited, and billable production rails after approval.
- Replacement of contract-only V2 product surfaces with durable hosted learning storage, production auth, private context, legal approvals, supplier execution, payment rails, observability, and on-call coverage after approval.

## Positioning Constraint

This POC should not claim that a two-sided marketplace exists. The accurate claim is that the gateway can sit between outcome demand and execution supply, then make a policy-aware selection when supply is available.
