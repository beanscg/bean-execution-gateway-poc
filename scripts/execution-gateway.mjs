#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  defaultOutcomeLedgerPath,
  defaultRegistryPath,
  recordOutcome,
  rootDir,
  runEvaluation,
  runExecutionGateway
} from './execution-gateway-lib.mjs';
import {
  blockedRouteReport,
  buildArtifactManifest,
  buildLocalPackage,
  buildProgressReport,
  buildOpenApiSpec,
  diffResponses,
  generateProofTasks,
  lintExecutorRegistry,
  runGatewayVerification,
  runSchemaSelfTest,
  summarizeLedgerFile,
  summarizeRouteRun,
} from './execution-gateway-tools.mjs';
import {
  readJson,
  writeJson,
} from './work-network-lib.mjs';

function usage() {
  return `Usage:
  node scripts/execution-gateway.mjs find-execution-path --input <json> [--out <dir>] [--registry <json>]
  node scripts/execution-gateway.mjs record-outcome --input <json> [--ledger <jsonl>]
  node scripts/execution-gateway.mjs evaluate --proof <json> --adversarial <json> --out <dir> [--ledger <jsonl>] [--registry <json>]
  node scripts/execution-gateway.mjs summarize-route --dir <route-run-dir>
  node scripts/execution-gateway.mjs summarize-ledger [--ledger <jsonl>]
  node scripts/execution-gateway.mjs diff-response --left <response.json> --right <response.json>
  node scripts/execution-gateway.mjs blocked-report --input <evaluation-report.json> [--out <json>]
  node scripts/execution-gateway.mjs generate-fixtures --out <json> [--count 50]
  node scripts/execution-gateway.mjs schema-self-test [--sample <json>] [--proof <json>] [--adversarial <json>] [--registry <json>]
  node scripts/execution-gateway.mjs registry-lint [--registry <json>]
  node scripts/execution-gateway.mjs openapi --out <json>
  node scripts/execution-gateway.mjs verify --out <dir> [--proof <json>] [--adversarial <json>] [--ledger <jsonl>]
  node scripts/execution-gateway.mjs hosted-smoke [--base-url <url>]
  node scripts/execution-gateway.mjs build-package --out <dir>
  node scripts/execution-gateway.mjs progress --out <json>
`;
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      flags._.push(arg);
    }
  }
  return flags;
}

function resolvePath(value, fallback) {
  return value ? path.resolve(value) : fallback;
}

