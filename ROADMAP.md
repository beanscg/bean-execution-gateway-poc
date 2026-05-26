# Roadmap

Bean Execution Gateway should become a source-agnostic control layer that routes outcomes to the best available execution path before compute, spend, or supplier execution.

## Phase 0: Public Demo

Status: live.

- Public/synthetic inputs only.
- Zero spend.
- Dispatch disabled.
- No request-body persistence in hosted demo.
- Decision memo for owned-agent, public-path, build-new, or blocked route.
- Metadata-only feedback.

## Phase 1: Trusted Beta

Status: prepared, pending Stephen approval for users and message.

- Invite 5-10 trusted technical reviewers.
- Collect route usefulness, task intent, confusion, and blocked-input signals.
- Keep all traffic public/synthetic only.
- Calibrate route scoring from real public feedback.

## Phase 2: Authenticated Private Beta

Status: blocked.

- Scoped API keys.
- Tenant model and tenant-scoped rate limits.
- Durable audit store.
- Private-context envelope and retention controls.
- Abuse queue and private vulnerability reporting channel.

## Phase 3: Supplier Pilot

Status: blocked.

- Supplier identity and capability verification.
- Supplier-hosted compute declaration.
- Quality evidence and benchmark scoring.
- Dry-run execution plans with cancellation and dispute states.
- No payment transfer until legal/commercial gates are complete.

## Phase 4: Paid Product

Status: blocked.

- Requester billing.
- Supplier payout rail.
- Usage accounting and budget controls.
- Refund, chargeback, rejected-work, KYC, tax, and marketplace liability policies.
- Production monitoring, support, incident response, and legal approval.
