# Privacy

The public hosted demo is for public or synthetic inputs only.

## Hosted Demo

- Does not intentionally log request bodies in app code.
- Does not persist route request bodies to disk.
- Stores outcome records in process memory only.
- Rejects private, work, company, customer, credential, local-file, internal, and regulated-data signals before route processing.

## Local Use

Local runs may write route artifacts and outcome ledgers to local `data/` or `dist/` paths depending on the command. Do not run local mode with data you are not authorized to process.

## Future Work

Production private-context handling requires authentication, tenant isolation, retention controls, encryption, audit logging, abuse controls, and explicit data-processing terms. Those are not part of this POC.
