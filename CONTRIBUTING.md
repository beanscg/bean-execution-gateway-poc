# Contributing

Bean Execution Gateway is currently a public POC and trusted-beta review target. Contributions should keep the project inside the public-demo boundary.

## Allowed Contributions

- Public or synthetic fixtures.
- Documentation, examples, schemas, SDK stubs, and adapter stubs.
- Local verification and test coverage.
- UI improvements that do not add tracking, accounts, payments, secrets, or private-data collection.
- Metadata-only feedback and metrics.

## Do Not Submit

- Private, work, company, customer, credential, local-file, internal, regulated, or secret data.
- Payment, payout, wallet, trading, or subscription logic.
- External supplier execution.
- Public posting, PR submission, outreach, account mutation, or paid API calls.
- Private repository, tenant, customer, or production credentials.

## Verification

Run before opening a PR:

```bash
npm test
npm run gateway:verify
BEAN_GATEWAY_BASE_URL=http://127.0.0.1:8787 npm run gateway:smoke:hosted
npm run launch:readiness
```

For the hosted public demo:

```bash
BEAN_GATEWAY_BASE_URL=https://bean-execution-gateway-poc.onrender.com npm run gateway:smoke:hosted
```

## Product Truth

The current product is an execution-path decision gateway. It is not a production marketplace, payment rail, supplier network, private-context processor, or external execution runner.
