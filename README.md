# Bean Execution Gateway POC Package

Generated: 2026-05-25T16:40:31.366Z

This package is the public-only hosted-demo source for the Bean Execution Gateway POC. It includes no deployment credentials, payment rails, external supplier integrations, private-context handling, personal ledgers, or private workspace files.

Run locally:

```bash
npm run gateway:verify
npm run gateway:server:hosted-demo
```

Render POC constraints:

- Use the Free instance type only.
- Do not add a payment method.
- Do not add secrets or private environment variables.
- Do not connect private repositories or work/org accounts.
- Stop if the platform asks for a paid plan, payment method, private data, private repo access, or broader account permissions.
