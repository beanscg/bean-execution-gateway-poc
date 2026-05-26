# Public Proof Runner

The public proof runner turns an open-demand task bundle into a bounded evidence packet.

V0 rules:

- Public GitHub URLs and fixture URLs only.
- Zero spend.
- No package installs.
- No public writes.
- No account creation.
- No PRs, issue comments, claims, marketplace submissions, or supplier execution.
- Hosted demo mode disables clone-based proof and uses metadata proof only.

Proof statuses:

- `fixture_public_proof`: deterministic fixture proof.
- `read_only_public_metadata_proof`: public GitHub metadata and refs were inspected.
- `public_clone_inspected`: a public repository was cloned locally and inspected without installs.
- `local_check_passed` or `local_check_failed`: an already-runnable local check was attempted without installing dependencies.
- `blocked`: source was not public GitHub or fixture-backed.
- `failed`: bounded public read or clone failed.

The output is an evidence packet for review. It is not an external submission.
