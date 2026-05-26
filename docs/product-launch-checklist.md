# Product Launch Checklist

Status: actual product launch is not ready. Public demo and trusted-beta review are live-ready; broader product launch is blocked on auth, durable storage, private-context handling, supplier operations, payments, legal/commercial review, observability, and support capacity.

This document is the launch control checklist for treating Bean Execution Gateway as a real product, not just a public POC. It intentionally separates evidence-backed work from prepared local artifacts and blocked real-world gates.

## Launch Readiness Summary

- Public demo live: Done.
- Trusted technical beta review: Prepared.
- Broader public product push: Blocked.
- Customer/private/paid traffic: Blocked.
- External supplier execution: Blocked.
- Payment or payout rails: Blocked.
- Spend added by this pass: 0 USD.
- External posts or invitations sent by this pass: 0.

## Status Definitions

- Done: implemented in the repo or live demo and covered by local or hosted verification.
- Prepared: local artifact, contract, or plan exists, but it still needs external review, operator approval, real users, secrets, paid systems, legal review, or production infrastructure.
- Blocked: cannot honestly be completed under the current no-spend, no-secrets, no-private-data, no-external-supplier, no-public-posting constraints.

## Launch Gates

| ID | Area | Launch requirement | Status | Evidence or blocker |
| --- | --- | --- | --- | --- |
| L001 | Positioning | One-sentence product claim is clear | Done | `README.md` |
| L002 | Positioning | Category is clear: execution gateway, not marketplace yet | Done | `README.md`, `docs/public-beta-positioning.md` |
| L003 | Positioning | Safe claims and forbidden claims are separated | Done | `docs/public-beta-positioning.md` |
| L004 | Positioning | Public demo limitations are visible before use | Done | demo UI, `README.md`, `TERMS.md` |
| L005 | Positioning | Target first users are defined | Done | `docs/public-beta-readiness.md`, `docs/public-launch-packet.md` |
| L006 | Positioning | Competitive wedge is stated without overclaiming | Done | `README.md`, `llms-full.txt` |
| L007 | Positioning | Public beta narrative avoids "live marketplace" claims | Done | `README.md`, readiness docs |
| L008 | Positioning | Launch copy has operator approval before posting | Blocked | Requires Stephen approval and a chosen channel |
| L009 | Positioning | Beta invite message has operator approval | Prepared | `docs/public-beta-operations.md` |
| L010 | Positioning | Product name and repo identity are confirmed | Prepared | `beanscg/bean-execution-gateway-poc`; final brand decision still Stephen-owned |
| L011 | Demo UX | First screen explains the product in under 30 seconds | Done | browser QA screenshots in `dist/execution-gateway/ux-qa-polish/` |
| L012 | Demo UX | Primary user action is obvious | Done | guided route panel |
| L013 | Demo UX | Mobile layout has no horizontal overflow | Done | Playwright/Chrome QA report |
| L014 | Demo UX | Desktop layout has no detected text clipping | Done | Playwright/Chrome QA report |
| L015 | Demo UX | Guided route returns a human-readable decision memo | Done | local and live smoke |
| L016 | Demo UX | Advanced JSON/API panels do not dominate first-run flow | Done | collapsed advanced sections |
| L017 | Demo UX | Warning banner is visible before input | Done | demo UI |
| L018 | Demo UX | Feedback CTA exists and is metadata-only | Done | demo UI, `/v0/v2/feedback` |
| L019 | Demo UX | Proof packet flow is available from the memo | Done | guided route and proof runner |
| L020 | Demo UX | Usability is validated by real beta users | Blocked | Requires beta users and feedback |
| L021 | API | OpenAPI is available live | Done | `/v0/openapi.json` |
| L022 | API | Health endpoint is available | Done | `/v0/health` |
| L023 | API | Readiness endpoint separates public demo from production | Done | `/v0/ready` |
| L024 | API | Path decision endpoint works for public inputs | Done | `/v0/path` |
| L025 | API | Route endpoint blocks unsafe requests | Done | `/v0/route` and adversarial fixtures |
| L026 | API | Dispatch endpoint is explicitly disabled | Done | `/v0/dispatch` |
| L027 | API | Feedback endpoint rejects free text | Done | V2 tests |
| L028 | API | API versioning strategy is documented | Prepared | V0/V1/V2 endpoint structure exists; formal compatibility policy needed |
| L029 | API | SDKs are production-grade and published | Blocked | Stubs exist; package publishing and support require approval |
| L030 | API | Rate limits are tenant-scoped | Blocked | Requires auth and tenant model |
| L031 | Routing | Owned-agent path class exists | Done | `/v0/path`, V2 route contracts |
| L032 | Routing | Public-path class exists | Done | open-demand fixtures and path decisions |
| L033 | Routing | Build-new decision class exists | Done | path alternatives |
| L034 | Routing | External supplier path is represented as blocked | Done | V2 route contracts |
| L035 | Routing | Quality/speed/cost/risk scoring exists | Done | path API and docs |
| L036 | Routing | Proofability and learning scores exist | Done | path API and docs |
| L037 | Routing | Route decisions include blocked/gated actions | Done | decision memo and API response |
| L038 | Routing | Route decisions are calibrated on real beta outcomes | Blocked | Requires real beta traffic |
| L039 | Routing | Route regression suite covers real use cases | Prepared | Fixtures exist; real goldens still needed |
| L040 | Routing | Human review sampling policy is operational | Prepared | Contract docs exist; humans and cadence needed |
| L041 | Public demand | Fixture scans work | Done | tests and hosted smoke |
| L042 | Public demand | Public benchmark source mode exists | Done | open-demand source modes |
| L043 | Public demand | Public research source mode exists | Done | open-demand source modes |
| L044 | Public demand | Non-code fixture source exists | Done | open-demand source modes |
| L045 | Public demand | Read-only public bounty fit exists | Done | open-demand source modes |
| L046 | Public demand | GitHub public issue path has safe defaults | Done | tests |
| L047 | Public demand | Public demand sources are source-agnostic by design | Prepared | docs and adapter stubs |
| L048 | Public demand | Live ingestion has abuse and quota controls | Blocked | Requires production ops controls |
| L049 | Public demand | Public-source terms review is complete | Blocked | Requires legal/platform ToS review |
| L050 | Public demand | Public traffic learning loop is validated | Blocked | Requires real public traffic |
| L051 | Supply | Owned/local supplier class exists | Done | registry and V2 supply bid contracts |
| L052 | Supply | Supplier metadata contract exists | Done | `/v0/v2/supply/bids` |
| L053 | Supply | Supplier quality evidence fields exist | Done | V2 contracts |
| L054 | Supply | Supplier compute-location field exists | Done | path and supply contracts |
| L055 | Supply | External suppliers are not selectable in public demo | Done | tests and readiness |
| L056 | Supply | Supplier identity and verification process exists | Blocked | Requires real supplier onboarding |
| L057 | Supply | Supplier ranking is validated on real tasks | Blocked | Requires suppliers and outcomes |
| L058 | Supply | Supplier SLA and cancellation rules exist | Blocked | Requires commercial/legal policy |
| L059 | Supply | Supplier dispute and rejected-work flow exists | Blocked | Requires legal/commercial policy |
| L060 | Supply | Supplier marketplace liquidity exists | Blocked | Requires real supply acquisition |
| L061 | Payments | Zero-spend demo guardrail is verified | Done | live smoke |
| L062 | Payments | Nonzero payment is blocked | Done | V1/V2 payment quote and acceptance tests |
| L063 | Payments | Cost fields appear in decisions | Done | route/path API |
| L064 | Payments | Budget controls are designed | Prepared | docs mention gates; production controls needed |
| L065 | Payments | Requester billing exists | Blocked | Requires payment provider and legal terms |
| L066 | Payments | Supplier payouts exist | Blocked | Requires payout rail, KYC/tax, and supplier terms |
| L067 | Payments | Chargeback/refund policy exists | Prepared | contract-only status in V2 commercial endpoint |
| L068 | Payments | Usage accounting is durable | Blocked | Requires durable store |
| L069 | Payments | Cost anomaly monitoring exists | Blocked | Requires production billing/cost stack |
| L070 | Payments | Marketplace take-rate is approved | Blocked | Requires business decision |
| L071 | Data | Public/synthetic-only policy exists | Done | README, Terms, Privacy, UI |
| L072 | Data | Hosted demo rejects private-like inputs | Done | hosted smoke |
| L073 | Data | Request-body logging is disabled | Done | health and readiness responses |
| L074 | Data | Request-body persistence is disabled in hosted demo | Done | health and readiness responses |
| L075 | Data | Metadata-only metrics exist | Done | `/v0/metrics` |
| L076 | Data | Private-context architecture is documented | Prepared | readiness docs describe blocker |
| L077 | Data | Tenant isolation is implemented | Blocked | Requires auth, storage, and production architecture |
| L078 | Data | Encryption and key management are implemented | Blocked | Requires secrets and production infra |
| L079 | Data | Retention/deletion controls are implemented | Blocked | Requires durable store and policy |
| L080 | Data | DPA/privacy/legal review is complete | Blocked | Requires legal review |
| L081 | Security | Security headers are emitted | Done | live smoke |
| L082 | Security | Rate-limit headers are emitted | Done | live smoke |
| L083 | Security | Secret/private reference scan passes | Done | local scan |
| L084 | Security | Non-sensitive security issue template exists | Done | `.github/ISSUE_TEMPLATE/non_sensitive_security.yml` |
| L085 | Security | Public security policy exists | Done | `SECURITY.md` |
| L086 | Security | Private vulnerability reporting channel exists | Blocked | Requires approved private contact/channel |
| L087 | Security | Authenticated API keys exist | Blocked | Requires secrets and environment config |
| L088 | Security | Abuse review queue exists | Prepared | contract-only endpoint; durable queue not live |
| L089 | Security | Pen test or independent security review is complete | Blocked | Requires external/human review |
| L090 | Security | Threat model is production-reviewed | Prepared | boundary docs exist; formal review needed |
| L091 | Reliability | Local verification suite passes | Done | `npm run gateway:verify` |
| L092 | Reliability | Unit tests pass | Done | `npm test` |
| L093 | Reliability | Hosted smoke passes live | Done | Render smoke |
| L094 | Reliability | Rollback path is documented | Done | `docs/public-beta-operations.md` |
| L095 | Reliability | CI workflow exists | Prepared | `.github/workflows/ci.yml` |
| L096 | Reliability | Production monitoring is connected | Blocked | Requires monitoring provider or paid/free approved service |
| L097 | Reliability | Error alerting is connected | Blocked | Requires alert destination |
| L098 | Reliability | Uptime/SLA is defined | Blocked | Requires business/support commitment |
| L099 | Reliability | Durable audit trail exists | Blocked | Requires durable store |
| L100 | Reliability | Backup/restore process exists | Blocked | Requires durable store |
| L101 | Legal | Public demo terms exist | Done | `TERMS.md` |
| L102 | Legal | Privacy note exists | Done | `PRIVACY.md` |
| L103 | Legal | Contributor terms are documented | Prepared | `CONTRIBUTING.md` |
| L104 | Legal | Code of conduct exists | Prepared | `CODE_OF_CONDUCT.md` |
| L105 | Legal | Supplier terms exist | Blocked | Requires legal/commercial review |
| L106 | Legal | Customer terms exist | Blocked | Requires legal/commercial review |
| L107 | Legal | Marketplace liability posture is approved | Blocked | Requires legal/commercial review |
| L108 | Legal | IP ownership for accepted work is approved | Blocked | Requires legal/commercial review |
| L109 | Legal | Tax/KYC obligations are addressed | Blocked | Requires payout rail and legal/accounting review |
| L110 | Legal | Platform ToS review is complete | Blocked | Requires source/channel decisions |
| L111 | GTM | README is beta/selling oriented | Done | `README.md` |
| L112 | GTM | Agent-readable docs exist | Done | `llms.txt`, `llms-full.txt` |
| L113 | GTM | GitHub issue templates exist | Done | `.github/ISSUE_TEMPLATE/*` |
| L114 | GTM | PR template exists | Prepared | `.github/PULL_REQUEST_TEMPLATE.md` |
| L115 | GTM | Roadmap exists | Prepared | `ROADMAP.md` |
| L116 | GTM | Beta tracker exists | Prepared | `docs/public-beta-operations.md` |
| L117 | GTM | Launch channels are selected | Blocked | Requires Stephen approval |
| L118 | GTM | First 5-10 reviewers are selected | Blocked | Requires Stephen approval and outreach |
| L119 | GTM | Support owner and cadence are assigned | Blocked | Requires operator commitment |
| L120 | GTM | Launch go/no-go owner approves | Blocked | Requires Stephen final approval |

## Executed In This Pass

- Verified the live Render deployment serves the polished first-run UI.
- Ran live hosted smoke against the Render URL.
- Added this actual product launch checklist.
- Added local CI workflow config for future PR/main verification.
- Added contributor, PR, code-of-conduct, and roadmap artifacts.
- Added a launch-readiness audit command and regression test.

## Current Go/No-Go

- Trusted public beta review: Go, after Stephen approves the invite list and message.
- Broader public product push: No-go.
- Customer/private/paid/supplier launch: No-go.

## Required Before A Broader Product Push

The minimum next tranche is:

1. Real beta users: select 5-10 reviewers, send approved invite copy, and collect route-usefulness data.
2. Production trust: private security contact, auth, tenant scopes, durable audit trail, and abuse queue.
3. Product proof: real public-demand tasks with accepted/rejected outcomes and calibrated route scoring.
4. Commercial boundary: decide whether this is a SaaS gateway, supplier marketplace, or API utility before adding payments.
5. Ops: monitoring, alerting, rollback drill, support owner, and incident rules.
6. Legal: terms, privacy, supplier/customer contracts, ToS review, and payout/tax posture.
