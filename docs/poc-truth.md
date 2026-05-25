# POC Truth Pass

## Works Now

- Public hosted demo runs on Render Free with no payment method required by the repo config.
- Root demo page calls the real `/v0/route` API.
- The hosted API rejects private, secret-like, internal, local-file, and credential-looking input before route processing.
- The route engine produces deterministic route IDs from request hash, idempotency key, and registry version.
- The route engine blocks spend, paid APIs, public posting, account credentials, external supplier requests, private refs, regulated data, secret-like text, and unsafe work.
- Allowed routes are limited to local, zero-cost executors.
- Outcome writes in hosted mode are memory-only.
- Local verification covers proof fixtures, adversarial fixtures, schema self-test, registry lint, zero spend, zero external writes, and zero external executions.

## Intentionally Not Implemented

- No production authentication or multi-tenant isolation.
- No billing, payment, payout, trading, or subscription flow.
- No private repository or customer data handling.
- No external supplier calls.
- No automatic public comments, pull requests, posts, messages, or account mutation.
- No live marketplace liquidity or supplier bidding.
- No durability guarantees for hosted-demo outcome records.

## Honest Demo Promise

The public demo shows the gateway decision layer, not an autonomous marketplace. It is useful as proof that the routing and safety contract can be made inspectable before external execution exists.

## Repository Identity

The public branch should be authored and maintained by `beanscg`. A previous incorrect author mapping was corrected on the public main branch. Destructive repository recreation or provider-side history purge is outside this readiness pass.
