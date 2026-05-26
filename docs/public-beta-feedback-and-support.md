# Public Beta Feedback And Support

## Support Channel

Recommended support channel for public beta: GitHub Issues.

Use issues only for public, non-sensitive feedback:

- Bug report.
- Route feedback.
- Feature request.
- Non-sensitive security feedback.

Do not use GitHub Issues for secrets, private customer data, exploit payloads against real targets, or regulated information.

## Feedback Metadata

The API feedback path accepts enumerated metadata only:

- `target_type`
- `target_id`
- `helpful`
- `route_useful`
- `reason_code`
- `chosen_route`
- `latency_bucket`
- `blocked_reason`

Free-text fields such as `comment`, `notes`, `raw_prompt`, `prompt`, `message`, and `email` are rejected by the V2 feedback endpoint.

## Triage Labels

Recommended labels:

- `beta-feedback`
- `route-quality`
- `bug`
- `docs`
- `safety-boundary`
- `feature-request`
- `non-sensitive-security`
- `blocked-private-data`
- `blocked-paid-execution`
- `blocked-external-supplier`

## Weekly Review

Review beta feedback once per week:

1. Count useful vs not-useful route feedback.
2. Identify confusing copy or safety warnings.
3. Identify task types users naturally tried.
4. Identify whether users wanted execution, routing, or marketplace behavior.
5. Decide whether to change positioning, scoring, examples, or onboarding.

## Stop Conditions

Pause public beta sharing if:

- Users paste private data.
- Users ask for customer/private/paid execution.
- Users ask for public posting or supplier execution.
- Support load exceeds manual review capacity.
- A platform requests payment or broader account permissions.
