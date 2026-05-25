# Safety And Trust

## Threat Model

Primary risks:

- Prompt injection in public issue text or supplier metadata.
- Accidental private, customer, company, credential, local-file, or regulated data submission.
- Accidental spend through paid APIs, hosted compute, subscriptions, trading, or suppliers.
- Public writes such as comments, pull requests, posts, outreach, or account messages.
- False confidence from a route decision being treated as execution permission.
- Future supplier gaming through low-quality bids, Sybil identities, or unverifiable capability claims.

## Current Mitigations

- Hosted demo rejects secret-like, private-like, internal, local-file, and credential-looking inputs before routing.
- Core route engine classifies text and context refs before selecting an executor.
- V0 defaults missing policy to `approval_required`.
- `free_only` policy blocks spend, paid APIs, public writes, account credentials, external suppliers, private refs, regulated data, and unsafe work.
- All supplier classes are represented as blocked future supply, not callable supply.
- Route output includes a permission statement that the recommendation is not permission for external action.
- Hosted outcome records are memory-only.

## Known Gaps

- No production auth, tenant isolation, rate limiting, audit log, WAF, or abuse queue.
- No dedicated secret-scanning service on submitted request bodies beyond pattern rejection.
- No private-context vault or data-class attestation.
- No supplier identity, staking, quality score, dispute, or payment settlement.
- No production-grade cost accounting or escrow state machine.

## V1 Safety Gates

- Authenticated tenants and scoped API keys.
- Explicit private-context mode with retention policy, redaction, and encrypted storage.
- Durable audit log with request metadata only, not raw sensitive body logging by default.
- Rate limits and abuse detection.
- Supplier allowlist, reputation, bid proof, quality score, and compute-cost attestation.
- Human approval gates for new tool classes, payment rails, account mutation, public writes, and any nonzero spend.
