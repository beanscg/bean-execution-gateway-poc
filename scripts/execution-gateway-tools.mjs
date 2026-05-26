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
  const dispatchPath = {
    post: {
      operationId: 'createExecutionDispatchV0',
      summary: 'Prove external dispatch is disabled in V0',
      description: 'Always returns 403 in V0. Dispatch, supplier calls, paid APIs, account mutation, and public writes are intentionally unavailable.',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ExecutionDispatchRequestV0' },
          },
        },
      },
      responses: {
        403: {
          description: 'Dispatch is disabled in V0',
          content: {
            'application/json': {
              examples: {
                disabled: {
                  value: {
                    api_version: 'v0',
                    ok: false,
                    error: 'dispatch_disabled_in_v0',
                    spend_usd: 0,
                    external_writes: 0,
                    external_executions: 0,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const healthPath = {
    get: {
      operationId: 'getHealthV0',
      summary: 'Health and safety mode check',
      responses: { 200: { description: 'OK' } },
    },
  };
  const readyPath = {
    get: {
      operationId: 'getReadinessV0',
      summary: 'Readiness and production gate status',
      description: 'Reports public-demo readiness separately from customer/live-execution readiness.',
      responses: { 200: { description: 'Readiness status' } },
    },
  };
  const metricsPath = {
    get: {
      operationId: 'getMetricsV0',
      summary: 'Metadata-only runtime metrics',
      description: 'Reports counters only. Does not expose request bodies.',
      responses: { 200: { description: 'Metadata-only metrics' } },
    },
  };
  const openApiPath = {
    get: {
      operationId: 'getOpenApiV0',
      summary: 'OpenAPI document',
      responses: { 200: { description: 'OpenAPI JSON' } },
    },
  };
  const openDemandHealthPath = {
    get: {
      operationId: 'getOpenDemandHealthV0',
      summary: 'Open-demand prototype health',
      description: 'Reports the public open-demand guardrails. No external writes or spend.',
      responses: { 200: { description: 'Open-demand health' } },
    },
  };
  const examplesPath = {
    get: {
      operationId: 'getGatewayExamplesV0',
      summary: 'Get proof examples and hero metric definitions',
      description: 'Returns public demo examples. Examples are safe public or synthetic requests only.',
      responses: { 200: { description: 'Proof examples and hero metric definitions' } },
    },
  };
  const openDemandLatestPath = {
    get: {
      operationId: 'getOpenDemandLatestV0',
      summary: 'Latest open-demand scan',
      description: 'Returns the latest in-memory open-demand scan, or fixture data if no scan has run.',
      responses: { 200: { description: 'Latest open-demand scan' } },
    },
  };
  const openDemandScanPath = {
    post: {
      operationId: 'postOpenDemandScanV0',
      summary: 'Scan public demand',
      description: 'Scans fixture data, public benchmark/research/bounty fixtures, or read-only public GitHub issues and appends negative controls.',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                source_mode: {
                  type: 'string',
                  enum: ['fixture', 'auto', 'live-github', 'public-benchmark', 'public-bounty', 'public-research', 'non-code-fixture', 'github-discussions'],
                },
                limit: { type: 'integer', minimum: 1, maximum: 50 },
                query: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: { 200: { description: 'Ranked open-demand opportunities' } },
    },
  };
  const pathPath = {
    post: {
      operationId: 'postAgentPathDecisionV0',
      summary: 'Turn an outcome into the best current agent path',
      description: 'Returns owned-agent, public-path, or build-decision routing with quality, speed, cost, risk, proofability, compute-location options, and explicit stop conditions. It performs no external writes, spend, supplier calls, or public submissions.',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AgentPathRequestV0' },
            examples: {
              publicOutcome: {
                value: {
                  outcome: {
                    goal: 'Find the safest way to solve a public issue without paying for compute yet.',
                    task_type: 'agent_task_triage',
                    desired_artifact: 'agent_path_packet',
                  },
                  source_mode: 'fixture',
                  policy: { mode: 'free_only' },
                },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Agent path decision' } },
    },
  };
  const openDemandBundlePath = {
    post: {
      operationId: 'postOpenDemandBundleV0',
      summary: 'Build local task packet',
      description: 'Builds an in-memory task packet. External submission remains disabled.',
      responses: { 201: { description: 'Task bundle' } },
    },
  };
  const openDemandRunPath = {
    post: {
      operationId: 'postOpenDemandRunV0',
      summary: 'Run local verifier',
      description: 'Runs the static prototype verifier and returns an evidence packet.',
      responses: { 201: { description: 'Solver run and evidence packet' } },
    },
  };
  const openDemandReportPath = {
    get: {
      operationId: 'getOpenDemandReportV0',
      summary: 'Get evidence packet',
      responses: { 200: { description: 'Evidence packet' } },
    },
  };
  const openDemandLearningPath = {
    get: {
      operationId: 'getOpenDemandLearningV0',
      summary: 'Summarize public-only learning records',
      description: 'Returns metadata-only learning counters. Hosted demo keeps these in memory and does not persist request bodies.',
      responses: { 200: { description: 'Public-only learning summary' } },
    },
  };
  const v1HealthPath = {
    get: {
      operationId: 'getV1ControlPlaneHealth',
      summary: 'V1 control-plane contract health',
      description: 'Reports local public-demo contract health. No production secrets, private data, payment rail, or supplier execution is enabled.',
      responses: { 200: { description: 'V1 contract health' } },
    },
  };
  const v1GoalsPath = {
    get: {
      operationId: 'getV1Goals',
      summary: 'Get the 80-goal V1 local-contract checklist',
      responses: { 200: { description: '80 local-contract goals and production blockers' } },
    },
  };
  const v1ReadinessPath = {
    get: {
      operationId: 'getV1Readiness',
      summary: 'Get V1 public-demo and production readiness',
      responses: { 200: { description: 'V1 readiness report' } },
    },
  };
  const v1TenantPath = {
    post: {
      operationId: 'createV1TenantContract',
      summary: 'Create a metadata-only tenant contract',
      description: 'Creates an in-memory demo tenant contract. It never stores API keys and never enables private data or spend.',
      responses: { 201: { description: 'Tenant contract' } },
    },
  };
  const v1ContextEnvelopePath = {
    post: {
      operationId: 'createV1ContextEnvelope',
      summary: 'Create a public-only context envelope',
      description: 'Stores hashes and metadata only. Private, local, internal, or secret-like inputs are rejected by hosted-demo input screening or marked blocked.',
      responses: { 201: { description: 'Context envelope' } },
    },
  };
  const v1SupplierBidPath = {
    post: {
      operationId: 'submitV1SupplierBid',
      summary: 'Evaluate a supplier bid without dispatch',
      description: 'Scores quality, speed, cost, and risk. External suppliers, nonzero prices, non-public data, and unsupported compute remain not selectable.',
      responses: { 201: { description: 'Supplier bid evaluation' } },
    },
  };
  const v1AcceptancePath = {
    post: {
      operationId: 'recordV1Acceptance',
      summary: 'Record outcome acceptance metadata',
      description: 'Records acceptance state only. Nonzero payable amounts are blocked because no payment rail is connected.',
      responses: { 201: { description: 'Acceptance record' } },
    },
  };
  const v1PaymentQuotePath = {
    post: {
      operationId: 'quoteV1Payment',
      summary: 'Quote payment status without moving money',
      description: 'Always returns zero chargeable/payable amount in V0. Nonzero requested payments are blocked.',
      responses: { 201: { description: 'Payment quote' } },
    },
  };
  const v1AbuseCasePath = {
    post: {
      operationId: 'createV1AbuseCase',
      summary: 'Queue a metadata-only abuse case',
      responses: { 201: { description: 'Abuse case' } },
    },
  };
  const v1AuditPath = {
    get: {
      operationId: 'getV1AuditSummary',
      summary: 'Summarize metadata-only audit events',
      responses: { 200: { description: 'Audit summary' } },
    },
  };
  const v1ReplayPath = {
    get: {
      operationId: 'getV1ReplayMetrics',
      summary: 'Summarize V1 replay and learning metrics',
      responses: { 200: { description: 'Replay metrics' } },
    },
  };
  const feedbackPath = {
    post: {
      operationId: 'postFeedbackV0',
      summary: 'Record metadata-only route usefulness feedback',
      description: 'Accepts enumerated feedback only. Free text, emails, private context, secrets, and request bodies are not stored.',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/GatewayFeedbackV0' },
            examples: {
              usefulPath: {
                value: {
                  target_type: 'open_demand_opportunity',
                  target_id: 'fixture_oss_docs_test_01',
                  helpful: true,
                  route_useful: true,
                  would_have_built_manually: false,
                  saved_time_estimate_minutes: 12,
                  reason_code: 'routed_to_useful_path',
                },
              },
            },
          },
        },
      },
      responses: { 201: { description: 'Feedback accepted' } },
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
      dispatch_enabled: false,
      security_headers_enabled: true,
      rate_limiting_enabled: true,
      customer_traffic_ready: false,
    },
    paths: {
      '/v0/health': healthPath,
      '/v0/ready': readyPath,
      '/v0/metrics': metricsPath,
      '/v0/route': routePath,
      '/v0/path': pathPath,
      '/v0/dispatch': dispatchPath,
      '/v0/outcomes': outcomePath,
      '/v0/ledger/summary': ledgerPath,
      '/v0/openapi.json': openApiPath,
      '/v0/examples': examplesPath,
      '/v0/feedback': feedbackPath,
      '/v0/open-demand/health': openDemandHealthPath,
      '/v0/open-demand/examples': examplesPath,
      '/v0/open-demand/learning': openDemandLearningPath,
      '/v0/open-demand/latest': openDemandLatestPath,
      '/v0/open-demand/opportunities': openDemandLatestPath,
      '/v0/open-demand/path': pathPath,
      '/v0/open-demand/scan': openDemandScanPath,
      '/v0/open-demand/opportunities/{opportunity_id}/bundle': openDemandBundlePath,
      '/v0/open-demand/tasks/{task_id}/run': openDemandRunPath,
      '/v0/open-demand/tasks/{task_id}/report': openDemandReportPath,
      '/v0/open-demand/feedback': feedbackPath,
      '/v0/v1/health': v1HealthPath,
      '/v0/v1/goals': v1GoalsPath,
      '/v0/v1/readiness': v1ReadinessPath,
      '/v0/v1/tenants': v1TenantPath,
      '/v0/v1/context/envelopes': v1ContextEnvelopePath,
      '/v0/v1/supplier-bids': v1SupplierBidPath,
      '/v0/v1/acceptance': v1AcceptancePath,
      '/v0/v1/payment-quotes': v1PaymentQuotePath,
      '/v0/v1/abuse/cases': v1AbuseCasePath,
      '/v0/v1/audit': v1AuditPath,
      '/v0/v1/replay': v1ReplayPath,
      '/health': healthPath,
      '/ready': readyPath,
      '/metrics': metricsPath,
      '/route': routePath,
      '/path': pathPath,
      '/dispatch': dispatchPath,
      '/outcomes': outcomePath,
      '/ledger/summary': ledgerPath,
      '/openapi.json': openApiPath,
      '/examples': examplesPath,
      '/feedback': feedbackPath,
      '/open-demand/health': openDemandHealthPath,
      '/open-demand/examples': examplesPath,
      '/open-demand/learning': openDemandLearningPath,
      '/open-demand/latest': openDemandLatestPath,
      '/open-demand/opportunities': openDemandLatestPath,
      '/open-demand/path': pathPath,
      '/open-demand/scan': openDemandScanPath,
      '/open-demand/opportunities/{opportunity_id}/bundle': openDemandBundlePath,
      '/open-demand/tasks/{task_id}/run': openDemandRunPath,
      '/open-demand/tasks/{task_id}/report': openDemandReportPath,
      '/open-demand/feedback': feedbackPath,
      '/v1/health': v1HealthPath,
      '/v1/goals': v1GoalsPath,
      '/v1/readiness': v1ReadinessPath,
      '/v1/tenants': v1TenantPath,
      '/v1/context/envelopes': v1ContextEnvelopePath,
      '/v1/supplier-bids': v1SupplierBidPath,
      '/v1/acceptance': v1AcceptancePath,
      '/v1/payment-quotes': v1PaymentQuotePath,
      '/v1/abuse/cases': v1AbuseCasePath,
      '/v1/audit': v1AuditPath,
      '/v1/replay': v1ReplayPath,
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
        ExecutionDispatchRequestV0: {
          type: 'object',
          properties: {
            route_run_id: { type: 'string' },
            request_id: { type: 'string' },
            desired_outcome: { type: 'object' },
            max_budget_usd: { type: 'number', const: 0 },
          },
          additionalProperties: true,
        },
        SupplierBidV0: {
          type: 'object',
          required: ['supplier_id', 'price_usd', 'estimated_latency_seconds', 'compute_location', 'quality_evidence'],
          properties: {
            supplier_id: { type: 'string' },
            price_usd: { type: 'number', minimum: 0 },
            estimated_latency_seconds: { type: 'integer', minimum: 0 },
            compute_location: { type: 'string', enum: ['requester_hosted', 'supplier_hosted', 'gateway_hosted', 'unknown'] },
            model_or_tool_claims: { type: 'array', items: { type: 'string' } },
            quality_evidence: { type: 'array', items: { type: 'string' } },
            acceptance_terms: { type: 'object' },
          },
          additionalProperties: false,
        },
        OutcomeAcceptanceV0: {
          type: 'object',
          required: ['outcome_id', 'acceptance_state'],
          properties: {
            outcome_id: { type: 'string' },
            acceptance_state: { type: 'string', enum: ['accepted', 'rejected', 'needs_rework', 'disputed'] },
            verifier_result: { type: 'string' },
            rejection_reasons: { type: 'array', items: { type: 'string' } },
            rework_requested: { type: 'array', items: { type: 'string' } },
            payable_usd: { type: 'number', minimum: 0 },
          },
          additionalProperties: false,
        },
        GatewayFeedbackV0: {
          type: 'object',
          properties: {
            target_type: {
              type: 'string',
              enum: ['route', 'open_demand_scan', 'open_demand_opportunity', 'open_demand_task', 'open_demand_report', 'open_demand_route'],
            },
            target_id: { type: 'string' },
            helpful: { type: 'boolean' },
            route_useful: { type: 'boolean' },
            would_have_built_manually: { type: 'boolean' },
            saved_time_estimate_minutes: { type: 'number', minimum: 0, maximum: 240 },
            reason_code: {
              type: 'string',
              enum: ['routed_to_useful_path', 'blocked_correctly', 'bad_routing', 'unclear_value', 'missing_supplier', 'too_slow'],
            },
          },
          additionalProperties: false,
        },
        AgentPathRequestV0: {
          type: 'object',
          properties: {
            outcome: {
              type: 'object',
              properties: {
                goal: { type: 'string' },
                task_type: { type: 'string' },
                desired_artifact: { type: 'string' },
                success_criteria: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: true,
            },
            goal: { type: 'string' },
            task_type: { type: 'string' },
            desired_artifact: { type: 'string' },
            context_refs: { type: 'array', items: { type: 'string' } },
            source_mode: {
              type: 'string',
              enum: ['fixture', 'auto', 'live-github', 'public-benchmark', 'public-bounty', 'public-research', 'non-code-fixture', 'github-discussions'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
            query: { type: 'string' },
            policy: { type: 'object' },
          },
          additionalProperties: false,
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
    hosted_demo_request_body_persistence: false,
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
    'scripts/open-demand-lib.mjs',
    'scripts/open-demand-proof-runner.mjs',
    'scripts/v1-control-plane-lib.mjs',
    'scripts/work-network-lib.mjs',
    'render.yaml',
    'schemas/execution-gateway/local-api.openapi.json',
    'schemas/execution-gateway/request.schema.json',
    'schemas/execution-gateway/response.schema.json',
    'schemas/execution-gateway/outcome_record.schema.json',
    'schemas/execution-gateway/executor_registry_entry.schema.json',
    'schemas/execution-gateway/dispatch_request.schema.json',
    'schemas/execution-gateway/supplier_bid.schema.json',
    'schemas/execution-gateway/outcome_acceptance.schema.json',
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
    'TERMS.md',
    'capability-manifest.json',
    'llms.txt',
    'llms-full.txt',
    'docs/product-definition.md',
    'docs/poc-truth.md',
    'docs/api-examples.md',
    'docs/safety-and-trust.md',
    'docs/v1-readiness.md',
    'docs/pre-discovery-readiness.md',
    'docs/public-launch-packet.md',
    'docs/live-traffic-readiness.md',
    'docs/production-cutover.md',
    'docs/abuse-and-rate-limit-policy.md',
    'docs/evidence.md',
    'docs/public-proof-runner.md',
    'docs/open-demand-adapters.md',
    'docs/path-api-and-scoring.md',
    'docs/v1-product-goals.md',
    'docs/v1-local-contract-completion.md',
    'adapters/execution-gateway/mcp-adapter.stub.md',
    'adapters/execution-gateway/github-app-adapter.stub.md',
    'adapters/execution-gateway/slack-app-adapter.stub.md',
    'adapters/execution-gateway/workflow-platform-adapter.stub.md',
    'assets/execution-gateway-demo/index.html',
    'examples/execution-gateway/public-issue-request.json',
    'examples/execution-gateway/blocked-paid-public-write-request.json',
    'examples/execution-gateway/private-input-rejected-request.json',
    'examples/execution-gateway/open-demand-scan-request.json',
    'examples/execution-gateway/open-demand-path-request.json',
    'examples/execution-gateway/open-demand-public-bounty-scan-request.json',
    'examples/execution-gateway/open-demand-public-research-scan-request.json',
    'examples/execution-gateway/open-demand-feedback-request.json',
    'examples/execution-gateway/v1-tenant-request.json',
    'examples/execution-gateway/v1-context-envelope-request.json',
    'examples/execution-gateway/v1-supplier-bid-request.json',
    'examples/execution-gateway/v1-payment-quote-request.json',
    'examples/execution-gateway/v1-abuse-case-request.json',
    'examples/execution-gateway/agent-path-build-vs-use-request.json',
    'examples/execution-gateway/non-code-public-benchmark-request.json',
    'examples/execution-gateway/outcome-record.json',
    'examples/execution-gateway/route-allowed-response.example.json',
    'examples/execution-gateway/route-denied-response.example.json',
    'examples/execution-gateway/hosted-private-rejection-response.example.json',
    'examples/execution-gateway/ledger-summary.example.json',
    'examples/execution-gateway/dispatch-disabled-response.example.json',
    'examples/execution-gateway/readiness-response.example.json',
    'examples/execution-gateway/metrics-response.example.json',
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
      - key: BEAN_GATEWAY_RATE_LIMIT_PER_MINUTE
        value: "60"
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
- /v0/ready reports public-demo readiness only; production/customer traffic stays blocked.
- /v0/dispatch is intentionally disabled in V0.
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
