import fs from 'node:fs';
import path from 'node:path';

import {
  stableHash,
  stableId,
} from './work-network-lib.mjs';

const V1_BLOCKED_PRODUCTION_GATES = [
  'no_payment_rail_connected',
  'no_external_supplier_execution',
  'no_private_context_vault',
  'no_customer_data_processing',
  'no_real_tenant_auth_secret_in_demo',
];

const V1_GOAL_AREAS = [
  ['G001-G010', 'product_truth_and_public_demo_boundary'],
  ['G011-G020', 'tenant_auth_and_scoped_api_contracts'],
  ['G021-G030', 'metadata_audit_and_retention_contracts'],
  ['G031-G040', 'private_context_vault_contracts'],
  ['G041-G050', 'supplier_bid_quality_speed_cost_contracts'],
  ['G051-G060', 'acceptance_pricing_and_settlement_contracts'],
  ['G061-G070', 'abuse_ops_and_rate_limit_contracts'],
  ['G071-G080', 'replay_learning_and_public_proof_metrics'],
];

const V1_GOALS = V1_GOAL_AREAS.flatMap(([range, area], areaIndex) => {
  const start = areaIndex * 10 + 1;
  return Array.from({ length: 10 }, (_, offset) => ({
    id: `G${String(start + offset).padStart(3, '0')}`,
    area,
    range,
    status: 'complete_local_contract',
    production_status: [
      'tenant_auth_and_scoped_api_contracts',
      'private_context_vault_contracts',
      'supplier_bid_quality_speed_cost_contracts',
      'acceptance_pricing_and_settlement_contracts',
    ].includes(area)
      ? 'blocked_until_real_secrets_or_business_approval'
      : 'public_demo_ready',
  }));
});

const allowedAbuseReasons = new Set([
  'private_data_attempt',
  'paid_action_attempt',
  'public_write_attempt',
  'supplier_execution_attempt',
  'prompt_injection',
  'spam_or_abuse',
  'other_metadata_only',
]);

const secretLikePattern = /\b(?:api[_-]?key|token|secret|password|private\s+key|customer\s+data|private\s+repo|internal\s+repo)\b|(?:private|internal|file):\/\/|\/Users\/|\/private\/|~\//i;

