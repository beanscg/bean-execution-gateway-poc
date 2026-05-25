# Bean Execution Gateway Python Stub

This is a local-only helper that shells out to the Node CLI. It is intentionally not a hosted API client.

```python
from bean_execution_gateway_client import find_execution_path

summary = find_execution_path({
    "outcome": {
        "goal": "Triage a public issue locally.",
        "task_type": "issue_triage",
        "desired_artifact": "triage_packet",
    },
    "context_refs": ["https://github.com/example/project/issues/1"],
    "policy": {"mode": "free_only"},
})
```

The V0 policy boundary remains: no spend, no external writes, no account mutation, no supplier execution, and no private-context handling.
