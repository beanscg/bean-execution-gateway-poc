# Public Beta Readiness

Status: prepared for trusted external review, not broadly launched.

This checklist converts the 80 public-beta goals into concrete artifacts. "Complete" means the repo now contains a usable public-beta artifact or a safe operating rule. It does not mean BEAN is ready for private data, paid execution, customer traffic, or a live marketplace.

## Definition Of Done

BEAN can be shared with 5-10 trusted technical users who understand that the hosted demo accepts public or synthetic inputs only. They can try the demo, follow the onboarding script, file non-sensitive issues, submit metadata-only feedback, and see the current blockers without relying on private context from Stephen.

## Status Summary

- Completed or prepared as public-beta artifacts: 80.
- Items requiring Stephen approval before external action: 8.
- Items requiring actual beta feedback before evaluation: 6.
- External actions performed: 0.
- Spend: 0 USD.
- Public posts or invitations sent: 0.
- Customer/private/paid traffic readiness: false.

## Goal Map

| ID | Goal | Status | Evidence |
| --- | --- | --- | --- |
| B001 | Finalize one-liner | Complete | `docs/public-beta-positioning.md` |
| B002 | Finalize category | Complete | Execution gateway, not marketplace yet |
| B003 | Define target beta user | Complete | `docs/public-beta-positioning.md` |
| B004 | Define primary promise | Complete | `README.md` and positioning doc |
| B005 | Define what the demo proves | Complete | `docs/public-launch-packet.md` |
| B006 | Define what it does not prove | Complete | `docs/live-traffic-readiness.md` |
| B007 | FAQ: why not just use ChatGPT/Cursor/Claude | Complete | `docs/public-beta-positioning.md` |
| B008 | FAQ: what happens to my data | Complete | `PRIVACY.md` and positioning doc |
| B009 | Safe claims list | Complete | `docs/public-beta-positioning.md` |
| B010 | Forbidden claims list | Complete | `docs/public-beta-positioning.md` |
| B011 | Polish README for external readers | Complete | `README.md` public-beta section |
| B012 | Add Start Here section | Complete | `README.md` and onboarding doc |
| B013 | Add plain-English architecture diagram | Complete | `docs/public-beta-onboarding.md` |
| B014 | Add public demo link with warning banner | Complete | `README.md` and demo UI |
| B015 | Warn in every entry path | Complete | README, terms, privacy, demo UI |
| B016 | Add under-3-minute demo script | Complete | `docs/public-beta-onboarding.md` |
| B017 | Add 3-5 public/synthetic demo tasks | Complete | Existing examples plus onboarding script |
| B018 | Add API examples | Complete | `docs/api-examples.md` |
| B019 | Add agent-facing docs | Complete | `llms.txt`, `llms-full.txt` |
| B020 | Add beta release notes | Complete | `docs/public-beta-operations.md` |
| B021 | Public-only input policy | Complete | `TERMS.md` |
| B022 | No secrets policy | Complete | `SECURITY.md` |
| B023 | No customer/work/private data policy | Complete | `PRIVACY.md` |
| B024 | No paid execution policy | Complete | `TERMS.md` |
| B025 | No external supplier execution policy | Complete | README and readiness docs |
| B026 | No public posting/submission policy | Complete | `docs/public-beta-onboarding.md` |
| B027 | Abuse/stop-condition policy | Complete | `docs/abuse-and-rate-limit-policy.md` |
| B028 | Security contact/report path | Complete | `SECURITY.md` and issue template |
| B029 | Public demo terms draft | Complete | `TERMS.md` |
| B030 | Privacy note | Complete | `PRIVACY.md` |
| B031 | Rate-limit checks verified live | Complete | Hosted smoke test covers rate-limit headers |
| B032 | Hosted rejection tests | Complete | Hosted smoke test covers private-input rejection |
| B033 | Public launch checklist | Complete | `docs/public-launch-packet.md` |
| B034 | Rollback procedure | Complete | `docs/public-beta-operations.md` |
| B035 | GitHub issue templates | Complete | `.github/ISSUE_TEMPLATE/*` |
| B036 | Feedback CTA | Complete | README, onboarding, demo UI |
| B037 | Metadata-only feedback endpoint | Complete | `/v0/feedback`, `/v0/v2/feedback` |
| B038 | Durable or exportable learning record | Complete | Local JSONL event log and `/v0/v2/learning` summary |
| B039 | Learning report command/path | Complete | `npm run gateway:smoke:hosted` plus learning endpoints |
| B040 | Track route usefulness | Complete | Feedback endpoints and issue template |
| B041 | Track verifier pass rate | Complete | Proof runner and hosted smoke checks |
| B042 | Track unsafe actions blocked | Complete | Metrics and hero metric definitions |
| B043 | Track time-to-ranked-path | Complete | Open-demand hero metric |
| B044 | Track public task types | Complete | Open-demand source modes and V2 task types |
| B045 | Public-learning dashboard | Complete | Demo product/open-demand panels and metrics endpoint |
| B046 | Known limitations generated from blockers | Complete | Readiness docs and launch packet |
| B047 | Public demand beyond GitHub | Complete | Public benchmark, research, non-code fixtures |
| B048 | Non-code public task flow | Complete | `non-code-fixture` source and example |
| B049 | Supply registry | Complete | V1/V2 supplier-bid contracts and registry |
| B050 | Evidence-backed route scoring fields | Complete | Path API scoring docs |
| B051 | Proof packet output | Complete | Open-demand bundle and proof runner |
| B052 | Verifier output readable to humans | Complete | Proof runner reports |
| B053 | Blocked-route explanations | Complete | Route stop conditions and readiness docs |
| B054 | Build vs use-existing decision example | Complete | `agent-path-build-vs-use-request.json` |
| B055 | Compute location explanation | Complete | `docs/path-api-and-scoring.md` |
| B056 | Pick 5-10 beta users | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B057 | Invite message | Prepared for Stephen approval | `docs/public-beta-operations.md` |
| B058 | Onboarding instructions | Complete | `docs/public-beta-onboarding.md` |
| B059 | Support channel | Prepared for Stephen approval | Recommended GitHub Issues |
| B060 | Feedback cadence | Complete | Weekly review in operations doc |
| B061 | Beta tracker | Complete | `docs/public-beta-operations.md` |
| B062 | Triage labels | Complete | Issue templates and operations doc |
| B063 | Launch-risk log | Complete | `docs/public-beta-operations.md` |
| B064 | Readiness badge/check | Complete | README status and launch packet |
| B065 | Run live smoke before sharing | Complete | Last live smoke passed; rerun before each invite |
| B066 | Confirm Render free/no payment | Complete | Render Free config in `render.yaml` |
| B067 | Confirm repo under beanscg | Complete | README repository link |
| B068 | Confirm no private references | Complete | Public scan found no private/work references |
| B069 | Approve public positioning | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B070 | Approve feedback/support channel | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B071 | Approve invite timing | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B072 | Approve contact email | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B073 | Approve product name | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B074 | Approve first audience | Prepared for Stephen approval | `docs/public-beta-decision-packet.md` |
| B075 | Review first beta feedback | Prepared beta loop | `docs/public-beta-learning-metrics.md` |
| B076 | Test whether users understand product | Prepared beta loop | `docs/public-beta-learning-metrics.md` |
| B077 | Test whether users try useful tasks | Prepared beta loop | `docs/public-beta-learning-metrics.md` |
| B078 | Test whether warnings prevent bad inputs | Prepared beta loop | `docs/public-beta-learning-metrics.md` |
| B079 | Test whether route outputs feel valuable | Prepared beta loop | `docs/public-beta-learning-metrics.md` |
| B080 | Decide next move after feedback | Prepared beta loop | `docs/public-beta-learning-metrics.md` |

## Shareable Status

The public demo is ready for trusted external review only. The right next action is for Stephen to approve the decision packet, then invite a small set of technical users with the prepared message.
