# Evaluator Quickstart

Use this page when you want to review Bean Execution Gateway without reading the whole repo.

## What To Try

1. Open the live demo: https://bean-execution-gateway-poc.onrender.com
2. Use only public or synthetic inputs.
3. Click one guided route:
   - Use public path
   - Use or build
   - Block risky work
4. Read the decision memo.
5. If a proof packet appears, run the proof.
6. Submit metadata-only route feedback.

## What Good Looks Like

The demo should answer these questions without extra explanation:

- What path should an agent take?
- Why did BEAN choose that path?
- What did BEAN block?
- What would a human approve next?
- Did the demo spend money, write publicly, store the prompt, or execute a supplier?

## Safe Input Boundary

Allowed:

- Public issue URLs.
- Public task descriptions.
- Synthetic examples.
- Public benchmark descriptions.

Not allowed:

- Private repo details.
- Customer, company, work, or regulated data.
- Secrets, tokens, passwords, API keys, credentials, or internal paths.
- Instructions to pay, post publicly, submit, claim, trade, or execute externally.

## The One Sentence Test

After one route, an evaluator should be able to say:

"BEAN turns an outcome into a recommended agent execution path, with cost, speed, quality, risk, proof, and approval gates shown before execution."
