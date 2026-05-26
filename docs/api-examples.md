# API Examples

Base URL:

```text
https://bean-execution-gateway-poc.onrender.com
```

Local URL:

```text
http://127.0.0.1:8787
```

## Health

```bash
curl -s https://bean-execution-gateway-poc.onrender.com/v0/health
```

Key fields:

```json
{
  "api_version": "v0",
  "ok": true,
  "spend_usd": 0,
  "external_writes": 0,
  "external_executions": 0,
  "request_body_logging": false,
  "request_body_persistence": false
}
```

## Proof Examples

```bash
curl -s https://bean-execution-gateway-poc.onrender.com/v0/examples
```

Expected shape:

```json
{
  "api_version": "v0",
  "examples": [
    {
      "id": "public_issue_to_packet",
      "title": "Public issue to local packet"
    }
  ],
  "hero_metric_definitions": [
    {
      "id": "executable_path_rate",
      "label": "Executable path rate"
    }
  ],
  "external_actions_allowed": false
}
```

## Allowed Route

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/route \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/public-issue-request.json
```

Expected shape:

```json
{
  "api_version": "v0",
  "decision": {
    "policy_state": "allowed",
    "policy_decision": "allow",
    "selected_executor_id": "deterministic-verifier"
  },
  "chargeable": false,
  "cost": {
    "estimated_total_cost_usd": 0
  },
  "stop_conditions": []
}
```

## Blocked Route

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/route \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/blocked-paid-public-write-request.json
```

Expected shape:

```json
{
  "api_version": "v0",
  "decision": {
    "policy_state": "blocked",
    "policy_decision": "deny",
    "selected_executor_id": null
  },
  "stop_conditions": [
    "requires_paid_api",
    "requires_public_post"
  ]
}
```

## Hosted Private-Input Rejection

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/route \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/private-input-rejected-request.json
```

Expected shape:

```json
{
  "api_version": "v0",
  "ok": false,
  "error": "hosted_demo_rejects_private_work_or_secret_like_context"
}
```

## Open-Demand Scan

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/open-demand/scan \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-scan-request.json
```

Expected shape:

```json
{
  "api_version": "v0",
  "external_actions_performed": false,
  "metrics": {
    "opportunities_scanned": 6,
    "selected_candidates": 4
  },
  "hero_metrics": {
    "measurement_scope": "metadata_only_public_demo",
    "executable_path_rate": 0.667,
    "unsafe_actions_prevented": 18
  }
}
```

## Agent Path Decision

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/path \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-path-request.json
```

Expected shape:

```json
{
  "api_version": "v0",
  "schema_version": "bean.agent_path_decision.v1",
  "selected_path": {
    "supplier_class": "public_path",
    "scores": {
      "quality": 100,
      "speed": 100,
      "cost": 100,
      "risk": 100,
      "proofability": 100
    }
  },
  "pricing_model": {
    "v0_spend_usd": 0
  },
  "external_actions_performed": false
}
```

## V1 Goal Checklist

```bash
curl -s https://bean-execution-gateway-poc.onrender.com/v0/v1/goals
```

Expected shape:

```json
{
  "schema_version": "bean.v1_goal_progress.v1",
  "total_goals": 80,
  "completed_local_contract_goals": 80,
  "blocked_production_gates": [
    "no_payment_rail_connected",
    "no_external_supplier_execution"
  ]
}
```

## V1 Supplier Bid Contract

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/v1/supplier-bids \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/v1-supplier-bid-request.json
```

Expected shape:

```json
{
  "schema_version": "bean.v1_supplier_bid_evaluation.v1",
  "decision": "eligible_local_contract",
  "scores": {
    "quality": 66,
    "speed": 98,
    "cost": 100,
    "risk": 100
  },
  "external_actions_performed": false,
  "spend_usd": 0
}
```

## V1 Payment Quote Gate

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/v1/payment-quotes \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/v1-payment-quote-request.json
```

Expected shape:

```json
{
  "schema_version": "bean.v1_payment_quote.v1",
  "requested_payable_usd": 5,
  "payable_usd": 0,
  "chargeable": false,
  "payment_rail_status": "blocked_requires_payment_rail_and_operator_approval"
}
```

## Public Research Scan

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/open-demand/scan \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-public-research-scan-request.json
```

Use `open-demand-public-bounty-scan-request.json` for read-only bounty-fit evaluation. Claiming or submitting remains gated.

## Open-Demand Feedback

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/open-demand/feedback \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/open-demand-feedback-request.json
```

Expected shape:

```json
{
  "api_version": "v0",
  "accepted": true,
  "free_text_stored": false,
  "feedback": {
    "reason_code": "routed_to_useful_path"
  }
}
```

## Memory-Only Outcome

```bash
curl -s -X POST https://bean-execution-gateway-poc.onrender.com/v0/outcomes \
  -H 'content-type: application/json' \
  --data @examples/execution-gateway/outcome-record.json
```

Expected hosted-demo fields:

```json
{
  "api_version": "v0",
  "ledger_path": "memory://hosted-demo/outcomes",
  "persisted_to_disk": false
}
```
