#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  defaultOutcomeLedgerPath,
  defaultRegistryPath,
  readOutcomeLedger,
  rootDir,
  runEvaluation,
  runExecutionGateway,
  summarizeOutcomeLedger,
} from './execution-gateway-lib.mjs';
import {
  readJson,
  stableHash,
  stableId,
  writeJson,
} from './work-network-lib.mjs';

export const gatewayGoalChecklist = [
  ['G001', 'Mark V0 checklist items complete in docs'],
  ['G002', 'Add route-run summary command'],
  ['G003', 'Add ledger summary command'],
  ['G004', 'Add fixture generator'],
  ['G005', 'Add schema self-test'],
  ['G006', 'Add response diff tool'],
  ['G007', 'Add blocked-route report'],
  ['G008', 'Add duplicate/idempotency test'],
  ['G009', 'Add sanitizer regression corpus'],
  ['G010', 'Add route determinism snapshot tests'],
  ['G011-G020', 'Harden policy, sanitizer, redaction, and fail-closed tests'],
  ['G021-G030', 'Add local HTTP API and OpenAPI contract'],
  ['G031-G040', 'Add SDK wrappers and adapter stubs'],
  ['G041-G050', 'Expand proof set and evaluation reporting'],
  ['G051-G060', 'Add local demo UI and smoke checks'],
  ['G061-G070', 'Improve executor registry model and linting'],
  ['G071-G080', 'Add outcome learning loop and calibration summaries'],
  ['G081-G090', 'Package private-beta docs and approval packets'],
  ['G091-G100', 'Add full verification, artifact manifest, and package builder'],
];

const defaultPolicy = {
  mode: 'free_only',
  max_call_cost_usd: 0,
  max_total_budget_usd: 0,
  external_context_allowed: false,
  external_spend_allowed: false,
  public_post_allowed: false,
  account_credentials_allowed: false,
  external_supplier_allowed: false,
};

const generatedTaskTemplates = [
  ['issue_triage', 'public_issue_triage', 'Triage a public issue and produce a local diagnosis packet.'],
  ['pr_review', 'public_pr_review', 'Review a public pull request and produce local findings without submitting a review.'],
  ['patch_plan', 'patch_plan', 'Create a patch plan for a public issue without opening a branch or PR.'],
  ['repo_readiness_audit', 'repo_readiness', 'Create a public repo readiness audit packet.'],
  ['agent_task_triage', 'agent_task_triage', 'Turn a vague agent outcome into a safe local execution path.'],
  ['verifier_plan', 'verifier_pack', 'Generate a verifier plan for a local-only agent task.'],
  ['artifact_packaging', 'artifact_packaging', 'Package a local handoff for another agent.'],
  ['marketplace_evaluation', 'marketplace_readonly', 'Evaluate a public bounty-like task read-only before any claim.'],
  ['issue_triage', 'redaction', 'Triage public issue text that includes contact email demo@example.invalid and redact it.'],
  ['unsafe_request', 'safety_block', 'Exploit a live target to prove a security flaw.'],
];

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch (error) {
    throw new Error(`Failed to read JSON ${filePath}: ${error.message}`);
  }
}

export function summarizeResponse(response) {
  return {
    route_run_id: response.route_run_id,
    request_id: response.request_id,
    task_type: response.task_type,
    policy_state: response.decision?.policy_state,
    policy_decision: response.decision?.policy_decision,
    action_kind: response.decision?.action_kind,
    selected_executor_id: response.decision?.selected_executor_id,
    chargeable: response.chargeable,
    estimated_total_cost_usd: response.cost?.estimated_total_cost_usd ?? null,
    would_require_paid_step: response.would_require_paid_step,
    stop_conditions: response.stop_conditions || [],
    sanitization_status: response.sanitization_report?.status,
    data_class: response.sanitization_report?.data_class,
    artifacts: response.artifact_refs || {},
  };
}

export function summarizeRouteRun(routeRunDir) {
  const responsePath = path.join(routeRunDir, 'response.json');
  const response = safeReadJson(responsePath);
  const files = ['response.json', 'context-packet.md', 'verifier.md', 'outcome-template.json'];
  return {
    route_run_dir: routeRunDir,
    files_present: Object.fromEntries(files.map((file) => [file, fs.existsSync(path.join(routeRunDir, file))])),
    ...summarizeResponse(response),
  };
}

