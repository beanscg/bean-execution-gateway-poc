# Privacy

The public hosted demo is for public or synthetic inputs only.

## Hosted Demo

- Does not intentionally log request bodies in app code.
- Does not persist route request bodies to disk.
- Stores outcome records in process memory only.
- Rejects private, work, company, customer, credential, local-file, internal, and regulated-data signals before route processing.
- Exposes metadata-only metrics and does not expose request bodies through `/v0/metrics`.
- Returns request IDs for tracing without storing raw submitted payloads.
- Feedback endpoints accept enumerated metadata and reject free-text fields.
- Public GitHub issue feedback is public by definition; do not include sensitive data in an issue.

## Local Use

Local runs may write route artifacts and outcome ledgers to local `data/` or `dist/` paths depending on the command. Do not run local mode with data you are not authorized to process.

## Future Work

Production private-context handling requires authentication, tenant isolation, retention controls, encryption, audit logging, abuse controls, and explicit data-processing terms. Those are not part of this POC.
