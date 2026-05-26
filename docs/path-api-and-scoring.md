# Path API And Scoring

`POST /v0/path` is the agent-facing entry point.

The caller gives an outcome. BEAN returns:

- selected path: owned agent, public path, build decision, or blocked.
- alternatives: other ranked paths.
- scores: quality, speed, cost, risk, proofability, learning value, trainability, execution readiness.
- compute location options: requester-hosted and gateway-hosted local proof in V0.
- next proof step: the local task ID and verifier endpoint.
- hard stop conditions: spend, private data, account creation, public post, external submission, and bounty claim.

V0 pricing is always zero. The future pricing shape is micro outcome-priced routing where compute ownership is explicit before execution.

This is intentionally not MCP-shaped. MCP can be one adapter, but the product surface is the decision gateway an agent can call from any workflow.
