# Security Policy

## Supported Version

This is a public POC. Only the current `main` branch is supported.

## Do Not Submit Sensitive Data

Do not submit private, work, company, customer, credential, local-file, internal, or regulated data to the public hosted demo. The demo is intentionally scoped to public or synthetic requests.

## Reporting

Open a public GitHub issue only for non-sensitive security feedback. Do not include secrets, private data, exploit payloads against real targets, or customer information in an issue.

For sensitive reports, do not use the public demo or public issue tracker until a private reporting channel is added.

Use the "Non-sensitive security feedback" issue template only for public, low-risk findings such as broken headers, confusing warnings, or documentation gaps. If a report needs secrecy, stop and wait for a private channel.

## Current Security Boundaries

- Hosted demo rejects private and secret-like input before route processing.
- Hosted demo records outcomes in memory only.
- Security headers are emitted on API and demo responses.
- Public demo rate limiting is active.
- `/v0/metrics` exposes metadata-only counters and does not expose request bodies.
- `/v0/dispatch` is present only to return `dispatch_disabled_in_v0`.
- No payment rails, supplier calls, account mutation, private repositories, or external execution exist in V0.
- Route decisions are not permission to perform external actions.

## Known POC Limitations

- No production auth or tenant isolation.
- No production tenant-scoped rate limiting or abuse queue.
- No private vulnerability reporting channel yet.
- No durable audit system beyond local verification artifacts.
