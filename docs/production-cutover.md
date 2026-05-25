# Production Cutover Gates

This is the exact boundary between the current public POC and a production beta.

## No-Approval Work

These can continue without spend, secrets, or external execution:

- Improve docs, schemas, examples, SDK stubs, and adapter stubs.
- Add local-only tests, fixtures, and verification.
- Improve the public demo UI without adding tracking, secrets, or paid services.
- Harden route decisions and sanitizer behavior against synthetic inputs.

## Operator Approval Required

Stop before any of these:

- Adding a paid service, paid plan, payment method, or subscription.
- Creating, storing, rotating, or deploying secrets.
- Connecting private repositories, private data, customer data, work accounts, or employer systems.
- Enabling public writes, comments, PRs, outreach, or account mutation.
- Calling external suppliers, LLM APIs, trading tools, marketplaces, or hosted compute providers.
- Adding payment rails, payout flows, KYC, tax, wallets, or settlement logic.
- Changing provider permissions, GitHub organization settings, Render billing, or DNS.

## Beta Entry Criteria

- `BEAN_GATEWAY_REQUIRE_API_KEY=1` and `BEAN_GATEWAY_API_KEY` configured in the target environment.
- Tenant model, API scopes, idempotency, and rate-limit policy documented and tested.
- Durable audit store added with request-body retention rules and deletion policy.
- Private-context path tested with synthetic data only before real private data.
- Supplier dispatch remains disabled until supplier identity, quality, payment, and dispute rules exist.
- Hosted smoke, local verification, secret scan, and security-header checks pass on the deployed commit.
