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
