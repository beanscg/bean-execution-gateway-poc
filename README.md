# Bean Execution Gateway

Bean Execution Gateway is a public POC for routing outcome requests through policy, cost, safety, and verifier gates before an agent chooses an execution path.

Live demo: https://bean-execution-gateway-poc.onrender.com

Positioning: BEAN is not a live marketplace yet. It is a gateway that helps an agent decide whether to use an owned agent, use an available public path, or build a new agent before anyone pays for compute.

Current proof metrics:

- Executable path rate: share of scanned public signals that can become a safe local packet.
- Time to ranked paths: wall-clock time from demand scan to ranked agent paths.
- Unsafe actions prevented: spend, private-data, account, public-write, and external-submission gates stopped before execution.
- V1 local-contract completion: 80/80 product gates have public-demo contracts, with production blockers still explicit.

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
- Hard-blocks executable dispatch through `/v0/dispatch`.
- Ships with proof fixtures, adversarial fixtures, SDK stubs, adapter stubs, and a Render Free demo config.

## What It Does Not Do Yet

- It does not execute external work.
- It does not call suppliers, freelancers, marketplace agents, LLM APIs, payment rails, trading tools, or hosted compute providers.
- It does not authenticate tenants, manage private context, store secrets, or process customer data.
- It does not make supplier bids selectable when they require external execution, non-public data, or nonzero payment.
- It does not monetize routes or charge requesters.
- It does not claim marketplace liquidity. The supplier network is represented only as a blocked future class.

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
curl -s -X POST http://127.0.0.1:8787/v0/path \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-path-request.json
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

The hosted smoke suite also checks security headers, rate-limit headers, `/v0/ready`, `/v0/metrics`, disabled dispatch, hosted private-input rejection, and memory-only hosted outcomes.

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

## Docs

- [Product definition](docs/product-definition.md)
- [POC truth pass](docs/poc-truth.md)
- [API examples](docs/api-examples.md)
- [Safety and trust](docs/safety-and-trust.md)
- [V1 readiness](docs/v1-readiness.md)
- [Pre-discovery readiness](docs/pre-discovery-readiness.md)
- [Public launch packet](docs/public-launch-packet.md)
- [Live-traffic readiness](docs/live-traffic-readiness.md)
- [Production cutover](docs/production-cutover.md)
- [Abuse and rate-limit policy](docs/abuse-and-rate-limit-policy.md)
- [Public proof runner](docs/public-proof-runner.md)
- [Open demand adapters](docs/open-demand-adapters.md)
- [Path API and scoring](docs/path-api-and-scoring.md)
- [V1 product goals](docs/v1-product-goals.md)
- [V1 local-contract completion](docs/v1-local-contract-completion.md)
- [Public demo terms](TERMS.md)
