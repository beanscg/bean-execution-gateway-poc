# Evidence

Verification evidence is produced by:

```bash
npm run gateway:verify
BEAN_GATEWAY_BASE_URL=http://127.0.0.1:8787 npm run gateway:smoke:hosted
BEAN_GATEWAY_BASE_URL=https://bean-execution-gateway-poc.onrender.com npm run gateway:smoke:hosted
```

The expected evidence standard is:

- Proof fixture gate passes.
- Adversarial fixture gate passes.
- Schema self-test passes.
- Registry lint passes.
- Hosted smoke passes.
- Actual spend is `0`.
- Actual external writes are `0`.
- Actual external executions are `0`.

Generated verification artifacts live under `dist/execution-gateway/verification` locally and are intentionally ignored from git.