function writeStdout(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function fetchJson(baseUrl, routePath, options = {}) {
  const response = await fetch(new URL(routePath, baseUrl), {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { parse_error: error.message, raw: text.slice(0, 200) };
  }
  return { status: response.status, payload };
}

async function runHostedSmoke({ baseUrl }) {
  const safeRequest = {
    request_id: 'smoke-safe-public-route',
    outcome: {
      goal: 'Triage a public GitHub issue and produce a local next-step packet.',
      task_type: 'issue_triage',
      desired_artifact: 'triage_packet',
      success_criteria: ['local artifact', 'verifier plan', 'no public comment'],
    },
    context_refs: ['https://github.com/example/project/issues/101'],
    policy: { mode: 'free_only' },
  };
  const blockedRequest = {
    request_id: 'smoke-blocked-paid-public-write',
    outcome: {
      goal: 'Use a paid API and post a comment on the public issue.',
      task_type: 'agent_task_triage',
      desired_artifact: 'blocked_packet',
    },
    context_refs: ['https://github.com/example/project/issues/102'],
    policy: { mode: 'free_only' },
  };
  const privateRejectRequest = {
    request_id: 'smoke-hosted-private-reject',
    outcome: {
      goal: 'Review a private repo issue.',
      task_type: 'issue_triage',
      desired_artifact: 'blocked_packet',
    },
    context_refs: ['private://github/example/internal/issues/9'],
    policy: { mode: 'free_only' },
  };

  const checks = [];
  const addCheck = (name, passed, detail = null) => checks.push({ name, passed: Boolean(passed), detail });

  const health = await fetchJson(baseUrl, '/v0/health');
  addCheck('health_ok', health.status === 200 && health.payload?.ok === true, health.payload);
  addCheck('hosted_demo_zero_spend', health.payload?.spend_usd === 0 && health.payload?.external_writes === 0 && health.payload?.external_executions === 0, health.payload);

  const openapi = await fetchJson(baseUrl, '/v0/openapi.json');
  addCheck('openapi_available', openapi.status === 200 && openapi.payload?.openapi === '3.1.0' && Boolean(openapi.payload?.paths?.['/v0/route']), { status: openapi.status });

  const safe = await fetchJson(baseUrl, '/v0/route', {
    method: 'POST',
    body: JSON.stringify(safeRequest),
  });
  addCheck('safe_public_route_allowed', safe.status === 200 && safe.payload?.decision?.policy_state === 'allowed' && safe.payload?.cost?.estimated_total_cost_usd === 0, safe.payload?.decision);

  const blocked = await fetchJson(baseUrl, '/v0/route', {
    method: 'POST',
    body: JSON.stringify(blockedRequest),
  });
  addCheck('paid_public_write_blocked', blocked.status === 200
    && blocked.payload?.decision?.policy_state === 'blocked'
    && blocked.payload?.stop_conditions?.includes('requires_paid_api')
    && blocked.payload?.stop_conditions?.includes('requires_public_post'), blocked.payload?.stop_conditions);

  const privateReject = await fetchJson(baseUrl, '/v0/route', {
    method: 'POST',
    body: JSON.stringify(privateRejectRequest),
  });
  addCheck('hosted_private_input_rejected_before_routing', privateReject.status === 400
    && privateReject.payload?.error === 'hosted_demo_rejects_private_work_or_secret_like_context', privateReject.payload);

  const outcome = await fetchJson(baseUrl, '/v0/outcomes', {
    method: 'POST',
    body: JSON.stringify({
      route_run_id: safe.payload?.route_run_id || 'smoke-route-run',
      request_id: safe.payload?.request_id || safeRequest.request_id,
      task_type: 'issue_triage',
      policy_state: 'allowed',
      policy_decision: 'allow',
      selected_route: safe.payload?.decision?.selected_executor_id || 'deterministic-verifier',
      verifier_result: 'smoke_passed',
      operator_acceptance: 'accepted',
      actual_cost_usd: 0,
      actual_external_writes: 0,
      actual_external_executions: 0,
    }),
  });
  addCheck('hosted_outcome_memory_only', outcome.status === 200 && outcome.payload?.persisted_to_disk === false && outcome.payload?.ledger_path === 'memory://hosted-demo/outcomes', outcome.payload);

  const ledger = await fetchJson(baseUrl, '/v0/ledger/summary');
  addCheck('ledger_summary_zero_actuals', ledger.status === 200
    && ledger.payload?.actual_cost_usd === 0
    && ledger.payload?.actual_external_writes === 0
    && ledger.payload?.actual_external_executions === 0, ledger.payload);

  return {
    ok: checks.every((check) => check.passed),
    base_url: baseUrl,
    checks,
  };
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(usage());
    return;
  }

  if (command === 'find-execution-path') {
    const flags = parseFlags(rest);
    if (!flags.input) throw new Error('find-execution-path requires --input');
    const inputPath = path.resolve(flags.input);
    const input = readJson(inputPath);
    const requestedOut = flags.out ? path.resolve(flags.out) : null;
    const result = runExecutionGateway(input, {
      registryPath: resolvePath(flags.registry, defaultRegistryPath),
      outDir: requestedOut || undefined,
    });
    writeStdout({
      route_run_id: result.response.route_run_id,
      policy_state: result.response.decision.policy_state,
      policy_decision: result.response.decision.policy_decision,
      selected_executor_id: result.response.decision.selected_executor_id,
      route_run_dir: result.route_run_dir,
      response_path: result.response.artifact_refs.response_json,
      chargeable: result.response.chargeable,
      would_require_paid_step: result.response.would_require_paid_step,
      stop_conditions: result.response.stop_conditions,
    });
    return;
  }

  if (command === 'record-outcome') {
    const flags = parseFlags(rest);
    if (!flags.input) throw new Error('record-outcome requires --input');
    const result = recordOutcome(readJson(path.resolve(flags.input)), {
      ledgerPath: resolvePath(flags.ledger, defaultOutcomeLedgerPath),
    });
    writeStdout({
      ledger_path: result.ledger_path,
      outcome_id: result.record.outcome_id,
      route_run_id: result.record.route_run_id,
    });
    return;
  }

  if (command === 'summarize-route') {
    const flags = parseFlags(rest);
    if (!flags.dir) throw new Error('summarize-route requires --dir');
    writeStdout(summarizeRouteRun(path.resolve(flags.dir)));
    return;
  }

  if (command === 'summarize-ledger') {
    const flags = parseFlags(rest);
    writeStdout(summarizeLedgerFile(resolvePath(flags.ledger, defaultOutcomeLedgerPath)));
    return;
  }

  if (command === 'diff-response') {
    const flags = parseFlags(rest);
    if (!flags.left) throw new Error('diff-response requires --left');
    if (!flags.right) throw new Error('diff-response requires --right');
    writeStdout(diffResponses(readJson(path.resolve(flags.left)), readJson(path.resolve(flags.right))));
    return;
  }

  if (command === 'blocked-report') {
    const flags = parseFlags(rest);
    if (!flags.input) throw new Error('blocked-report requires --input');
    const report = blockedRouteReport(readJson(path.resolve(flags.input)));
    if (flags.out) writeJson(path.resolve(flags.out), report);
    writeStdout(report);
    return;
  }

  if (command === 'generate-fixtures') {
    const flags = parseFlags(rest);
    if (!flags.out) throw new Error('generate-fixtures requires --out');
    const suite = generateProofTasks({ count: Number(flags.count || 50) });
    writeJson(path.resolve(flags.out), suite);
    writeStdout({
      out: path.resolve(flags.out),
      tasks: suite.tasks.length,
      suite_name: suite.suite_name,
    });
    return;
  }

  if (command === 'schema-self-test') {
    const flags = parseFlags(rest);
    const report = runSchemaSelfTest({
      samplePath: resolvePath(flags.sample, path.join(rootDir, 'fixtures', 'execution-gateway', 'sample-request.json')),
      adversarialPath: resolvePath(flags.adversarial, path.join(rootDir, 'fixtures', 'execution-gateway', 'adversarial-fixtures.json')),
      proofPath: resolvePath(flags.proof, path.join(rootDir, 'fixtures', 'execution-gateway', 'proof-tasks.json')),
      registryPath: resolvePath(flags.registry, defaultRegistryPath),
    });
    writeStdout(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'registry-lint') {
    const flags = parseFlags(rest);
    const report = lintExecutorRegistry(readJson(resolvePath(flags.registry, defaultRegistryPath)));
    writeStdout(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'openapi') {
    const flags = parseFlags(rest);
    const spec = buildOpenApiSpec();
    if (flags.out) writeJson(path.resolve(flags.out), spec);
    writeStdout(flags.out ? { out: path.resolve(flags.out), paths: Object.keys(spec.paths).length } : spec);
    return;
  }

  if (command === 'verify') {
    const flags = parseFlags(rest);
    const outDir = resolvePath(flags.out, path.join(rootDir, 'dist', 'execution-gateway', 'verification'));
    const report = runGatewayVerification({
      outDir,
      proofPath: resolvePath(flags.proof, path.join(rootDir, 'fixtures', 'execution-gateway', 'proof-tasks.json')),
      adversarialPath: resolvePath(flags.adversarial, path.join(rootDir, 'fixtures', 'execution-gateway', 'adversarial-fixtures.json')),
      registryPath: resolvePath(flags.registry, defaultRegistryPath),
      ledgerPath: resolvePath(flags.ledger, path.join(outDir, 'outcomes.jsonl')),
    });
    writeStdout({
      out_dir: outDir,
      ok: report.ok,
      report: path.join(outDir, 'verification-report.md'),
    });
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'hosted-smoke') {
    const flags = parseFlags(rest);
    const baseUrl = flags['base-url'] || process.env.BEAN_GATEWAY_BASE_URL || 'http://127.0.0.1:8787';
    const report = await runHostedSmoke({ baseUrl });
    writeStdout(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'build-package') {
    const flags = parseFlags(rest);
    const outDir = resolvePath(flags.out, path.join(rootDir, 'dist', 'execution-gateway', 'package'));
    const manifest = buildLocalPackage({ outDir });
    writeStdout({
      out_dir: outDir,
      files: manifest.files.length,
      manifest: path.join(outDir, 'manifest.json'),
    });
    return;
  }

  if (command === 'manifest') {
    const flags = parseFlags(rest);
    const outDir = resolvePath(flags.out, path.join(rootDir, 'dist', 'execution-gateway', 'manifest'));
    const files = [
      path.join(rootDir, 'scripts', 'execution-gateway-lib.mjs'),
      path.join(rootDir, 'scripts', 'execution-gateway.mjs'),
      path.join(rootDir, 'scripts', 'execution-gateway-tools.mjs'),
      path.join(rootDir, 'scripts', 'execution-gateway-server.mjs'),
      path.join(rootDir, 'data', 'execution-gateway', 'registry.json'),
      path.join(rootDir, 'fixtures', 'execution-gateway', 'sample-request.json'),
      path.join(rootDir, 'fixtures', 'execution-gateway', 'proof-tasks.json'),
      path.join(rootDir, 'fixtures', 'execution-gateway', 'adversarial-fixtures.json'),
    ];
    fs.mkdirSync(outDir, { recursive: true });
    const manifest = buildArtifactManifest({ outDir, files });
    writeStdout({
      out_dir: outDir,
      files: manifest.files.length,
      manifest: path.join(outDir, 'manifest.json'),
    });
    return;
  }

  if (command === 'progress') {
    const flags = parseFlags(rest);
    const outPath = resolvePath(flags.out, path.join(rootDir, 'docs', 'agent_execution_gateway_100_goal_progress_2026-05-25.json'));
    const completedIds = [
      'G001', 'G002', 'G003', 'G004', 'G005', 'G006', 'G007', 'G008', 'G009', 'G010',
      'G011-G020', 'G021-G030', 'G031-G040', 'G041-G050', 'G051-G060', 'G061-G070',
      'G071-G080', 'G081-G090', 'G091-G100',
    ];
    const report = buildProgressReport({ completedIds, outPath });
    writeStdout({ out: outPath, completed: report.completed, pending: report.partial_or_pending });
    return;
  }

  if (command === 'evaluate') {
    const flags = parseFlags(rest);
    if (!flags.proof) throw new Error('evaluate requires --proof');
    if (!flags.adversarial) throw new Error('evaluate requires --adversarial');
    const outDir = resolvePath(flags.out, path.join(rootDir, 'dist', 'execution-gateway', 'evaluation'));
    const report = runEvaluation({
      proofInput: readJson(path.resolve(flags.proof)),
      adversarialInput: readJson(path.resolve(flags.adversarial)),
      outDir,
      ledgerPath: resolvePath(flags.ledger, defaultOutcomeLedgerPath),
      registryPath: resolvePath(flags.registry, defaultRegistryPath),
    });
    const docsReportPath = path.join(rootDir, 'docs', 'agent_execution_gateway_v0_eval_report_2026-05-25.md');
    fs.copyFileSync(path.join(outDir, 'evaluation-report.md'), docsReportPath);
    writeJson(path.join(rootDir, 'docs', 'agent_execution_gateway_v0_eval_report_2026-05-25.json'), report);
    writeStdout({
      out_dir: outDir,
      evaluation_report: path.join(outDir, 'evaluation-report.md'),
      docs_report: docsReportPath,
      gate_passed: report.gate_passed,
      proof_tasks: report.proof.totals.tasks,
      material_improvements: report.proof.totals.material_improvements,
      adversarial_failed: report.adversarial.totals.failed,
      ledger_records: report.outcome_ledger.records,
    });
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
