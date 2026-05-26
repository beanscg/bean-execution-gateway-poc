# Open Demand Adapters

The gateway is source-agnostic. V0 ships safe adapters that create training demand without private data or paid execution.

Current modes:

- `fixture`: mixed safe and negative-control opportunities.
- `public-benchmark`: unpaid public benchmark-style work.
- `public-research`: public-source research work with local citation-quality checks.
- `public-bounty`: read-only bounty-fit evaluation. Claiming or submitting is gated.
- `non-code-fixture`: non-code work signals for training beyond GitHub issues.
- `github-discussions`: discussion-shaped public demand fixture.
- `auto`: read-only live GitHub issue search with fixture fallback.
- `live-github`: read-only live GitHub issue search only.

Every adapter normalizes opportunities into the same scoring model: quality, speed, cost, risk, proofability, learning value, trainability, and execution readiness.

Future adapters should preserve the same boundary: public metadata in, local proof packet out, no submission without explicit approval.
