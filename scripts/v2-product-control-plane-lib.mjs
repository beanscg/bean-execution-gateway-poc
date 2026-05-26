import fs from 'node:fs';
import path from 'node:path';

import {
  stableHash,
  stableId,
} from './work-network-lib.mjs';

const PRODUCT_BLOCKERS = [
  'no_durable_hosted_learning_store',
  'no_real_tenant_auth_secret',
  'no_private_context_vault',
  'no_external_supplier_execution',
  'no_payment_rail_connected',
  'no_customer_data_processing',
  'no_legal_marketplace_approval',
  'no_production_observability_or_oncall',
];

const PRODUCT_DOMAINS = [
  {
    id: 'public_learning_loop',
    label: 'Public Learning Loop',
    goals: [
      'Durable metadata-only event store',
      'Opt-in feedback capture',
      'No raw prompt/private data retention',
      'Replayable learning records',
      'Public traffic metrics dashboard',
      'Abuse/spam filtering for public inputs',
      'Exportable training/eval corpus',
      'Route usefulness calibration',
      'Blocked-action learning signals',
      'Human-review sampling contract',
    ],
  },
  {
    id: 'demand_intake',
    label: 'Demand Intake',
    goals: [
      'Outcome-prompt API',
      'Public demo UI',
      'Agent-consumable API docs',
      'SDK/client examples',
      'Public benchmark/task adapters',
      'GitHub issue/discussion adapters',
      'Non-code public task adapters',
      'Webhook/API intake contract',
      'Task classification',
      'Build-vs-buy-vs-route decision model',
    ],
  },
  {
    id: 'routing_engine',
    label: 'Routing Engine',
    goals: [
      'Supplier/path registry',
      'Internal agent registry',
      'Public/open-source path registry',
      'Build decision scoring',
      'Cost/speed/quality/risk scoring',
      'Confidence thresholds',
      'Fallback route selection',
      'No-route-found response contract',
      'Explainability for every routing decision',
      'Versioned scoring policy',
    ],
  },
  {
    id: 'supply_layer',
    label: 'Supply Layer',
    goals: [
      'Owned BEAN agents',
      'Public agent/tool catalog',
      'Human/supplier onboarding contract',
      'Supplier identity model',
      'Supplier capability claims',
      'Supplier quality evidence',
      'Supplier pricing model',
      'Supplier compute-location declaration',
      'Supplier availability/latency reporting',
      'Supplier suspension/blocklist controls',
    ],
  },
  {
    id: 'execution_boundary',
    label: 'Execution Boundary',
    goals: [
      'Dry-run route mode',
      'Local proof-packet mode',
      'Human-approved execution mode',
      'External supplier execution mode',
      'Dispatch audit trail',
      'Idempotency keys',
      'Retry policy',
      'Cancellation model',
      'Timeout model',
      'Result verification before acceptance',
    ],
  },
  {
    id: 'acceptance_and_payment',
    label: 'Acceptance And Payment',
    goals: [
      'Outcome acceptance API',
      'Verifier result API',
      'Rework/rejection state',
      'Dispute state',
      'Micro-pricing quote model',
      'Usage-cost accounting',
      'Budget controls',
      'Payment rail integration',
      'Supplier payout ledger',
      'Refund/chargeback policy',
    ],
  },
  {
    id: 'trust_and_safety',
    label: 'Trust And Safety',
    goals: [
      'Tenant auth',
      'Scoped API keys',
      'Rate limits per tenant',
      'Public/private data classifier',
      'Private context vault',
      'Encryption and retention policy',
      'Request redaction',
      'Abuse queue',
      'Security headers/WAF posture',
      'Vulnerability disclosure path',
    ],
  },
  {
    id: 'product_surface',
    label: 'Product Surface',
    goals: [
      'Landing/demo page',
      'API playground',
      'Submit outcome flow',
      'Route explanation view',
      'Supplier/path comparison view',
      'Feedback controls',
      'Public metrics page',
      'Docs optimized for agents and developers',
      'Clear production-boundary messaging',
      'Discovery polish for GitHub, AEO, and LLM indexing',
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    goals: [
      'Production hosting',
      'Durable DB',
      'Backups',
      'Monitoring',
      'Error alerts',
      'Cost alerts',
      'Incident runbook',
      'Admin console',
      'Manual kill switch',
      'Deploy/rollback process',
    ],
  },
  {
    id: 'quality_system',
    label: 'Quality System',
    goals: [
      'Golden task set',
      'Public traffic replay evals',
      'Supplier benchmark evals',
      'Route-choice regression tests',
      'Cost/speed/quality calibration',
      'Bad-route review loop',
      'Accepted-outcome training loop',
      'Local model assist loop',
      'Human review sampling',
      'Public proof reports',
    ],
  },
  {
    id: 'legal_and_commercial',
    label: 'Legal And Commercial',
    goals: [
      'Terms of service',
      'Privacy policy',
      'Data processing stance',
      'Supplier terms',
      'Payment terms',
      'Marketplace liability policy',
      'Rejected-work policy',
      'IP ownership policy',
      'Tax/KYC/payout requirements',
      'Platform ToS review for each demand/supply source',
    ],
  },
  {
    id: 'go_to_market',
    label: 'Go-To-Market',
    goals: [
      'Narrow first user definition',
      'Demo narrative',
      'Public examples',
      'GitHub repo polish',
      'Docs for agents looking for execution paths',
      'X/Reddit/GitHub launch copy',
      'Partner outreach list',
      'Feedback collection plan',
      'First beta cohort',
      'Conversion path from public demo to authenticated beta',
    ],
  },
];

const BLOCKED_PRODUCTION_DOMAINS = new Set([
  'supply_layer',
  'execution_boundary',
  'acceptance_and_payment',
  'trust_and_safety',
  'operations',
  'legal_and_commercial',
]);

const PRODUCT_GOALS = PRODUCT_DOMAINS.flatMap((domain, domainIndex) => domain.goals.map((goal, offset) => {
  const number = domainIndex * 10 + offset + 1;
  const productionBlocked = BLOCKED_PRODUCTION_DOMAINS.has(domain.id);
  return {
    id: `P${String(number).padStart(3, '0')}`,
    domain: domain.id,
    domain_label: domain.label,
    description: goal,
    contract_status: 'complete_public_contract',
    production_status: productionBlocked ? 'blocked_until_real_world_gate' : 'public_demo_contract_ready',
  };
}));

const FORBIDDEN_FREE_TEXT_KEYS = new Set([
  'comment',
  'notes',
  'free_text',
  'raw_prompt',
  'prompt',
  'message',
  'description',
  'email',
]);

const allowedFeedbackReasons = new Set([
  'routed_to_useful_path',
  'bad_route',
  'too_slow',
  'too_expensive',
  'blocked_correctly',
  'unsafe_or_private_blocked',
  'missing_supplier',
  'would_build_manually',
  'other_metadata_only',
]);

const allowedTaskTypes = new Set([
  'issue_triage',
  'pr_review',
  'patch_plan',
  'repo_readiness_audit',
  'agent_task_triage',
  'verifier_plan',
  'artifact_packaging',
  'marketplace_evaluation',
  'public_research',
  'public_benchmark',
  'non_code_task',
  'unsupported',
  'unsafe_request',
]);

const secretLikePattern = /\b(?:api[_-]?key|token|secret|password|private\s+key|customer\s+data|private\s+repo|internal\s+repo|work\s+data|company\s+data)\b|(?:private|internal|file|localhost):\/\/|\/Users\/|\/private\/|~\//i;

class ProductControlPlaneError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ProductControlPlaneError';
    this.statusCode = statusCode;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function safeEnum(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function safeText(value, fallback = 'unknown', limit = 160) {
  return String(value || fallback).replace(/[^A-Za-z0-9_.:@/-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, limit) || fallback;
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function summarizeRecords(records, field) {
  return records.reduce((acc, record) => {
    const key = record[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function hasForbiddenFreeText(input = {}) {
  return Object.keys(input).filter((key) => FORBIDDEN_FREE_TEXT_KEYS.has(key));
}

function privateSignal(input = {}) {
  return secretLikePattern.test(JSON.stringify(input || {}));
}

function metadataEvent(kind, payload = {}) {
  return {
    schema_version: 'bean.v2.product_event.v1',
    event_id: stableId('prod_evt', { kind, payload, at: Date.now() }),
    kind,
    created_at: nowIso(),
    payload_hash: stableHash(payload).slice(0, 16),
    request_body_stored: false,
    raw_prompt_stored: false,
    metadata: payload,
  };
}

function classifyOutcome(input = {}) {
  const outcome = input.outcome && typeof input.outcome === 'object' ? input.outcome : {};
  const requestedTaskType = safeEnum(outcome.task_type, allowedTaskTypes, 'agent_task_triage');
  const text = JSON.stringify({ outcome, context_refs: input.context_refs || [] });
  if (privateSignal({ outcome, context_refs: input.context_refs || [] })) {
    return {
      task_type: requestedTaskType,
      sensitivity: 'blocked_private_or_secret_like',
      policy_state: 'blocked',
      blocked_reasons: ['private_or_secret_like_input'],
    };
  }
  if (/\b(?:pay|paid|purchase|subscribe|post|submit|comment|claim|apply)\b/i.test(text)) {
    return {
      task_type: requestedTaskType,
      sensitivity: 'public_or_synthetic',
      policy_state: 'approval_required',
      blocked_reasons: ['potential_external_write_or_spend_requires_operator'],
    };
  }
  return {
    task_type: requestedTaskType,
    sensitivity: 'public_or_synthetic',
    policy_state: 'allowed',
    blocked_reasons: [],
  };
}

function routeCandidates(classification) {
  const base = [
    {
      path_id: 'owned_agent_local_proof',
      supplier_class: 'owned_agent',
      selectable_now: classification.policy_state !== 'blocked',
      compute_location: 'gateway_hosted_or_requester_hosted',
      price_usd: 0,
      quality_score: 74,
      speed_score: 82,
      cost_score: 100,
      risk_score: classification.policy_state === 'allowed' ? 92 : 58,
      reason: 'Owned path can produce a local proof packet without spend or external writes.',
    },
    {
      path_id: 'public_open_source_path',
      supplier_class: 'public_path',
      selectable_now: classification.policy_state !== 'blocked',
      compute_location: 'requester_hosted',
      price_usd: 0,
      quality_score: 68,
      speed_score: 70,
      cost_score: 100,
      risk_score: classification.policy_state === 'allowed' ? 88 : 55,
      reason: 'Public path can be inspected and replayed without private context.',
    },
    {
      path_id: 'build_new_agent_decision',
      supplier_class: 'build_decision',
      selectable_now: classification.policy_state !== 'blocked',
      compute_location: 'requester_hosted',
      price_usd: 0,
      quality_score: 61,
      speed_score: 40,
      cost_score: 100,
      risk_score: 78,
      reason: 'Build path is useful when no available agent or public path is good enough.',
    },
    {
      path_id: 'external_supplier_future',
      supplier_class: 'external_supplier',
      selectable_now: false,
      compute_location: 'supplier_hosted',
      price_usd: null,
      quality_score: null,
      speed_score: null,
      cost_score: null,
      risk_score: 20,
      reason: 'External supplier execution remains blocked until identity, payment, dispute, and legal gates exist.',
    },
  ];
  return base.map((candidate) => ({
    ...candidate,
    total_score: candidate.quality_score == null
      ? null
      : Math.round((candidate.quality_score * 0.35) + (candidate.speed_score * 0.2) + (candidate.cost_score * 0.25) + (candidate.risk_score * 0.2)),
  }));
}

function chooseCandidate(candidates) {
  return candidates
    .filter((candidate) => candidate.selectable_now)
    .sort((left, right) => (right.total_score || 0) - (left.total_score || 0))[0] || null;
}

function createProductControlPlane({ memoryOnly = true, eventLogPath } = {}) {
  const state = {
    demand_intake: [],
    route_decisions: [],
    supply_bids: [],
    execution_plans: [],
    acceptances: [],
    feedback: [],
    trust_reviews: [],
    events: [],
  };
  const resolvedEventLogPath = eventLogPath || path.join(process.cwd(), 'dist', 'execution-gateway', 'v2-product-events.jsonl');

  function record(kind, payload = {}) {
    const event = metadataEvent(kind, payload);
    state.events.push(event);
    if (!memoryOnly) appendJsonl(resolvedEventLogPath, event);
    return event;
  }

  function goals() {
    return {
      schema_version: 'bean.v2.product_goal_progress.v1',
      total_goals: PRODUCT_GOALS.length,
      completed_contract_goals: PRODUCT_GOALS.filter((goal) => goal.contract_status === 'complete_public_contract').length,
      production_ready_goals: PRODUCT_GOALS.filter((goal) => goal.production_status === 'public_demo_contract_ready').length,
      domains: PRODUCT_DOMAINS.map((domain) => ({
        domain: domain.id,
        label: domain.label,
        goals: PRODUCT_GOALS.filter((goal) => goal.domain === domain.id).length,
        contract_status: 'complete_public_contract',
        production_status: BLOCKED_PRODUCTION_DOMAINS.has(domain.id) ? 'blocked_until_real_world_gate' : 'public_demo_contract_ready',
      })),
      goals: PRODUCT_GOALS,
      blocked_production_gates: PRODUCT_BLOCKERS,
    };
  }

  function readiness() {
    const goalSummary = goals();
    return {
      schema_version: 'bean.v2.product_readiness.v1',
      ok_for_public_learning_traffic: true,
      ok_for_private_customer_or_paid_traffic: false,
      completed_contract_goals: goalSummary.completed_contract_goals,
      total_goals: goalSummary.total_goals,
      production_ready_goals: goalSummary.production_ready_goals,
      live_learning_mode: memoryOnly ? 'hosted_memory_only' : 'local_metadata_jsonl',
      product_blockers: PRODUCT_BLOCKERS,
      guarantees: {
        request_body_stored: false,
        raw_prompt_stored: false,
        spend_usd: 0,
        external_writes: 0,
        external_supplier_execution: false,
        payment_transfer: false,
      },
      next_human_gates: [
        'choose a zero-spend durable public learning store or approve a paid production store',
        'approve public launch copy and distribution channels',
        'approve any real payment, supplier, private-context, or customer-data work before it is enabled',
      ],
    };
  }

  function submitOutcome(input = {}) {
    const classification = classifyOutcome(input);
    const demand = {
      schema_version: 'bean.v2.demand_intake.v1',
      demand_id: stableId('demand', { input_hash: stableHash(input), at: Date.now() }),
      task_type: classification.task_type,
      sensitivity: classification.sensitivity,
      policy_state: classification.policy_state,
      blocked_reasons: classification.blocked_reasons,
      context_ref_count: Array.isArray(input.context_refs) ? input.context_refs.length : 0,
      context_ref_hashes: Array.isArray(input.context_refs)
        ? input.context_refs.map((ref) => stableHash(String(ref)).slice(0, 16)).slice(0, 12)
        : [],
      raw_goal_stored: false,
      request_body_stored: false,
      created_at: nowIso(),
    };
    state.demand_intake.push(demand);
    record('demand_intake_created', { demand_id: demand.demand_id, task_type: demand.task_type, policy_state: demand.policy_state });

    const candidates = routeCandidates(classification);
    const selected = chooseCandidate(candidates);
    const decision = {
      schema_version: 'bean.v2.route_decision.v1',
      route_id: stableId('route', { demand_id: demand.demand_id, selected: selected?.path_id || 'none', at: Date.now() }),
      demand_id: demand.demand_id,
      policy_state: classification.policy_state,
      selected_path: selected,
      candidates,
      no_route_found: selected == null,
      explanation: selected
        ? `Selected ${selected.path_id} because it is currently executable without spend, private data, or external supplier dispatch.`
        : 'No path selected because the request was blocked before routing.',
      dispatch_performed: false,
      spend_usd: 0,
      external_writes: 0,
      external_supplier_execution: false,
      created_at: nowIso(),
    };
    state.route_decisions.push(decision);
    record('route_decision_created', { route_id: decision.route_id, demand_id: demand.demand_id, selected_path: selected?.path_id || null, policy_state: decision.policy_state });

    return {
      demand,
      decision,
      learning_signal: {
        replayable: true,
        raw_prompt_required_for_replay: false,
        training_record_kind: 'metadata_only_route_decision',
      },
    };
  }

  function submitSupplyBid(input = {}) {
    const price = Number(input.price_usd || 0);
    const supplierKind = input.supplier_kind || 'external_supplier';
    const bid = {
      schema_version: 'bean.v2.supply_bid.v1',
      bid_id: stableId('supply_bid', { input, at: Date.now() }),
      supplier_ref: safeText(input.supplier_ref || input.supplier_id, 'unknown-supplier'),
      supplier_kind: supplierKind,
      capability_hashes: Array.isArray(input.capability_claims) ? input.capability_claims.map((claim) => stableHash(String(claim)).slice(0, 16)).slice(0, 12) : [],
      quality_evidence_count: Array.isArray(input.quality_evidence) ? input.quality_evidence.length : 0,
      compute_location: input.compute_location || 'unknown',
      price_usd: price,
      selectable_now: supplierKind !== 'external_supplier' && price === 0 && input.data_boundary === 'public_only',
      blocked_reasons: [
        supplierKind === 'external_supplier' ? 'external_supplier_execution_disabled' : null,
        price > 0 ? 'payment_rail_not_connected' : null,
        input.data_boundary !== 'public_only' ? 'non_public_data_boundary_blocked' : null,
      ].filter(Boolean),
      created_at: nowIso(),
    };
    state.supply_bids.push(bid);
    record('supply_bid_recorded', { bid_id: bid.bid_id, supplier_kind: bid.supplier_kind, selectable_now: bid.selectable_now });
    return bid;
  }

  function createExecutionPlan(input = {}) {
    const plan = {
      schema_version: 'bean.v2.execution_plan.v1',
      execution_plan_id: stableId('exec_plan', { input, at: Date.now() }),
      route_id: input.route_id ? safeText(input.route_id, 'route', 120) : null,
      mode: input.mode === 'human_approved_execution' ? 'human_approved_execution_required' : 'dry_run_local_proof',
      idempotency_key: safeText(input.idempotency_key, 'generated-idempotency-key', 120),
      retry_policy: { max_attempts: 0, reason: 'public demo does not dispatch external work' },
      cancellation_supported: true,
      timeout_seconds: Math.min(Math.max(Number(input.timeout_seconds || 60), 1), 600),
      verifier_required_before_acceptance: true,
      dispatch_performed: false,
      spend_usd: 0,
      external_writes: 0,
      external_supplier_execution: false,
      created_at: nowIso(),
    };
    state.execution_plans.push(plan);
    record('execution_plan_created', { execution_plan_id: plan.execution_plan_id, mode: plan.mode });
    return plan;
  }

  function recordAcceptance(input = {}) {
    const requestedPayable = Number(input.payable_usd || input.requested_payable_usd || 0);
    const acceptance = {
      schema_version: 'bean.v2.acceptance_payment.v1',
      acceptance_id: stableId('product_acceptance', { input, at: Date.now() }),
      outcome_ref: safeText(input.outcome_ref || input.outcome_id, 'unknown-outcome'),
      verifier_result: input.verifier_result || 'not_provided',
      acceptance_state: input.acceptance_state || 'needs_review',
      requested_payable_usd: requestedPayable,
      payable_usd: 0,
      settlement_status: requestedPayable > 0 ? 'blocked_no_payment_rail' : 'zero_payable_recorded',
      dispute_state: input.acceptance_state === 'disputed' ? 'metadata_only_dispute_recorded' : 'none',
      refund_chargeback_policy_status: 'documented_contract_only',
      created_at: nowIso(),
    };
    state.acceptances.push(acceptance);
    record('acceptance_recorded', { acceptance_id: acceptance.acceptance_id, settlement_status: acceptance.settlement_status });
    return acceptance;
  }

  function recordFeedback(input = {}) {
    const forbidden = hasForbiddenFreeText(input);
    if (forbidden.length > 0) {
      throw new ProductControlPlaneError(`feedback_accepts_metadata_only:${forbidden.join(',')}`, 400);
    }
    const feedback = {
      schema_version: 'bean.v2.learning_feedback.v1',
      feedback_id: stableId('learning_feedback', { input, at: Date.now() }),
      target_type: safeText(input.target_type, 'route_decision', 80),
      target_id_hash: stableHash(input.target_id || 'unknown').slice(0, 16),
      helpful: Boolean(input.helpful),
      route_useful: Boolean(input.route_useful),
      reason_code: allowedFeedbackReasons.has(input.reason_code) ? input.reason_code : 'other_metadata_only',
      chosen_route: input.chosen_route ? safeText(input.chosen_route, 'route', 80) : null,
      latency_bucket: input.latency_bucket ? safeText(input.latency_bucket, 'unknown', 40) : null,
      blocked_reason: input.blocked_reason ? safeText(input.blocked_reason, 'none', 100) : null,
      free_text_stored: false,
      request_body_stored: false,
      created_at: nowIso(),
    };
    state.feedback.push(feedback);
    record('learning_feedback_recorded', { feedback_id: feedback.feedback_id, reason_code: feedback.reason_code, helpful: feedback.helpful });
    return {
      accepted: true,
      feedback,
      feedback_summary: {
        total: state.feedback.length,
        helpful: state.feedback.filter((item) => item.helpful).length,
        not_helpful: state.feedback.filter((item) => !item.helpful).length,
      },
    };
  }

  function trustReview(input = {}) {
    const review = {
      schema_version: 'bean.v2.trust_review.v1',
      trust_review_id: stableId('trust', { input, at: Date.now() }),
      sensitivity: privateSignal(input) ? 'blocked_private_or_secret_like' : 'public_or_synthetic',
      tenant_auth_status: 'contract_only_no_secret',
      scoped_api_keys_status: 'contract_only_no_secret',
      private_context_vault_status: 'blocked_not_connected',
      request_redaction_status: 'metadata_only_hashing',
      abuse_queue_status: 'metadata_only_memory_queue',
      vulnerability_disclosure_status: 'documented_in_security_md',
      allowed_for_public_learning: !privateSignal(input),
      allowed_for_private_customer_traffic: false,
    };
    state.trust_reviews.push(review);
    record('trust_review_created', { trust_review_id: review.trust_review_id, sensitivity: review.sensitivity });
    return review;
  }

  function learningSummary() {
    return {
      schema_version: 'bean.v2.public_learning_summary.v1',
      memory_only: memoryOnly,
      event_log_path: memoryOnly ? 'memory://v2-product-events' : resolvedEventLogPath,
      records: {
        demand_intake: state.demand_intake.length,
        route_decisions: state.route_decisions.length,
        supply_bids: state.supply_bids.length,
        execution_plans: state.execution_plans.length,
        acceptances: state.acceptances.length,
        feedback: state.feedback.length,
        trust_reviews: state.trust_reviews.length,
        events: state.events.length,
      },
      by_event_kind: summarizeRecords(state.events, 'kind'),
      feedback: {
        total: state.feedback.length,
        helpful: state.feedback.filter((item) => item.helpful).length,
        not_helpful: state.feedback.filter((item) => !item.helpful).length,
      },
      exportable_training_corpus: true,
      raw_prompt_required_for_replay: false,
      request_body_stored: false,
    };
  }

  function opsSummary() {
    return {
      schema_version: 'bean.v2.ops_summary.v1',
      production_hosting_status: 'render_free_public_demo',
      durable_db_status: memoryOnly ? 'blocked_in_hosted_demo' : 'local_jsonl_only',
      backups_status: 'blocked_until_durable_store',
      monitoring_status: 'metadata_metrics_endpoint',
      error_alerts_status: 'not_connected',
      cost_alerts_status: 'zero_spend_guardrail',
      incident_runbook_status: 'documented_required_gate',
      admin_console_status: 'contract_only',
      manual_kill_switch_status: 'render_service_stop_or_env_flag_manual',
      rollback_status: 'git_revert_and_render_redeploy',
      spend_usd: 0,
    };
  }

  function qualitySummary() {
    return {
      schema_version: 'bean.v2.quality_summary.v1',
      golden_task_set_status: 'fixtures_present',
      public_traffic_replay_evals_status: 'metadata_only_contract',
      supplier_benchmark_evals_status: 'contract_only_no_external_suppliers',
      route_choice_regression_tests_status: 'node_test_contract',
      calibration_status: 'quality_speed_cost_risk_scoring',
      bad_route_review_loop_status: 'metadata_feedback_contract',
      accepted_outcome_training_loop_status: 'metadata_acceptance_contract',
      local_model_assist_loop_status: 'handoff_to_bean_local_training',
      human_review_sampling_status: 'contract_only',
      public_proof_reports_status: 'available_for_public_or_fixture_inputs',
    };
  }

  function commercialSummary() {
    return {
      schema_version: 'bean.v2.commercial_summary.v1',
      terms_status: 'draft_public_demo_terms_present',
      privacy_status: 'draft_public_demo_privacy_present',
      data_processing_status: 'public_or_synthetic_only',
      supplier_terms_status: 'not_ready_requires_legal_review',
      payment_terms_status: 'not_ready_no_payment_rail',
      marketplace_liability_status: 'not_ready_requires_legal_review',
      rejected_work_policy_status: 'contract_only',
      ip_ownership_status: 'not_ready_requires_legal_review',
      tax_kyc_payout_status: 'blocked_no_supplier_payouts',
      platform_tos_review_status: 'required_before_each_live_adapter',
    };
  }

  function gtmPacket() {
    return {
      schema_version: 'bean.v2.gtm_packet.v1',
      first_user: 'agent platforms, developer tools, and internal automation teams that already receive generic outcome prompts',
      demo_narrative: 'Submit an outcome; BEAN chooses owned agent, public path, build decision, or blocked external supplier path before anyone pays for compute.',
      public_examples_status: 'available',
      github_repo_polish_status: 'public_beta_packet_prepared',
      agent_docs_status: 'llms_txt_and_openapi_available',
      launch_copy_status: 'prepared_requires_operator_approval_before_public_post',
      partner_outreach_status: 'prepared_requires_operator_selection_before_invites',
      feedback_collection_status: 'metadata_api_and_github_issue_templates_available',
      beta_cohort_status: 'prepared_not_invited',
      conversion_path_status: 'public_demo_to_authenticated_beta_contract',
      public_beta_status: 'prepared_for_trusted_external_review',
      public_beta_limits: [
        'public_or_synthetic_inputs_only',
        'no_private_customer_work_or_secret_data',
        'no_paid_execution',
        'no_external_supplier_execution',
        'no_public_posting_or_invites_without_operator_approval',
      ],
    };
  }

  return {
    health() {
      return {
        ok: true,
        service: 'bean-v2-product-control-plane',
        mode: memoryOnly ? 'hosted_memory_only' : 'local_metadata_jsonl',
        external_actions_allowed: false,
        spend_usd: 0,
      };
    },
    goals,
    readiness,
    submitOutcome,
    submitSupplyBid,
    createExecutionPlan,
    recordAcceptance,
    recordFeedback,
    trustReview,
    learningSummary,
    opsSummary,
    qualitySummary,
    commercialSummary,
    gtmPacket,
  };
}

export {
  PRODUCT_BLOCKERS,
  PRODUCT_DOMAINS,
  PRODUCT_GOALS,
  ProductControlPlaneError,
  createProductControlPlane,
};
