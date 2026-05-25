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

## Future Product Surface

- Authenticated tenant workspaces.
- Private-context mode with explicit data-boundary controls.
- Supplier registry with quality, speed, price, compute-location, and reliability scoring.
- Outcome acceptance workflow with escrow-like payment state, not blind pay-on-acceptance risk.
- Agent and tool adapters that can bid, prove capability, and carry their own compute/token costs.
- Abuse controls for spam, data exfiltration, prompt injection, Sybil suppliers, and payment gaming.

## Positioning Constraint

This POC should not claim that a two-sided marketplace exists. The accurate claim is that the gateway can sit between outcome demand and execution supply, then make a policy-aware selection when supply is available.
