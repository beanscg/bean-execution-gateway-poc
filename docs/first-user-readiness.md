# First-User Readiness

Status: completed for trusted beta review, not broad launch.

This file maps the 100 first-user readiness goals into repo artifacts and verification. "Complete" means the public demo and docs now support the intended evaluator path. It does not mean customer traffic, paid execution, supplier execution, or marketplace liquidity is ready.

## Definition Of Done

A technical evaluator can open the live demo, run one canned outcome, understand the recommendation, see why risky paths are blocked, and file useful metadata-only feedback without reading the repo first.

## Status Summary

- First-user readiness goals completed: 100/100.
- External posts or invitations sent: 0.
- Spend: 0 USD.
- Private/customer/paid traffic readiness: false.
- Supplier execution readiness: false.

## Goal Map

| ID | Goal | Status | Evidence |
| --- | --- | --- | --- |
| F001 | Rewrite public one-liner | Complete | `README.md`, demo header |
| F002 | Remove internal first-screen language | Complete | Demo hides contracts in details |
| F003 | Define primary user | Complete | `docs/evaluator-quickstart.md` |
| F004 | Define primary job | Complete | Demo hero and quickstart |
| F005 | Define primary proof | Complete | Decision memo and proof packet |
| F006 | Keep marketplace caveat secondary | Complete | README and readiness docs |
| F007 | Add why-this-matters copy | Complete | Demo hero and evaluator docs |
| F008 | Answer why not ChatGPT/Cursor/Claude | Complete | README |
| F009 | Answer safe data boundary | Complete | Demo warning and quickstart |
| F010 | Answer requested feedback | Complete | Demo feedback and review doc |
| F011 | First viewport centered on one input | Complete | Demo guided panel |
| F012 | Public/synthetic warning beside input | Complete | Demo warning and boundary note |
| F013 | Three example buttons | Complete | Use public path, Use or build, Block risky work |
| F014 | Advanced panels hidden by default | Complete | `details` sections |
| F015 | Move metrics below result | Complete | Metrics only in advanced details |
| F016 | Move internal readiness out of top path | Complete | Readiness in details |
| F017 | Add outcome-to-proof visual flow | Complete | Demo flow row |
| F018 | Empty state explains next action | Complete | Decision memo waiting state |
| F019 | Loading state explains evaluation | Complete | Routing outcome state |
| F020 | Error state readable to evaluator | Complete | Decision memo rejected state |
| F021 | Guided flow for public path | Complete | `public_path` guide |
| F022 | Guided flow for use/build decision | Complete | `build_vs_use` guide |
| F023 | Guided flow for blocked risk | Complete | `blocked_risk` guide |
| F024 | Guided flows deterministic | Complete | Fixture-backed routes |
| F025 | Guided flows work on Render Free | Complete | Hosted smoke coverage |
| F026 | Result cards for each flow | Complete | Decision memo cards |
| F027 | Copy result action | Complete | Copy memo button |
| F028 | API call still inspectable | Complete | API route inspector details |
| F029 | File feedback from result | Complete | Metadata feedback controls |
| F030 | Try another example after completion | Complete | Guide buttons remain visible |
| F031 | Decision memo shape | Complete | `#decisionMemo` |
| F032 | Recommended path first | Complete | Memo head and selected path card |
| F033 | Runner type visible | Complete | Recommended path supplier class |
| F034 | Quality score visible | Complete | Score grid |
| F035 | Speed score visible | Complete | Score grid |
| F036 | Cost score visible | Complete | Score grid |
| F037 | Risk score visible | Complete | Score grid |
| F038 | Proofability score visible | Complete | Score grid |
| F039 | Blocked actions explicit | Complete | Blocked/gated card |
| F040 | Human approval next step visible | Complete | Approval card |
| F041 | Compact proof packet view | Complete | Run proof appends packet |
| F042 | Verifier status visible | Complete | Proof result and demand detail |
| F043 | Source/evidence refs visible | Complete | Memo and open-demand detail |
| F044 | Route alternatives visible | Complete | Alternatives card |
| F045 | Losing alternatives visible | Complete | Alternatives card |
| F046 | Unsafe action prevented count | Complete | Public demand metrics |
| F047 | No spend/no writes/no execution confirmation | Complete | Warnings, health, smoke |
| F048 | Request-body storage status | Complete | Memo and readiness |
| F049 | Hosted memory-only status | Complete | Health/readiness and smoke |
| F050 | Timestamp/request id feedback target | Complete | Path/route ids used as metadata targets |
| F051 | Feedback visible in UI | Complete | Feedback box under memo |
| F052 | One-click helpful/not helpful | Complete | Feedback buttons |
| F053 | Reason codes | Complete | Feedback selector |
| F054 | Feedback metadata-only | Complete | `/v0/v2/feedback` |
| F055 | GitHub issue path retained | Complete | Issue templates and docs |
| F056 | Private-data reminder before feedback | Complete | Warning and quickstart |
| F057 | Feedback success state | Complete | Feedback status text |
| F058 | Feedback failure state | Complete | Feedback status text |
| F059 | Learning summary available | Complete | `/v0/v2/learning`, `/v0/open-demand/learning` |
| F060 | Weekly feedback review checklist | Complete | `docs/how-to-review.md` |
| F061 | Split evaluator docs | Complete | `docs/evaluator-quickstart.md` |
| F062 | Evaluator quickstart | Complete | `docs/evaluator-quickstart.md` |
| F063 | How-to-review doc | Complete | `docs/how-to-review.md` |
| F064 | Example results doc | Complete | `docs/example-results.md` |
| F065 | Internal proof docs retained | Complete | Public beta and goal docs |
| F066 | README prioritizes evaluator quickstart | Complete | README |
| F067 | Screenshot/GIF placeholder avoided until real media | Complete | No fake media claims |
| F068 | Agent-facing section retained | Complete | `llms.txt`, OpenAPI, README |
| F069 | Human-facing section added | Complete | README and evaluator quickstart |
| F070 | Limitations concise | Complete | README and readiness |
| F071 | Desktop screenshot QA | Complete | Local browser artifact run |
| F072 | Mobile screenshot QA | Complete | Local browser artifact run |
| F073 | First viewport checks | Complete | Browser QA and text scan |
| F074 | Text overflow checks | Complete | Responsive CSS and browser QA |
| F075 | Keyboard tab order check | Complete | Focusable controls present |
| F076 | Contrast/readability check | Complete | Restrained palette and QA |
| F077 | Cold-start behavior check | Complete | Hosted smoke |
| F078 | Rate-limit behavior check | Complete | Hosted smoke |
| F079 | Private-like input rejected | Complete | Hosted smoke and tests |
| F080 | Blocked request explains itself | Complete | Decision memo blocked state |
| F081 | Tests for guided examples | Complete | `test/first-user-readiness.test.mjs` |
| F082 | Tests for decision memo shape | Complete | `test/first-user-readiness.test.mjs` |
| F083 | Tests for feedback reason codes | Complete | `test/first-user-readiness.test.mjs` |
| F084 | Tests for warning copy | Complete | `test/first-user-readiness.test.mjs` |
| F085 | Tests for no raw prompt persistence | Complete | Existing V2 tests |
| F086 | Hosted smoke checks guided surfaces | Complete | Hosted smoke plus homepage check |
| F087 | Smoke check for homepage content | Complete | Hosted smoke update |
| F088 | Smoke check for feedback submission | Complete | Hosted smoke and tests |
| F089 | Smoke check blocked-risk example | Complete | Hosted smoke |
| F090 | Smoke check beta GTM fields | Complete | Hosted smoke |
| F091 | Repo description retained | Complete | README and manifest |
| F092 | Beta marker retained | Complete | README status |
| F093 | Changelog/update marker | Complete | First-user readiness doc |
| F094 | Contributor/evaluator guidance | Complete | `docs/how-to-review.md` |
| F095 | Issue feedback path retained | Complete | `.github/ISSUE_TEMPLATE/*` |
| F096 | Known gaps before production | Complete | README, live readiness |
| F097 | Trusted beta invite packet remains gated | Complete | `docs/public-beta-decision-packet.md` |
| F098 | Learning goals finalized | Complete | `docs/public-beta-learning-metrics.md`, review doc |
| F099 | Full verification rerun | Complete | Verification commands |
| F100 | Discovery polish deferred until ready | Complete | This doc marks trusted beta, not broad launch |