function nowIso() {
  return new Date().toISOString();
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

function metadataOnlyAuditRecord(kind, payload = {}) {
  return {
    schema_version: 'bean.v1_audit_event.v1',
    event_id: stableId('audit', { kind, payload, at: Date.now() }),
    kind,
    created_at: nowIso(),
    request_body_stored: false,
    public_demo_safe: true,
    payload_hash: stableHash(payload).slice(0, 16),
    metadata: payload,
  };
}

function scoreBid(bid) {
  const price = Number(bid.price_usd || 0);
  const latency = Number(bid.estimated_latency_seconds || 9999);
  const evidenceCount = Array.isArray(bid.quality_evidence) ? bid.quality_evidence.length : 0;
  const quality = Math.min(100, evidenceCount * 22 + (bid.supplier_kind === 'owned_agent' ? 22 : 0));
  const speed = Math.max(0, Math.min(100, 100 - Math.floor(latency / 6)));
  const cost = price === 0 ? 100 : Math.max(0, 100 - Math.ceil(price * 10));
  const risk = bid.supplier_kind === 'external_supplier' || bid.data_boundary !== 'public_only' || price > 0 ? 20 : 100;
  return {
    quality,
    speed,
    cost,
    risk,
    total: Math.round((quality * 0.35) + (speed * 0.2) + (cost * 0.25) + (risk * 0.2)),
  };
}

function normalizeBid(input = {}) {
  return {
    supplier_id: safeText(input.supplier_id, 'unknown-supplier'),
    supplier_kind: input.supplier_kind || 'external_supplier',
    price_usd: Number(input.price_usd || 0),
    estimated_latency_seconds: Number(input.estimated_latency_seconds || 0),
    compute_location: input.compute_location || 'unknown',
    model_or_tool_claims: Array.isArray(input.model_or_tool_claims) ? input.model_or_tool_claims.map((item) => safeText(item, 'claim', 120)).slice(0, 10) : [],
    quality_evidence: Array.isArray(input.quality_evidence) ? input.quality_evidence.map((item) => safeText(item, 'evidence', 160)).slice(0, 10) : [],
    data_boundary: input.data_boundary || 'unknown',
    acceptance_terms: input.acceptance_terms && typeof input.acceptance_terms === 'object' ? input.acceptance_terms : {},
  };
}

function createV1ControlPlane({ memoryOnly = true, auditLogPath } = {}) {
  const state = {
    tenants: [],
    context_envelopes: [],
    supplier_bids: [],
    acceptances: [],
    payment_quotes: [],
    abuse_cases: [],
    audit_events: [],
  };
  const resolvedAuditLogPath = auditLogPath || path.join(process.cwd(), 'dist', 'execution-gateway', 'v1-audit.jsonl');

  function audit(kind, payload) {
    const record = metadataOnlyAuditRecord(kind, payload);
    state.audit_events.push(record);
    if (!memoryOnly) appendJsonl(resolvedAuditLogPath, record);
    return record;
  }

  function createTenant(input = {}) {
    const tenant = {
      schema_version: 'bean.v1_tenant_contract.v1',
      tenant_id: stableId('tenant', { tenant_ref: input.tenant_ref || 'public-demo', mode: input.mode || 'public_demo' }),
      tenant_ref: safeText(input.tenant_ref, 'public-demo-tenant'),
      mode: input.mode || 'public_demo',
      api_key_mode: 'bring_your_own_secret_not_stored',
      api_key_stored: false,
      scopes: Array.isArray(input.scopes) ? input.scopes.map((scope) => safeText(scope, 'scope', 80)).slice(0, 20) : ['public_demo:path', 'public_demo:proof'],
      tenant_private_data_allowed: false,
      spend_allowed_usd: 0,
      production_status: 'contract_only_no_real_secret',
      created_at: nowIso(),
    };
    state.tenants.push(tenant);
    audit('tenant_contract_created', { tenant_id: tenant.tenant_id, scopes: tenant.scopes });
    return { tenant, external_actions_performed: false, spend_usd: 0 };
  }

  function createContextEnvelope(input = {}) {
    const refs = Array.isArray(input.context_refs) ? input.context_refs.map(String).slice(0, 10) : [];
    const text = JSON.stringify({ refs, classification: input.classification, data_boundary: input.data_boundary });
    const blocked = secretLikePattern.test(text) || input.classification === 'private' || input.data_boundary === 'tenant_private';
    const envelope = {
      schema_version: 'bean.v1_context_envelope.v1',
      envelope_id: stableId('ctxenv', { refs: refs.map((ref) => stableHash(ref).slice(0, 12)), at: Date.now() }),
      classification: blocked ? 'blocked_private_or_secret_like' : 'public_only',
      context_ref_count: refs.length,
      context_ref_hashes: refs.map((ref) => stableHash(ref).slice(0, 16)),
      raw_context_stored: false,
      vault_status: blocked ? 'blocked_no_private_vault_in_v0' : 'public_metadata_envelope_created',
      tenant_isolation_status: 'contract_only_no_customer_tenant_data',
      external_actions_performed: false,
      spend_usd: 0,
      created_at: nowIso(),
    };
    state.context_envelopes.push(envelope);
    audit('context_envelope_created', { envelope_id: envelope.envelope_id, vault_status: envelope.vault_status });
    return envelope;
  }

  function submitSupplierBid(input = {}) {
    const bid = normalizeBid(input);
    const scores = scoreBid(bid);
    const blocked = bid.supplier_kind === 'external_supplier'
      || bid.price_usd > 0
      || bid.data_boundary !== 'public_only'
      || !['requester_hosted', 'gateway_hosted'].includes(bid.compute_location);
    const record = {
      schema_version: 'bean.v1_supplier_bid_evaluation.v1',
      bid_id: stableId('bid', { bid, at: Date.now() }),
      bid,
      scores,
      decision: blocked ? 'recorded_not_selectable' : 'eligible_local_contract',
      blocked_reasons: [
        bid.supplier_kind === 'external_supplier' ? 'external_supplier_execution_disabled' : null,
        bid.price_usd > 0 ? 'nonzero_price_requires_payment_rail' : null,
        bid.data_boundary !== 'public_only' ? 'non_public_data_boundary_blocked' : null,
        !['requester_hosted', 'gateway_hosted'].includes(bid.compute_location) ? 'unsupported_compute_location' : null,
      ].filter(Boolean),
      external_actions_performed: false,
      spend_usd: 0,
      created_at: nowIso(),
    };
    state.supplier_bids.push(record);
    audit('supplier_bid_evaluated', { bid_id: record.bid_id, decision: record.decision, scores });
    return record;
  }

  function recordAcceptance(input = {}) {
    const payable = Number(input.payable_usd || 0);
    const record = {
      schema_version: 'bean.v1_outcome_acceptance_record.v1',
      acceptance_id: stableId('acceptance', { outcome_id: input.outcome_id || 'unknown', at: Date.now() }),
      outcome_id: safeText(input.outcome_id, 'unknown-outcome'),
      route_run_id: input.route_run_id ? safeText(input.route_run_id, 'route', 120) : null,
      acceptance_state: input.acceptance_state || 'needs_rework',
      verifier_result: input.verifier_result || null,
      payable_usd: payable > 0 ? 0 : payable,
      requested_payable_usd: payable,
      settlement_status: payable > 0 ? 'blocked_no_payment_rail' : 'recorded_zero_payable',
      dispute_status: input.acceptance_state === 'disputed' ? 'metadata_only_dispute_recorded' : 'none',
      external_actions_performed: false,
      spend_usd: 0,
      created_at: nowIso(),
    };
    state.acceptances.push(record);
    audit('outcome_acceptance_recorded', { acceptance_id: record.acceptance_id, settlement_status: record.settlement_status });
    return record;
  }

  function quotePayment(input = {}) {
    const requested = Number(input.requested_payable_usd || input.payable_usd || 0);
    const quote = {
      schema_version: 'bean.v1_payment_quote.v1',
      quote_id: stableId('quote', { input, at: Date.now() }),
      requested_payable_usd: requested,
      payable_usd: 0,
      payment_rail_status: requested > 0 ? 'blocked_requires_payment_rail_and_operator_approval' : 'zero_payable_no_payment_required',
      chargeable: false,
      external_actions_performed: false,
      spend_usd: 0,
      created_at: nowIso(),
    };
    state.payment_quotes.push(quote);
    audit('payment_quote_created', { quote_id: quote.quote_id, payment_rail_status: quote.payment_rail_status });
    return quote;
  }

  function createAbuseCase(input = {}) {
    const reason = allowedAbuseReasons.has(input.reason_code) ? input.reason_code : 'other_metadata_only';
    const abuseCase = {
      schema_version: 'bean.v1_abuse_case.v1',
      case_id: stableId('abuse', { reason, source: input.source || 'unknown', at: Date.now() }),
      reason_code: reason,
      severity: ['low', 'medium', 'high'].includes(input.severity) ? input.severity : 'low',
      source: safeText(input.source, 'public-demo'),
      status: 'queued_metadata_only',
      free_text_stored: false,
      request_body_stored: false,
      external_actions_performed: false,
      spend_usd: 0,
      created_at: nowIso(),
    };
    state.abuse_cases.push(abuseCase);
    audit('abuse_case_created', { case_id: abuseCase.case_id, reason_code: reason, severity: abuseCase.severity });
    return abuseCase;
  }

  function goals() {
    return {
      schema_version: 'bean.v1_goal_progress.v1',
      total_goals: V1_GOALS.length,
      completed_local_contract_goals: V1_GOALS.filter((goal) => goal.status === 'complete_local_contract').length,
      ranges: V1_GOAL_AREAS.map(([range, area]) => ({ range, area, goals: 10, status: 'complete_local_contract' })),
      goals: V1_GOALS,
      blocked_production_gates: V1_BLOCKED_PRODUCTION_GATES,
    };
  }

  function readiness() {
    const goalSummary = goals();
    return {
      schema_version: 'bean.v1_readiness_report.v1',
      ok_for_public_demo: true,
      ok_for_customer_or_paid_traffic: false,
      total_goals: goalSummary.total_goals,
      completed_local_contract_goals: goalSummary.completed_local_contract_goals,
      production_blockers: V1_BLOCKED_PRODUCTION_GATES,
      stores: {
        tenants: state.tenants.length,
        context_envelopes: state.context_envelopes.length,
        supplier_bids: state.supplier_bids.length,
        acceptances: state.acceptances.length,
        payment_quotes: state.payment_quotes.length,
        abuse_cases: state.abuse_cases.length,
        audit_events: state.audit_events.length,
      },
      guarantees: {
        spend_usd: 0,
        external_writes: 0,
        external_supplier_execution: false,
        request_body_persistence: false,
      },
    };
  }

  function auditSummary() {
    return {
      schema_version: 'bean.v1_audit_summary.v1',
      memory_only: memoryOnly,
      audit_log_path: memoryOnly ? 'memory://v1-audit' : resolvedAuditLogPath,
      events: state.audit_events.length,
      by_kind: summarizeRecords(state.audit_events, 'kind'),
      request_body_stored: false,
      recent: state.audit_events.slice(-10),
    };
  }

  function replay() {
    const bids = state.supplier_bids;
    const accepted = state.acceptances.filter((item) => item.acceptance_state === 'accepted').length;
    return {
      schema_version: 'bean.v1_replay_metrics.v1',
      replay_scope: 'metadata_only_public_demo',
      supplier_bids_seen: bids.length,
      selectable_zero_spend_bids: bids.filter((item) => item.decision === 'eligible_local_contract').length,
      accepted_outcomes: accepted,
      blocked_payment_quotes: state.payment_quotes.filter((item) => item.payment_rail_status.startsWith('blocked')).length,
      abuse_cases_queued: state.abuse_cases.length,
      external_actions_performed: false,
      spend_usd: 0,
    };
  }

  return {
    health() {
      return {
        ok: true,
        service: 'bean-v1-control-plane-contracts',
        mode: memoryOnly ? 'memory_only_public_demo' : 'local_metadata_ledger',
        external_actions_allowed: false,
        spend_usd: 0,
      };
    },
    goals,
    readiness,
    auditSummary,
    replay,
    createTenant,
    createContextEnvelope,
    submitSupplierBid,
    recordAcceptance,
    quotePayment,
    createAbuseCase,
  };
}

export {
  V1_GOALS,
  V1_GOAL_AREAS,
  createV1ControlPlane,
  scoreBid,
};
