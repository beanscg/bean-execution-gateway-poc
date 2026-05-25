"""Local Bean Execution Gateway client stub.

This wrapper shells out to the local Node CLI. It does not call a hosted API,
does not send data over the network, and inherits the V0 free-only guardrails.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
CLI = ROOT / "scripts" / "execution-gateway.mjs"


def find_execution_path(request: dict[str, Any], out_dir: str | None = None) -> dict[str, Any]:
    """Run the local CLI and return its compact stdout summary."""
    with TemporaryDirectory() as tmp:
        request_path = Path(tmp) / "request.json"
        request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
        args = ["node", str(CLI), "find-execution-path", "--input", str(request_path)]
        if out_dir:
            args.extend(["--out", out_dir])
        result = subprocess.run(args, cwd=ROOT, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)


def summarize_ledger(ledger_path: str | None = None) -> dict[str, Any]:
    """Summarize the local outcome ledger through the CLI."""
    args = ["node", str(CLI), "summarize-ledger"]
    if ledger_path:
        args.extend(["--ledger", ledger_path])
    result = subprocess.run(args, cwd=ROOT, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)