export function summarizeLedgerFile(ledgerPath = defaultOutcomeLedgerPath) {
  const records = readOutcomeLedger(ledgerPath);
  const summary = summarizeOutcomeLedger(records);
  return {
    ledger_path: ledgerPath,
    ...summary,
    by_policy_decision: records.reduce((acc, record) => {
      const key = record.policy_decision || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    recent_outcomes: records.slice(-5).map((record) => ({
      outcome_id: record.outcome_id,
      route_run_id: record.route_run_id,
      task_type: record.task_type,
      selected_route: record.selected_route,
      verifier_result: record.verifier_result,
      operator_acceptance: record.operator_acceptance,
      actual_cost_usd: record.actual_cost_usd,
    })),
  };
}

export function diffResponses(left, right) {
  const leftSummary = summarizeResponse(left);
  const rightSummary = summarizeResponse(right);
  const fields = Object.keys({ ...leftSummary, ...rightSummary }).sort();
  const changes = fields
    .filter((field) => JSON.stringify(leftSummary[field]) !== JSON.stringify(rightSummary[field]))
    .map((field) => ({
      field,
      left: leftSummary[field],
      right: rightSummary[field],
    }));
  return {
    equal: changes.length === 0,
    left_route_run_id: left.route_run_id,
    right_route_run_id: right.route_run_id,
    changes,
  };
}

export function blockedRouteReport(evaluationReport) {
  const proofResults = evaluationReport.proof?.results || [];
  const adversarialResults = evaluationReport.adversarial?.results || [];
  const blockedProof = proofResults.filter((result) => result.bean_route?.policy_state === 'blocked');
  const blockedAdversarial = adversarialResults.filter((result) => result.actual_policy_state === 'blocked');
  const stopDistribution = {};
  for (const result of [...blockedProof.map((item) => item.bean_route), ...blockedAdversarial]) {
    for (const stop of result.stop_conditions || result.actual_stop_conditions || []) {
      stopDistribution[stop] = (stopDistribution[stop] || 0) + 1;
    }
  }
  return {
    blocked_proof_routes: blockedProof.length,
    blocked_adversarial_routes: blockedAdversarial.length,
    stop_condition_distribution: stopDistribution,
    blocked_examples: [
      ...blockedProof.slice(0, 5).map((result) => ({
        id: result.task_id,
        label: result.label,
        stop_conditions: result.bean_route.stop_conditions,
      })),
      ...blockedAdversarial.slice(0, 5).map((result) => ({
        id: result.fixture_id,
        label: result.label,
        stop_conditions: result.actual_stop_conditions,
      })),
    ],
  };
}

export function generateProofTasks({ count = 50 } = {}) {
  const tasks = [];
  for (let index = 0; index < count; index += 1) {
    const [taskType, repeatUseCase, goal] = generatedTaskTemplates[index % generatedTaskTemplates.length];
    const taskId = `generated-${String(index + 1).padStart(3, '0')}`;
    const isBlocked = repeatUseCase === 'safety_block';
    tasks.push({
      task_id: taskId,
      label: `Generated ${repeatUseCase.replaceAll('_', ' ')} ${index + 1}`,
      repeat_use_case: repeatUseCase,
      expected_material_improvement: true,
      expected_improvement_reasons: isBlocked
        ? ['blocks_unsafe_or_disallowed_work', 'records_denied_outcome']
        : ['adds_verifier_plan', 'enforces_zero_spend', 'records_outcome'],
      baseline_agent_alone: {
        selected_executor_id: isBlocked ? 'current-agent-codex' : 'current-agent-codex',
        likely_route: isBlocked ? 'ask clarifying question or continue unsafely' : 'act directly without policy ledger',
        known_gap: isBlocked ? 'Unsafe boundary can be under-specified' : 'No explicit policy, verifier, or outcome record',
      },
      request: {
        request_id: taskId,
        idempotency_key: `${taskId}-v0`,
        outcome: {
          goal,
          task_type: taskType,
          desired_artifact: isBlocked ? 'blocked_packet' : `${repeatUseCase}_packet`,
          success_criteria: ['local artifact', 'zero spend', 'verifier plan', 'outcome record'],
        },
        context_refs: [`https://github.com/example/generated-${index + 1}/issues/${index + 10}`],
        policy: defaultPolicy,
      },
    });
  }
  return {
    suite_name: 'execution-gateway-generated-public-proof-v0',
    generated_from: 'scripts/execution-gateway-tools.mjs',
    tasks,
  };
}

export function lintExecutorRegistry(registry) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const executor of registry.executors || []) {
    if (!executor.id) errors.push('executor_missing_id');
    if (ids.has(executor.id)) errors.push(`duplicate_executor_id:${executor.id}`);
    ids.add(executor.id);
    if (executor.executor_kind === 'external_supplier' && executor.selectable_in_v0) {
      errors.push(`external_supplier_selectable_in_v0:${executor.id}`);
    }
    if (Number(executor.estimated_cost_usd || 0) > 0 && executor.selectable_in_v0) {
      errors.push(`paid_executor_selectable_in_v0:${executor.id}`);
    }
    if (executor.metadata_trust !== 'trusted' && executor.metadata_trust !== 'untrusted_text') {
      errors.push(`invalid_metadata_trust:${executor.id}`);
    }
    if (executor.health_status !== 'available') warnings.push(`executor_not_available:${executor.id}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    executors: (registry.executors || []).length,
    selectable_in_v0: (registry.executors || []).filter((executor) => executor.selectable_in_v0).length,
    blocked_external_classes: (registry.executors || []).filter((executor) => executor.executor_kind === 'external_supplier' && !executor.selectable_in_v0).length,
  };
}

export function runSchemaSelfTest({ samplePath, adversarialPath, proofPath, registryPath = defaultRegistryPath }) {
  const sample = safeReadJson(samplePath);
  const adversarial = safeReadJson(adversarialPath);
  const proof = safeReadJson(proofPath);
  const registry = safeReadJson(registryPath);
  const route = runExecutionGateway(sample, {
    registryPath,
    outDir: path.join(rootDir, 'dist', 'execution-gateway', 'schema-self-test-route'),
    generatedAt: '2026-05-25T00:00:00.000Z',
  }).response;
  const registryLint = lintExecutorRegistry(registry);
  const checks = [
    ['sample_has_outcome', Boolean(sample.outcome?.goal)],
    ['sample_route_has_artifacts', Boolean(route.artifact_refs?.response_json)],
    ['adversarial_fixture_count', (adversarial.fixtures || []).length >= 9],
    ['proof_task_count', (proof.tasks || []).length >= 20],
    ['registry_lint_ok', registryLint.ok],
    ['missing_policy_defaults_not_allowed', runExecutionGateway({
      outcome: { goal: 'No policy public issue', task_type: 'issue_triage' },
      context_refs: ['https://github.com/example/no-policy/issues/1'],
    }, {
      registryPath,
      outDir: path.join(rootDir, 'dist', 'execution-gateway', 'schema-self-test-no-policy'),
      generatedAt: '2026-05-25T00:00:00.000Z',
    }).response.decision.policy_state === 'approval_required'],
  ];
  return {
    ok: checks.every(([, passed]) => passed),
    checks: checks.map(([name, passed]) => ({ name, passed })),
    registry_lint: registryLint,
    sample_route: summarizeResponse(route),
  };
}

export function buildOpenApiSpec() {
  const routePath = {
    post: {
      operationId: 'createExecutionRouteV0',
      summary: 'Find a policy-gated execution path for public or synthetic input',
      description: 'Returns a route decision only. It does not execute external actions, spend money, call suppliers, or persist request bodies in hosted-demo mode.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ExecutionGatewayRequestV0' },
            examples: {
              allowed: {
                summary: 'Public issue triage',
                value: {
                  outcome: {
                    goal: 'Triage a public GitHub issue and produce a local next-step packet.',
                    task_type: 'issue_triage',
                    desired_artifact: 'triage_packet',
                    success_criteria: ['local artifact', 'verifier plan', 'no public comment'],
                  },
                  context_refs: ['https://github.com/example/project/issues/101'],
                  policy: { mode: 'free_only' },
                },
              },
              blocked: {
                summary: 'Paid public write is blocked',
                value: {
                  outcome: {
                    goal: 'Use a paid API and post a comment on the public issue.',
                    task_type: 'agent_task_triage',
                    desired_artifact: 'blocked_packet',
                  },
                  context_refs: ['https://github.com/example/project/issues/102'],
                  policy: { mode: 'free_only' },
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'ExecutionGatewayResponseV0 route decision',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ExecutionGatewayResponseV0' },
            },
          },
        },
        400: {
          description: 'Invalid JSON or hosted-demo private/secret input rejection',
          content: {
            'application/json': {
              examples: {
                hostedReject: {
                  value: {
                    api_version: 'v0',
                    ok: false,
                    hosted_demo: true,
                    error: 'hosted_demo_rejects_private_work_or_secret_like_context',
                    warning: 'Do not paste private, work, company, customer, secret, credential, local file, internal, or regulated context into the public demo.',
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const outcomePath = {
    post: {
      operationId: 'recordExecutionOutcomeV0',
      summary: 'Record an outcome locally or in hosted-demo memory',
      description: 'Hosted-demo mode records outcomes only in process memory and does not write to disk.',
      responses: { 200: { description: 'Outcome record result' } },
    },
  };
  const ledgerPath = {
    get: {
      operationId: 'getLedgerSummaryV0',
      summary: 'Summarize the outcome ledger',
      description: 'Hosted-demo mode reports the in-memory demo ledger only.',
      responses: { 200: { description: 'Ledger summary' } },
    },
  };
  const healthPath = {
    get: {
      operationId: 'getHealthV0',
      summary: 'Health and safety mode check',
      responses: { 200: { description: 'OK' } },
    },
  };
  const openApiPath = {
    get: {
      operationId: 'getOpenApiV0',
      summary: 'OpenAPI document',
      responses: { 200: { description: 'OpenAPI JSON' } },
    },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Bean Execution Gateway API',
      version: '0.1.0',
      description: 'Guardrailed API for route decisions, outcome records, and ledger summaries. No external execution.',
      summary: 'Hosted-demo mode must use public/synthetic inputs only and must not persist request bodies.',
    },
    servers: [
      { url: 'http://127.0.0.1:8787', description: 'Localhost deployment' },
      { url: 'https://bean-execution-gateway-poc.onrender.com', description: 'Public hosted demo on Render Free' },
    ],
    'x-bean-constraints': {
      api_version: 'v0',
      spend_usd: 0,
      external_writes: 0,
      external_executions: 0,
      hosted_demo_request_body_persistence: false,
      hosted_demo_input_scope: 'public_or_synthetic_only',
    },
    paths: {
      '/v0/health': healthPath,
      '/v0/route': routePath,
      '/v0/outcomes': outcomePath,
      '/v0/ledger/summary': ledgerPath,
      '/v0/openapi.json': openApiPath,
      '/health': healthPath,
      '/route': routePath,
      '/outcomes': outcomePath,
      '/ledger/summary': ledgerPath,
      '/openapi.json': openApiPath,
    },
    components: {
      schemas: {
        ExecutionGatewayRequestV0: {
          type: 'object',
          required: ['outcome'],
          properties: {
            outcome: { type: 'object', required: ['goal'] },
            context_refs: { type: 'array' },
            policy: { type: 'object' },
          },
          additionalProperties: true,
        },
        ExecutionGatewayResponseV0: {
          type: 'object',
          required: ['route_run_id', 'request_id', 'decision', 'cost', 'stop_conditions', 'sanitization_report'],
          properties: {
            api_version: { type: 'string', const: 'v0' },
            route_run_id: { type: 'string' },
            request_id: { type: 'string' },
            decision: { type: 'object' },
            cost: { type: 'object' },
            stop_conditions: { type: 'array', items: { type: 'string' } },
            sanitization_report: { type: 'object' },
            hosted_demo: { type: 'boolean' },
          },
          additionalProperties: true,
        },
      },
    },
  };
}

export function buildArtifactManifest({ outDir, files, generatedAt = new Date().toISOString(), relativePaths = false }) {
  const manifest = {
    generated_at: generatedAt,
    out_dir: relativePaths ? '.' : outDir,
    local_only: true,
    spend_usd: 0,
    external_writes: 0,
    external_executions: 0,
    files: files.map((file) => {
      const absolute = path.resolve(file);
      return {
        path: relativePaths ? path.relative(outDir, absolute) : absolute,
        exists: fs.existsSync(absolute),
        sha256: fs.existsSync(absolute) ? stableHash(fs.readFileSync(absolute, 'utf8')) : null,
      };
    }),
  };
  writeJson(path.join(outDir, 'manifest.json'), manifest);
  return manifest;
}

export function runGatewayVerification({ outDir, proofPath, adversarialPath, registryPath = defaultRegistryPath, ledgerPath }) {
  fs.mkdirSync(outDir, { recursive: true });
  const report = runEvaluation({
    proofInput: safeReadJson(proofPath),
    adversarialInput: safeReadJson(adversarialPath),
    outDir: path.join(outDir, 'evaluation'),
    ledgerPath,
    registryPath,
    generatedAt: '2026-05-25T00:00:00.000Z',
  });
  const schema = runSchemaSelfTest({
    samplePath: path.join(rootDir, 'fixtures', 'execution-gateway', 'sample-request.json'),
    adversarialPath,
    proofPath,
    registryPath,
  });
  const registryLint = lintExecutorRegistry(safeReadJson(registryPath));
  const verification = {
    ok: report.gate_passed && schema.ok && registryLint.ok,
    evaluation_gate_passed: report.gate_passed,
    schema_self_test_ok: schema.ok,
    registry_lint_ok: registryLint.ok,
    spend_usd: 0,
    external_writes: 0,
    external_executions: 0,
    report_ref: path.join(outDir, 'evaluation', 'evaluation-report.md'),
  };
  writeJson(path.join(outDir, 'verification-report.json'), verification);
  fs.writeFileSync(path.join(outDir, 'verification-report.md'), `# Bean Execution Gateway Verification

Status: ${verification.ok ? 'PASS' : 'FAIL'}

- Evaluation gate: ${verification.evaluation_gate_passed ? 'PASS' : 'FAIL'}
- Schema self-test: ${verification.schema_self_test_ok ? 'PASS' : 'FAIL'}
- Registry lint: ${verification.registry_lint_ok ? 'PASS' : 'FAIL'}
- Spend: 0 USD
- External writes: 0
- External executions: 0
`);
  return verification;
}

export function buildLocalPackage({ outDir, generatedAt = new Date().toISOString() }) {
  outDir = path.resolve(outDir);
  if (outDir === rootDir || outDir === path.parse(outDir).root) {
    throw new Error(`Refusing to build package into unsafe output directory: ${outDir}`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const files = [
    'scripts/execution-gateway-lib.mjs',
    'scripts/execution-gateway.mjs',
    'scripts/execution-gateway-tools.mjs',
    'scripts/execution-gateway-server.mjs',
    'scripts/work-network-lib.mjs',
    'render.yaml',
    'schemas/execution-gateway/local-api.openapi.json',
    'schemas/execution-gateway/request.schema.json',
    'schemas/execution-gateway/response.schema.json',
    'schemas/execution-gateway/outcome_record.schema.json',
    'schemas/execution-gateway/executor_registry_entry.schema.json',
    'data/execution-gateway/registry.json',
    'fixtures/execution-gateway/sample-request.json',
    'fixtures/execution-gateway/adversarial-fixtures.json',
    'fixtures/execution-gateway/proof-tasks.json',
    'fixtures/execution-gateway/generated-proof-tasks.json',
    'sdk/execution-gateway/js/index.mjs',
    'sdk/execution-gateway/js/README.md',
    'sdk/execution-gateway/python/bean_execution_gateway_client.py',
    'sdk/execution-gateway/python/README.md',
    'AGENTS.md',
    'LICENSE',
    'PRIVACY.md',
    'SECURITY.md',
    'capability-manifest.json',
    'llms.txt',
    'llms-full.txt',
    'docs/product-definition.md',
    'docs/poc-truth.md',
    'docs/api-examples.md',
    'docs/safety-and-trust.md',
    'docs/v1-readiness.md',
    'docs/pre-discovery-readiness.md',
    'docs/evidence.md',
    'adapters/execution-gateway/mcp-adapter.stub.md',
    'adapters/execution-gateway/github-app-adapter.stub.md',
    'adapters/execution-gateway/slack-app-adapter.stub.md',
    'adapters/execution-gateway/workflow-platform-adapter.stub.md',
    'assets/execution-gateway-demo/index.html',
    'examples/execution-gateway/public-issue-request.json',
    'examples/execution-gateway/blocked-paid-public-write-request.json',
    'examples/execution-gateway/private-input-rejected-request.json',
    'examples/execution-gateway/outcome-record.json',
    'examples/execution-gateway/route-allowed-response.example.json',
    'examples/execution-gateway/route-denied-response.example.json',
    'examples/execution-gateway/hosted-private-rejection-response.example.json',
    'examples/execution-gateway/ledger-summary.example.json',
  ];
  const manifestFiles = [];
  for (const relative of files) {
    const source = path.join(rootDir, relative);
    const target = path.join(outDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    manifestFiles.push(target);
  }
  const packageJsonPath = path.join(outDir, 'package.json');
  fs.writeFileSync(packageJsonPath, `${JSON.stringify({
    name: 'bean-execution-gateway-poc',
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '>=20' },
    scripts: {
      start: 'npm run gateway:server:hosted-demo',
      'gateway:demo': 'npm run gateway:server:hosted-demo',
      'gateway:server:hosted-demo': 'BEAN_GATEWAY_HOSTED_DEMO=1 node scripts/execution-gateway-server.mjs --host 0.0.0.0 --port ${PORT:-8787}',
      'gateway:smoke:hosted': 'node scripts/execution-gateway.mjs hosted-smoke --base-url ${BEAN_GATEWAY_BASE_URL:-http://127.0.0.1:8787}',
      'gateway:verify': 'node scripts/execution-gateway.mjs verify --out dist/execution-gateway/verification',
    },
  }, null, 2)}\n`);
  manifestFiles.push(packageJsonPath);

  const gitignorePath = path.join(outDir, '.gitignore');
  fs.writeFileSync(gitignorePath, `node_modules/
dist/
.env
.env.*
*.log
.DS_Store
`);
  manifestFiles.push(gitignorePath);

  const packagedRenderYamlPath = path.join(outDir, 'render.yaml');
  fs.writeFileSync(packagedRenderYamlPath, `services:
  - type: web
    name: bean-execution-gateway-poc
    runtime: node
    plan: free
    buildCommand: npm run gateway:verify
    startCommand: npm run gateway:server:hosted-demo
    envVars:
      - key: BEAN_GATEWAY_HOSTED_DEMO
        value: "1"
      - key: NODE_ENV
        value: production
`);

  const readmePath = path.join(outDir, 'README.md');
  fs.writeFileSync(readmePath, `# Bean Execution Gateway

Generated: ${generatedAt}

Bean Execution Gateway is a public POC for routing outcome requests through policy, cost, safety, and verifier gates before an agent chooses an execution path.

Run locally:

\`\`\`bash
npm run gateway:verify
npm run gateway:demo
\`\`\`

If 8787 is already in use:

\`\`\`bash
PORT=8791 npm run gateway:demo
BEAN_GATEWAY_BASE_URL=http://127.0.0.1:8791 npm run gateway:smoke:hosted
\`\`\`

Render POC constraints:

- Use the Free instance type only.
- Do not add a payment method.
- Do not add secrets or private environment variables.
- Do not connect private repositories or work/org accounts.
- Stop if the platform asks for a paid plan, payment method, private data, private repo access, or broader account permissions.
`);
  manifestFiles.push(readmePath);
  return buildArtifactManifest({ outDir, files: manifestFiles, generatedAt, relativePaths: true });
}

export function buildProgressReport({ completedIds, blockedIds = [], outPath }) {
  const completed = new Set(completedIds);
  const blocked = new Set(blockedIds);
  const items = gatewayGoalChecklist.map(([id, title]) => ({
    id,
    title,
    status: completed.has(id) ? 'completed' : blocked.has(id) ? 'blocked_requires_approval' : 'partial_or_pending',
  }));
  const report = {
    generated_at: new Date().toISOString(),
    completed: items.filter((item) => item.status === 'completed').length,
    blocked_requires_approval: items.filter((item) => item.status === 'blocked_requires_approval').length,
    partial_or_pending: items.filter((item) => item.status === 'partial_or_pending').length,
    items,
  };
  if (outPath) writeJson(outPath, report);
  return report;
}
