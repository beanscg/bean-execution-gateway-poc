# Deferred MCP Adapter Stub

Status: deferred. Do not implement or expose without Stephen approval.

Shape:

- Tool: `find_execution_path`
- Tool: `record_outcome`
- Tool: `summarize_ledger`

The adapter must call the shared core engine. It must not fork policy, sanitizer, scorer, registry, or ledger logic.
