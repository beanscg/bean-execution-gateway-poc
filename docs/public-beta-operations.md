# Public Beta Operations

## Current Release Note

Public beta packet prepared for trusted external review. BEAN remains a public/synthetic-only execution gateway demo and does not support private, paid, customer, or external-supplier traffic.

## Invite Message Draft

Subject: Quick private beta ask: BEAN execution gateway

I am testing BEAN, a small execution gateway for agents. The idea is simple: give it an outcome, and it decides whether the right path is an owned agent, a public/open path, or building a new agent before anyone pays for compute.

Current demo is public/synthetic only. Please do not paste private, customer, work, secret, credential, regulated, or internal data.

Try the live demo: https://bean-execution-gateway-poc.onrender.com

What I want to learn:

- Does the positioning make sense?
- Are the route decisions useful?
- Are the safety gates clear?
- What task would you naturally try?

Please file non-sensitive feedback through GitHub Issues or use the useful/not-useful controls in the demo.

## Beta Tracker

| User | Audience fit | Invited | Tried demo | Feedback received | Follow-up |
| --- | --- | --- | --- | --- | --- |
| TBD | agent builder | no | no | no | pending Stephen approval |
| TBD | devtool user | no | no | no | pending Stephen approval |
| TBD | automation operator | no | no | no | pending Stephen approval |
| TBD | public repo maintainer | no | no | no | pending Stephen approval |
| TBD | founder/operator | no | no | no | pending Stephen approval |

## Launch Risk Log

| Risk | Current Control | Next Escalation |
| --- | --- | --- |
| User pastes private data | Warning copy, hosted rejection, issue guidance | Pause beta and tighten entry copy |
| User expects execution | Dispatch disabled, copy says gateway not marketplace | Add route-output disclaimer |
| User expects paid marketplace | Forbidden claims list | Keep beta narrow |
| Public issue contains sensitive data | Issue templates warn against sensitive data | Delete/report and move to private channel when available |
| Render asks for payment | Stop condition | Do not proceed without Stephen approval |
| Support load spikes | 5-10 user cap | Pause invites |

## Rollback

If a beta issue appears:

1. Stop sending invites.
2. Disable/stop the Render service if the public demo itself is risky.
3. Revert the last commit or deploy the previous known-good commit.
4. Rerun `npm test`, `npm run gateway:verify`, and hosted smoke.
5. Update `docs/live-traffic-readiness.md` with the blocker.

## Pre-Invite Check

Run before each invite wave:

```bash
npm test
npm run gateway:verify
BEAN_GATEWAY_BASE_URL=https://bean-execution-gateway-poc.onrender.com npm run gateway:smoke:hosted
```

Confirm:

- Render plan is Free.
- Repo is `beanscg/bean-execution-gateway-poc`.
- No private/work references appear in public-facing files.
- `/v0/v2/readiness` still reports private/customer/paid readiness as false.
