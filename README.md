# Bean Execution Gateway

Bean Execution Gateway helps an agent choose the safest execution path for an outcome before it runs.

Live demo: https://bean-execution-gateway-poc.onrender.com

Positioning: BEAN is not a live marketplace yet. It is a gateway that helps an agent decide whether to use an owned agent, use an available public path, build a new agent, or block the request before anyone pays for compute.

Public beta status: prepared for trusted external review, not broadly launched and not ready for private/customer/paid traffic. Start with [Evaluator quickstart](docs/evaluator-quickstart.md), [How to review](docs/how-to-review.md), and [First-user readiness](docs/first-user-readiness.md).

## Start Here

1. Open the [live demo](https://bean-execution-gateway-poc.onrender.com).
2. Use only public or synthetic inputs.
3. Click one guided route: Use public path, Use or build, or Block risky work.
4. Read the decision memo.
5. Run the proof packet if one is available.
6. File metadata-only feedback from the memo.

## What It Proves

- An outcome can become a ranked execution-path decision.
- The result can compare owned-agent, public-path, build-new, and blocked supplier options.
- The memo can show quality, speed, cost, risk, proofability, blocked actions, and human approval gates.
- The hosted demo can reject private-like input before routing.
- Feedback can be collected as metadata only.

## Why Not Just Ask ChatGPT, Cursor, Or Claude?

Those tools can solve tasks. BEAN decides whether a task should be executed, which path should run, what proof is needed, and which spend/data/public-write gates stop execution. It is the routing and control layer around agent work, not another chat surface.

## What It Does Now

- Accepts public or synthetic outcome requests through `/v0/route`.
- Classifies spend, private context, public writes, account credentials, external suppliers, secrets, regulated data, and unsafe work.
- Returns a deterministic route decision with ranked local executors, stop conditions, cost fields, sanitizer findings, and verifier artifacts.
- Records outcomes locally, or in memory only when running as the hosted public demo.
- Scans fixture or read-only public GitHub demand through `/v0/open-demand/*`, ranks candidate tasks, builds local packets, and runs a static verifier.
- Turns a broad outcome into a selected agent path through `/v0/path`, including owned-agent, public-path, or build-decision routing.
- Runs bounded public proof packets for fixture and public GitHub sources with zero spend, no installs, and no external writes.
- Exposes proof examples through `/v0/examples`.
- Accepts metadata-only route feedback through `/v0/feedback` and `/v0/open-demand/feedback`.
- Exposes readiness, metadata-only metrics, security headers, and rate-limit headers.
- Exposes V1 local-contract control-plane endpoints for tenant scope, context envelopes, supplier bids, outcome acceptance, payment quotes, abuse cases, audit summaries, replay metrics, and the 80-goal checklist.
- Exposes V2 product-delivery endpoints for the 120-goal product map, outcome intake, route decisions, supply bids, execution plans, acceptance/payment state, metadata-only feedback, trust reviews, learning summaries, ops, quality, commercial, and GTM readiness.
- Ships a public beta packet with positioning, onboarding, feedback templates, support operations, decision gates, and learning metrics.
- Ships a first-user readiness packet with guided demo, decision memo, evaluator docs, and review questions.
- Hard-blocks executable dispatch through `/v0/dispatch`.
- Ships with proof fixtures, adversarial fixtures, SDK stubs, adapter stubs, and a Render Free demo config.

## What It Does Not Do Yet

- It does not execute external work.
- It does not call suppliers, freelancers, marketplace agents, LLM APIs, payment rails, trading tools, or hosted compute providers.
- It does not authenticate tenants, manage private context, store secrets, or process customer data.
- It does not make supplier bids selectable when they require external execution, non-public data, or nonzero payment.
- It does not monetize routes or charge requesters.
- It does not claim marketplace liquidity. The supplier network is represented only as a blocked future class.
- It does not make the 120 V2 product contracts equivalent to a paid/private/customer production launch.

## Quickstart

```bash
npm run gateway:verify
npm run gateway:demo
```

Then open `http://127.0.0.1:8787`.

If that port is already in use:

```bash
PORT=8791 npm run gateway:demo
BEAN_GATEWAY_BASE_URL=http://127.0.0.1:8791 npm run gateway:smoke:hosted
```

## API

```bash
curl -s http://127.0.0.1:8787/v0/health
curl -s http://127.0.0.1:8787/v0/ready
curl -s http://127.0.0.1:8787/v0/metrics
curl -s http://127.0.0.1:8787/v0/examples
curl -s http://127.0.0.1:8787/v0/openapi.json
curl -s http://127.0.0.1:8787/v0/open-demand/health
curl -s http://127.0.0.1:8787/v0/open-demand/learning
curl -s http://127.0.0.1:8787/v0/v1/goals
curl -s http://127.0.0.1:8787/v0/v1/readiness
curl -s http://127.0.0.1:8787/v0/v1/audit
curl -s http://127.0.0.1:8787/v0/v1/replay
curl -s http://127.0.0.1:8787/v0/v2/goals
curl -s http://127.0.0.1:8787/v0/v2/readiness
curl -s http://127.0.0.1:8787/v0/v2/learning
curl -s http://127.0.0.1:8787/v0/v2/gtm
curl -s -X POST http://127.0.0.1:8787/v0/path \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-path-request.json
curl -s -X POST http://127.0.0.1:8787/v0/v2/intake \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/v2-intake-request.json
curl -s -X POST http://127.0.0.1:8787/v0/v2/feedback \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/v2-feedback-request.json
curl -s -X POST http://127.0.0.1:8787/v0/open-demand/scan \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-scan-request.json
curl -s -X POST http://127.0.0.1:8787/v0/open-demand/scan \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-public-research-scan-request.json
curl -s -X POST http://127.0.0.1:8787/v0/open-demand/feedback \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-feedback-request.json
curl -s -X POST http://127.0.0.1:8787/v0/route \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/public-issue-request.json
curl -s -X POST http://127.0.0.1:8787/v0/v1/supplier-bids \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/v1-supplier-bid-request.json
curl -s -X POST http://127.0.0.1:8787/v0/v1/payment-quotes \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/v1-payment-quote-request.json
curl -s -X POST http://127.0.0.1:8787/v0/dispatch \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/public-issue-request.json
```

Compatibility aliases without `/v0` are still available for the POC, but new callers should use `/v0/...`.

## Verification

```bash
npm run gateway:verify
BEAN_GATEWAY_BASE_URL=http://127.0.0.1:8787 npm run gateway:smoke:hosted
```

The verification suite checks proof tasks, adversarial policy fixtures, schema self-tests, registry lint, open-demand guardrails, zero spend, zero external writes, and zero external executions.

The hosted smoke suite also checks security headers, rate-limit headers, `/v0/ready`, `/v0/metrics`, disabled dispatch, hosted private-input rejection, memory-only hosted outcomes, V1 contracts, and the V2 product-delivery contracts.

## Public Demo Boundary

Render POC constraints:

- Use the Free instance type only.
- Do not add a payment method.
- Do not add secrets or private environment variables.
- Do not connect private repositories or work/org accounts.
- Stop if the platform asks for a paid plan, payment method, private data, private repo access, or broader account permissions.

Hosted demo input scope:

- Public or synthetic requests only.
- No private, work, company, customer, secret, credential, local-file, internal, or regulated data.
- No request-body persistence and no request-body logging in the app code.
- Runtime rate limiting is on by default.
- Security headers are emitted on API and demo responses.
- `/v0/ready` intentionally reports `production_ready: false`.
- `/v0/v2/readiness` intentionally reports `ok_for_private_customer_or_paid_traffic: false`.

## Public Beta Boundary

The current external-use target is a narrow trusted beta, not a broad launch.

- Invite 5-10 technical users only after Stephen approves the invite list and message.
- Use GitHub Issues for non-sensitive bugs, route feedback, and feature requests.
- Do not accept private, customer, work, secret, credential, regulated, paid, or external-supplier requests.
- Treat every route as advice plus proof, not permission to execute outside the demo.
- Review feedback weekly before changing positioning or expanding distribution.

## Docs

- [Product definition](docs/product-definition.md)
- [Evaluator quickstart](docs/evaluator-quickstart.md)
- [How to review](docs/how-to-review.md)
- [Example results](docs/example-results.md)
- [First-user readiness](docs/first-user-readiness.md)
- [POC truth pass](docs/poc-truth.md)
- [API examples](docs/api-examples.md)
- [Safety and trust](docs/safety-and-trust.md)
- [V1 readiness](docs/v1-readiness.md)
- [Pre-discovery readiness](docs/pre-discovery-readiness.md)
- [Public launch packet](docs/public-launch-packet.md)
- [Public beta readiness](docs/public-beta-readiness.md)
- [Public beta positioning](docs/public-beta-positioning.md)
- [Public beta onboarding](docs/public-beta-onboarding.md)
- [Public beta feedback and support](docs/public-beta-feedback-and-support.md)
- [Public beta operations](docs/public-beta-operations.md)
- [Public beta decision packet](docs/public-beta-decision-packet.md)
- [Public beta learning metrics](docs/public-beta-learning-metrics.md)
- [Live-traffic readiness](docs/live-traffic-readiness.md)
- [Production cutover](docs/production-cutover.md)
- [Abuse and rate-limit policy](docs/abuse-and-rate-limit-policy.md)
- [Public proof runner](docs/public-proof-runner.md)
- [Open demand adapters](docs/open-demand-adapters.md)
- [Path API and scoring](docs/path-api-and-scoring.md)
- [V1 product goals](docs/v1-product-goals.md)
- [V1 local-contract completion](docs/v1-local-contract-completion.md)
- [V2 product delivery goals](docs/v2-product-delivery-goals.md)
- [Public demo terms](TERMS.md)
