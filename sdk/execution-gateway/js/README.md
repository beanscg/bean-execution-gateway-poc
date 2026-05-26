# Bean Execution Gateway JS SDK

This is a local wrapper around the adapter-neutral gateway engine. It does not call a hosted API.

```js
import { findExecutionPath } from './sdk/execution-gateway/js/index.mjs';

const response = findExecutionPath({
  outcome: {
    goal: 'Triage a public issue locally.',
    task_type: 'issue_triage',
    desired_artifact: 'triage_packet'
  },
  context_refs: ['https://github.com/example/project/issues/1'],
  policy: { mode: 'free_only' }
});
```

For the agent-path API:

```js
import { findAgentPath } from './sdk/execution-gateway/js/index.mjs';

const path = await findAgentPath({
  outcome: {
    goal: 'Find the safest executable path for a public task.',
    task_type: 'agent_task_triage',
    desired_artifact: 'agent_path_packet'
  },
  source_mode: 'fixture',
  policy: { mode: 'free_only' }
});
```

V0 constraints remain enforced by the core engine: no spend, no external writes, no private context, no account use, and no supplier execution.
