# V1 Product Goals

The V1 product should prove that agents can route outcome requests to the cheapest acceptable execution path without surprise compute or private-data risk.

Goal checklist:

- Add authenticated tenants and scoped API keys.
- Add durable audit logs with retention controls.
- Add private-context vaulting and tenant isolation.
- Add adapter contracts for owned agents, public agents, and build-decision paths.
- Add supplier identity, scoring, settlement, and dispute controls.
- Add explicit compute ownership: requester-hosted, supplier-hosted, or gateway-hosted.
- Add payment rails and cost accounting before any paid path is selectable.
- Add abuse review queue and operational monitoring.
- Add proof replay and regression suites from public demand.
- Add customer-facing metrics: executable path rate, time to ranked paths, unsafe actions prevented, accepted proof rate, and cost-per-accepted-outcome.

The public POC remains a training and discovery surface. Customer/live execution traffic stays blocked until these gates are real.
