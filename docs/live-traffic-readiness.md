# Live-Traffic Readiness

Status: public-demo and public-learning contracts hardened, not customer/live-execution ready.

## Completed In V0

- Security headers are emitted on success and error responses.
- Public demo rate limiting is active and exposes standard rate-limit headers.
- `/v0/ready` separates public-demo readiness from production/customer readiness.
- `/v0/metrics` exposes metadata-only counters and no request bodies.
- `/v0/dispatch` is present but always returns `dispatch_disabled_in_v0`.
- Hosted mode rejects private, work, company, customer, credential, local-file, internal, regulated, and secret-like input before routing.
- Hosted outcome records are memory-only.
- V1 local-contract endpoints cover the 80-goal product checklist for tenant contracts, context envelopes, supplier bids, acceptance, payment quotes, abuse cases, audit, and replay.
- V2 product-delivery endpoints cover the 120-goal fully delivered product checklist as public-demo contracts.
- V2 public-learning traffic can produce metadata-only demand, route, feedback, trust, and replay records without storing raw prompts.
- Smoke tests verify readiness, security headers, rate-limit headers, disabled dispatch, zero spend, zero external writes, zero external executions, and hosted private-input rejection.

## Blocked Before Customer Traffic

- Authenticated tenants and scoped API keys.
- Durable audit logs with retention controls.
- Private-context storage, vaulting, encryption, and tenant isolation.
- Supplier identity, quality scoring, settlement, rejected-work policy, and dispute handling.
- Payment rails, usage accounting, budget controls, and cost anomaly monitoring.
- Operational monitoring, abuse review queue, incident response, and private vulnerability reporting.
- Legal review for terms, privacy, data processing, supplier contracts, and marketplace settlement.

## Current Decision

The hosted service can stay online as a public synthetic demo, public-learning surface, and V1/V2 contract sandbox. It should not be described as a live marketplace or used for customer, private, paid, or external-supplier execution until every blocked gate above is resolved.
