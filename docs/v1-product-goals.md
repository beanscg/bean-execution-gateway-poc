# V1 Product Goals

The V1 product should prove that agents can route outcome requests to the cheapest acceptable execution path without surprise compute or private-data risk.

Local-contract checklist status:

- G001-G010 product truth and public-demo boundary: complete as public-demo contract.
- G011-G020 tenant auth and scoped API contracts: complete as contract, blocked for real secrets.
- G021-G030 metadata audit and retention contracts: complete as metadata-only contract.
- G031-G040 private context vault contracts: complete as blocking contract, blocked for real private data.
- G041-G050 supplier bid quality/speed/cost contracts: complete as scoring contract, blocked for external suppliers.
- G051-G060 acceptance pricing and settlement contracts: complete as zero-payable contract, blocked for payment rails.
- G061-G070 abuse ops and rate-limit contracts: complete as metadata-only queue contract.
- G071-G080 replay learning and public proof metrics: complete as public-demo replay contract.

Implemented public-demo surfaces:

- `GET /v0/v1/goals` returns the 80-goal checklist and production blockers.
- `GET /v0/v1/readiness` separates public-demo readiness from customer or paid readiness.
- `POST /v0/v1/tenants` creates a scoped tenant contract without storing API keys.
- `POST /v0/v1/context/envelopes` hashes public context refs and blocks private/secret-like context.
- `POST /v0/v1/supplier-bids` scores quality, speed, cost, and risk while keeping external or paid suppliers non-selectable.
- `POST /v0/v1/acceptance` records acceptance state but forces nonzero payable amounts to zero.
- `POST /v0/v1/payment-quotes` proves payment intent is blocked until a real rail exists.
- `POST /v0/v1/abuse/cases` queues metadata-only abuse cases.
- `GET /v0/v1/audit` and `GET /v0/v1/replay` expose metadata-only audit and learning summaries.

Production blockers:

- No payment rail connected.
- No external supplier execution.
- No private context vault.
- No customer data processing.
- No real tenant auth secret in the demo.

The public POC remains a training and discovery surface. Customer, paid, private, and external-supplier traffic stays blocked until these gates are real.
