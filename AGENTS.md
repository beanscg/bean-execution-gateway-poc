# Agent Instructions

This repository is a public-only POC package for Bean Execution Gateway.

## Hard Boundaries

- Do not add spend, paid APIs, subscriptions, payment methods, trading, payouts, or external supplier calls.
- Do not add secrets, private environment variables, credentials, private repository access, or account mutation.
- Do not paste or store private, work, company, customer, credential, local-file, internal, or regulated data.
- Do not make public posts, pull requests, comments, outreach messages, or account changes from this repo.
- Keep the Render deployment on the Free plan.

## Allowed Work

- Improve public docs, schemas, examples, static demo UI, local verification, and local route logic.
- Add synthetic fixtures that prove blocked and allowed behavior.
- Add SDK or adapter stubs only when they do not call external systems.
- Run local verification and hosted smoke checks.

## Verification

Run before proposing changes:

```bash
npm run gateway:verify
npm run gateway:smoke:hosted
```

For the live hosted demo:

```bash
BEAN_GATEWAY_BASE_URL=https://bean-execution-gateway-poc.onrender.com npm run gateway:smoke:hosted
```

## Product Truth

The POC is a gateway decision layer. It is not yet a production marketplace, payment system, supplier network, private-context processor, or external execution runner.
