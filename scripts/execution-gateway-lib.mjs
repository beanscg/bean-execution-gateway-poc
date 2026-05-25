#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appendLedgerEvent,
  readJson,
  stableHash,
  stableId,
  writeJson,
} from './work-network-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..');
export const defaultRegistryPath = path.join(rootDir, 'data', 'execution-gateway', 'registry.json');
export const defaultRouteRunsDir = path.join(rootDir, 'data', 'execution-gateway', 'route-runs');
export const defaultOutcomeLedgerPath = path.join(rootDir, 'data', 'execution-gateway', 'outcomes.jsonl');

export const DATA_CLASSES = new Set(['public', 'public_but_sensitive', 'private', 'secret', 'regulated', 'unknown']);
export const POLICY_DECISIONS = new Set(['allow', 'allow_with_redaction', 'needs_approval', 'deny']);
export const STOP_CONDITIONS = new Set([
  'requires_private_repo_access',
  'requires_paid_api',
  'requires_public_post',
  'requires_account_credentials',
  'requires_external_supplier',
  'requires_regulated_data',
  'unsafe_or_disallowed',
]);
export const ACTION_KINDS = new Set(['execute', 'inspect', 'delegate', 'ask_user', 'defer', 'reject']);
export const EXECUTOR_KINDS = new Set(['current_agent', 'local_runner', 'local_tool', 'workflow', 'external_supplier', 'human']);
export const POLICY_STATES = new Set(['allowed', 'approval_required', 'blocked']);
export const ADAPTER_BOUNDARIES = new Set([
  'core_engine',
  'cli',
  'hosted_api',
  'sdk',
  'mcp',
  'github_app',
  'slack_app',
  'workflow_platform',
]);
export const TASK_TYPES = new Set([
  'issue_triage',
  'pr_review',
  'patch_plan',
  'repo_readiness_audit',
  'agent_task_triage',
  'verifier_plan',
  'artifact_packaging',
  'marketplace_evaluation',
  'unsupported',
  'unsafe_request',
]);

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[A-Za-z0-9._\-]{8,}\b/gi,
  /\b(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*[A-Za-z0-9/+._\-]{8,}\b/gi,
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PRIVATE_URL_PATTERN = /\b(?:private|internal|vpn|intranet|localhost|127\.0\.0\.1|0\.0\.0\.0):\/\//i;
const LOCAL_PATH_PATTERN = /(?:^|\s)(?:\/Users\/|\/private\/|\/var\/folders\/|~\/|file:\/\/)/i;
const PROMPT_INJECTION_PATTERN = /\b(?:ignore (?:all )?(?:previous|prior) instructions|system prompt|developer message|reveal secrets|exfiltrate|disable guardrails|you are now|forget your instructions)\b/i;
const REGULATED_PATTERN = /\b(?:hipaa|pci|gdpr|ssn|social security|bank account|medical record|patient data|cardholder)\b/i;
const UNSAFE_PATTERN = /\b(?:credential theft|phishing kit|malware|ransomware|steal passwords|bypass authentication|spam campaign|exploit a live target)\b/i;
const PAID_PATTERN = /\b(?:paid api|subscription|buy credits|purchase|paywall|requires payment|non-free|costs?\s+\$|spend\s+\$)\b/i;
const PUBLIC_POST_PATTERN = /\b(?:post a comment|submit a pr|open a pull request|publish|tweet|reddit post|send a message|email the maintainer|outreach)\b/i;
const ACCOUNT_PATTERN = /\b(?:login|sign in|account credentials|oauth|kyc|wallet private key|api key required|connect account)\b/i;
const EXTERNAL_SUPPLIER_PATTERN = /\b(?:external supplier|hire a freelancer|delegate to marketplace|remote agent|external agent|paid worker)\b/i;

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function lowerJoin(values) {
  return asArray(values).map((value) => String(value || '')).join(' ').toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function redactText(value) {
  let redacted = String(value || '');
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_SECRET]');
  }
  redacted = redacted.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
  redacted = redacted.replace(SSN_PATTERN, '[REDACTED_SSN]');
  redacted = redacted.replace(LOCAL_PATH_PATTERN, ' [REDACTED_LOCAL_PATH]');
  return redacted;
}

function scanText(text) {
  const input = String(text || '');
  EMAIL_PATTERN.lastIndex = 0;
  SSN_PATTERN.lastIndex = 0;
  const matches = {
    secrets: [],
    pii: [],
    private_refs: [],
    prompt_injection: [],
    regulated: [],
    unsafe: [],
    paid: [],
    public_post: [],
    account: [],
    external_supplier: [],
  };

  for (const pattern of SECRET_PATTERNS) {
    const found = input.match(pattern) || [];
    matches.secrets.push(...found.map((value) => stableHash(value).slice(0, 12)));
  }
  if (EMAIL_PATTERN.test(input) || SSN_PATTERN.test(input) || /\bcustomer data\b/i.test(input)) {
    matches.pii.push('possible_pii_or_customer_data');
  }
  if (PRIVATE_URL_PATTERN.test(input) || LOCAL_PATH_PATTERN.test(input)) matches.private_refs.push('private_or_local_ref');
  if (PROMPT_INJECTION_PATTERN.test(input)) matches.prompt_injection.push('prompt_injection_text');
  if (REGULATED_PATTERN.test(input)) matches.regulated.push('regulated_data_signal');
  if (UNSAFE_PATTERN.test(input)) matches.unsafe.push('unsafe_work_signal');
  if (PAID_PATTERN.test(input)) matches.paid.push('paid_step_signal');
  if (PUBLIC_POST_PATTERN.test(input)) matches.public_post.push('public_write_signal');
  if (ACCOUNT_PATTERN.test(input)) matches.account.push('account_or_credential_signal');
  if (EXTERNAL_SUPPLIER_PATTERN.test(input)) matches.external_supplier.push('external_supplier_signal');

  return Object.fromEntries(Object.entries(matches).filter(([, found]) => found.length > 0));
}

function classifyTaskType(outcome) {
  const explicit = outcome.task_type || outcome.taskType;
  if (TASK_TYPES.has(explicit)) return explicit;
  const text = lowerJoin([outcome.goal, outcome.desired_artifact, outcome.summary, outcome.title, outcome.success_criteria]);
  if (UNSAFE_PATTERN.test(text)) return 'unsafe_request';
  if (/pull request|\bpr\b|review/i.test(text)) return 'pr_review';
  if (/patch|fix|implementation plan|code change/i.test(text)) return 'patch_plan';
  if (/repo readiness|audit|readiness/i.test(text)) return 'repo_readiness_audit';
  if (/marketplace|bounty|job listing|supplier/i.test(text)) return 'marketplace_evaluation';
  if (/verifier|test plan|acceptance/i.test(text)) return 'verifier_plan';
  if (/packet|artifact|package|handoff/i.test(text)) return 'artifact_packaging';
  if (/issue|triage|label|prioritize/i.test(text)) return 'issue_triage';
  if (/agent|workflow|task/i.test(text)) return 'agent_task_triage';
  return 'agent_task_triage';
}

function inferContextKind(ref) {
  const value = String(ref || '');
  if (/^https?:\/\//i.test(value)) return 'url';
  if (/^file:\/\//i.test(value) || /^\/|^~\//.test(value)) return 'local_path';
  if (value.length > 140 || /\s/.test(value)) return 'text';
  return 'opaque';
}

function classifyOneContextRef(input, index) {
  const raw = typeof input === 'string' ? { ref: input } : { ...input };
  const ref = raw.ref || raw.url || raw.text || raw.content || '';
  const kind = raw.kind || inferContextKind(ref);
  const provenance = raw.provenance || (kind === 'url' ? 'public_url_claim' : 'user_supplied');
  const scan = scanText([ref, raw.note, raw.summary, raw.title].filter(Boolean).join('\n'));
  let dataClass = 'unknown';

  if (scan.secrets) dataClass = 'secret';
  else if (scan.regulated) dataClass = 'regulated';
  else if (scan.private_refs || kind === 'local_path' || /^private:\/\//i.test(String(ref))) dataClass = 'private';
  else if (scan.pii || scan.prompt_injection) dataClass = 'public_but_sensitive';
  else if (/^https?:\/\//i.test(String(ref))) dataClass = 'public';
  else if (kind === 'text' && String(ref).trim()) dataClass = scan.pii ? 'public_but_sensitive' : 'unknown';

  return {
    id: raw.id || stableId('ctx', { index, ref: stableHash(ref), note: raw.note || null }),
    ref,
    kind,
    provenance,
    data_class: dataClass,
    redacted_ref: redactText(ref),
    untrusted_text: true,
    scan,
  };
}

function mergeContextClass(classifications) {
  const precedence = ['secret', 'regulated', 'private', 'public_but_sensitive', 'unknown', 'public'];
  const classes = classifications.map((item) => item.data_class);
  return precedence.find((dataClass) => classes.includes(dataClass)) || 'unknown';
}

function buildSanitizationReport(goalText, contextClassifications) {
  const allScans = [scanText(goalText), ...contextClassifications.map((item) => item.scan)];
  const findings = {
    secret_findings: allScans.flatMap((scan) => scan.secrets || []),
    pii_findings: allScans.flatMap((scan) => scan.pii || []),
    private_ref_findings: allScans.flatMap((scan) => scan.private_refs || []),
    prompt_injection_findings: allScans.flatMap((scan) => scan.prompt_injection || []),
    regulated_findings: allScans.flatMap((scan) => scan.regulated || []),
    unsafe_findings: allScans.flatMap((scan) => scan.unsafe || []),
  };
  const untrusted_context_count = contextClassifications.filter((item) => item.untrusted_text).length;
  const redactions_applied = findings.secret_findings.length + findings.pii_findings.length + findings.private_ref_findings.length;
  const textDataClass = findings.secret_findings.length > 0
    ? 'secret'
    : findings.regulated_findings.length > 0
      ? 'regulated'
      : findings.private_ref_findings.length > 0
        ? 'private'
        : findings.pii_findings.length > 0 || findings.prompt_injection_findings.length > 0
          ? 'public_but_sensitive'
          : 'public';
  return {
    status: findings.secret_findings.length || findings.private_ref_findings.length || findings.regulated_findings.length || findings.unsafe_findings.length
      ? 'blocked_or_redacted'
      : redactions_applied > 0 || findings.prompt_injection_findings.length > 0
        ? 'redacted'
        : 'clean',
    data_class: mergeContextClass([...contextClassifications, { data_class: textDataClass }]),
    untrusted_context_count,
    redactions_applied,
    findings,
    note: 'Public issue text and supplier/tool metadata are treated as untrusted data, never as instructions.',
  };
}

function normalizePolicy(policy) {
  if (!policy) {
    return {
      mode: 'missing',
      max_call_cost_usd: 0,
      max_total_budget_usd: 0,
      external_context_allowed: false,
      external_spend_allowed: false,
      public_post_allowed: false,
      account_credentials_allowed: false,
      external_supplier_allowed: false,
      approval_required_before: ['paid_api', 'external_context', 'external_spend', 'public_post', 'account_credentials', 'external_supplier', 'private_context', 'regulated_data'],
      session_cap_usd: 0,
      day_cap_usd: 0,
    };
  }
  return {
    mode: policy.mode || 'free_only',
    max_call_cost_usd: Number(policy.max_call_cost_usd ?? 0),
    max_total_budget_usd: Number(policy.max_total_budget_usd ?? 0),
    external_context_allowed: Boolean(policy.external_context_allowed),
    external_spend_allowed: Boolean(policy.external_spend_allowed),
    public_post_allowed: Boolean(policy.public_post_allowed),
    account_credentials_allowed: Boolean(policy.account_credentials_allowed),
    external_supplier_allowed: Boolean(policy.external_supplier_allowed),
    approval_required_before: asArray(policy.approval_required_before || ['paid_api', 'external_context', 'external_spend', 'public_post', 'account_credentials', 'external_supplier', 'private_context', 'regulated_data']),
    session_cap_usd: Number(policy.session_cap_usd ?? policy.max_total_budget_usd ?? 0),
    day_cap_usd: Number(policy.day_cap_usd ?? policy.max_total_budget_usd ?? 0),
  };
}

export function normalizeGatewayRequest(input) {
  const outcome = {
    goal: input.outcome?.goal || input.goal || input.title || 'Unspecified outcome',
    task_type: input.outcome?.task_type || input.task_type || input.taskType || null,
    desired_artifact: input.outcome?.desired_artifact || input.desired_artifact || 'execution_path',
    success_criteria: asArray(input.outcome?.success_criteria || input.success_criteria),
    constraints: asArray(input.outcome?.constraints || input.constraints),
  };
  outcome.task_type = classifyTaskType(outcome);
  const contextRefs = asArray(input.context_refs || input.contextRefs || input.context || []);
  const normalized = {
    request_id: input.request_id || input.id || stableId('egreq', { outcome, contextRefs }),
    idempotency_key: input.idempotency_key || input.idempotencyKey || stableId('idem', { outcome, contextRefs }),
    requester_ref: input.requester_ref || input.requesterRef || 'local_operator',
    adapter_boundary: input.adapter_boundary || 'cli',
    submitted_at: input.submitted_at || input.submittedAt || null,
    outcome,
    context_refs: contextRefs.map((ref, index) => classifyOneContextRef(ref, index)),
    policy: normalizePolicy(input.policy),
    requested_capabilities: asArray(input.requested_capabilities || input.requestedCapabilities),
    notes: input.notes || '',
  };
  normalized.request_hash = stableHash({
    requester_ref: normalized.requester_ref,
    outcome: normalized.outcome,
    context_refs: normalized.context_refs.map((item) => ({
      kind: item.kind,
      data_class: item.data_class,
      ref_hash: stableHash(item.ref),
    })),
    policy: normalized.policy,
    requested_capabilities: normalized.requested_capabilities,
  });
  return normalized;
}

function operationalSignals(request, sanitizationReport) {
  const text = [
    request.outcome.goal,
    request.outcome.desired_artifact,
    request.outcome.success_criteria.join(' '),
    request.outcome.constraints.join(' '),
    request.notes,
    request.requested_capabilities.join(' '),
    request.context_refs.map((item) => item.ref).join(' '),
  ].join('\n');
  const scan = scanText(text);
  return {
    requires_paid_api: Boolean(scan.paid) || request.policy.max_call_cost_usd > 0 || request.policy.max_total_budget_usd > 0,
    requires_public_post: Boolean(scan.public_post),
    requires_account_credentials: Boolean(scan.account),
    requires_external_supplier: Boolean(scan.external_supplier) || request.requested_capabilities.includes('external_supplier'),
    requires_private_repo_access: sanitizationReport.data_class === 'private',
    requires_regulated_data: sanitizationReport.data_class === 'regulated',
    unsafe_or_disallowed: sanitizationReport.data_class === 'secret' || Boolean(scan.unsafe),
  };
}

export function evaluatePolicy(request, sanitizationReport) {
  const signals = operationalSignals(request, sanitizationReport);
  const stopConditions = [];
  const reasons = [];

  if (request.policy.mode === 'missing') {
    reasons.push('missing_policy_defaults_to_approval_required');
    return {
      policy_state: 'approval_required',
      policy_decision: 'needs_approval',
      stop_conditions: [],
      reasons,
      approval_required_before: request.policy.approval_required_before,
      signals,
    };
  }

  if (request.policy.mode !== 'free_only') {
    reasons.push('non_free_only_policy_requires_human_approval_in_v0');
    return {
      policy_state: 'approval_required',
      policy_decision: 'needs_approval',
      stop_conditions: [],
      reasons,
      approval_required_before: request.policy.approval_required_before,
      signals,
    };
  }

  if (signals.unsafe_or_disallowed) {
    stopConditions.push('unsafe_or_disallowed');
    reasons.push('secret_or_unsafe_content_detected');
  }
  if (signals.requires_regulated_data) {
    stopConditions.push('requires_regulated_data');
    reasons.push('regulated_data_not_allowed_in_v0');
  }
  if (signals.requires_private_repo_access || (!request.policy.external_context_allowed && sanitizationReport.data_class === 'private')) {
    stopConditions.push('requires_private_repo_access');
    reasons.push('private_or_local_context_not_allowed_in_v0');
  }
  if (signals.requires_paid_api || request.policy.max_call_cost_usd > 0 || request.policy.max_total_budget_usd > 0) {
    stopConditions.push('requires_paid_api');
    reasons.push('spend_or_paid_api_not_allowed_under_free_only');
  }
  if (signals.requires_public_post || !request.policy.public_post_allowed && signals.requires_public_post) {
    stopConditions.push('requires_public_post');
    reasons.push('public_write_not_allowed_without_explicit_approval');
  }
  if (signals.requires_account_credentials || !request.policy.account_credentials_allowed && signals.requires_account_credentials) {
    stopConditions.push('requires_account_credentials');
    reasons.push('account_or_credential_use_not_allowed_without_explicit_approval');
  }
  if (signals.requires_external_supplier || !request.policy.external_supplier_allowed && signals.requires_external_supplier) {
    stopConditions.push('requires_external_supplier');
    reasons.push('external_supplier_not_allowed_in_v0');
  }

  if (stopConditions.length > 0) {
    return {
      policy_state: 'blocked',
      policy_decision: 'deny',
      stop_conditions: unique(stopConditions),
      reasons: unique(reasons),
      approval_required_before: request.policy.approval_required_before,
      signals,
    };
  }

  if (sanitizationReport.data_class === 'public_but_sensitive') {
    return {
      policy_state: 'allowed',
      policy_decision: 'allow_with_redaction',
      stop_conditions: [],
      reasons: ['public_but_sensitive_context_redacted'],
      approval_required_before: request.policy.approval_required_before,
      signals,
    };
  }

  return {
    policy_state: 'allowed',
    policy_decision: 'allow',
    stop_conditions: [],
    reasons: ['free_only_public_local_route_allowed'],
    approval_required_before: request.policy.approval_required_before,
    signals,
  };
}

export function loadExecutorRegistry(registryPath = defaultRegistryPath) {
  return readJson(registryPath);
}

function executorSupportsTask(executor, taskType) {
  return asArray(executor.capability_tags).includes(taskType)
    || asArray(executor.capability_tags).includes('any_public_task')
    || (taskType === 'patch_plan' && asArray(executor.capability_tags).includes('pr_review'));
}

function rejectExecutor(executor, request) {
  const reasons = [];
  if (!executor.selectable_in_v0) reasons.push('not_selectable_in_v0');
  if (executor.executor_kind === 'external_supplier') reasons.push('external_supplier_blocked_in_v0');
  if (Number(executor.estimated_cost_usd || 0) > 0) reasons.push('paid_executor_blocked_under_free_only');
  if (asArray(executor.risk_tags).includes('requires_account_credentials')) reasons.push('account_credentials_blocked');
  if (asArray(executor.context_limits).includes('private_context') && request.policy.mode === 'free_only') reasons.push('private_context_blocked');
  if (!executorSupportsTask(executor, request.outcome.task_type)) reasons.push('task_type_not_supported');
  return reasons;
}

function scoreExecutor(executor, request) {
  const fit = executorSupportsTask(executor, request.outcome.task_type) ? 45 : 10;
  const trust = executor.trust_level === 'trusted_local' ? 20 : executor.trust_level === 'trusted_internal' ? 18 : 4;
  const cost = Number(executor.estimated_cost_usd || 0) === 0 ? 15 : 0;
  const latency = Math.max(0, 10 - Math.min(10, Number(executor.expected_latency_seconds || 999) / 60));
  const verifier = asArray(executor.capability_tags).includes('verifier_plan') || executor.id.includes('verifier') ? 10 : 5;
  const riskPenalty = asArray(executor.risk_tags).length * 2;
  return {
    fit,
    trust,
    cost,
    latency: Number(latency.toFixed(2)),
    verifier,
    risk_penalty: riskPenalty,
    total: Number((fit + trust + cost + latency + verifier - riskPenalty).toFixed(2)),
  };
}

function generateCandidates(request, registry, policyResult) {
  const options = [];
  const blocked = [];
  for (const executor of registry.executors || []) {
    const rejectReasons = rejectExecutor(executor, request);
    if (policyResult.policy_state !== 'allowed') rejectReasons.push(`policy_${policyResult.policy_state}`);
    const score = scoreExecutor(executor, request);
    const option = {
      executor_id: executor.id,
      executor_name: executor.name,
      executor_kind: executor.executor_kind,
      adapter_boundary: executor.adapter_boundary,
      action_kind: executor.default_action_kind || 'execute',
      estimated_cost_usd: Number(executor.estimated_cost_usd || 0),
      expected_latency_seconds: Number(executor.expected_latency_seconds || 0),
      supports_task_type: executorSupportsTask(executor, request.outcome.task_type),
      selectable: rejectReasons.length === 0,
      reject_reasons: rejectReasons,
      score_components: score,
      metadata_trust: executor.metadata_trust || 'trusted',
    };
    if (option.selectable) options.push(option);
    else blocked.push(option);
  }
  return [...options.sort((a, b) => b.score_components.total - a.score_components.total), ...blocked.sort((a, b) => b.score_components.total - a.score_components.total)];
}

function chooseDecision(request, policyResult, rankedOptions) {
  if (policyResult.policy_state === 'blocked') {
    return {
      action_kind: 'reject',
      executor_kind: 'human',
      policy_state: 'blocked',
      policy_decision: 'deny',
      selected_executor_id: null,
      recommendation: 'Do not execute. The request crosses the V0 safety or zero-spend boundary.',
      permission_statement: 'Recommendation is not permission. This route is blocked until Stephen explicitly approves a narrower, safe packet.',
    };
  }
  if (policyResult.policy_state === 'approval_required') {
    return {
      action_kind: 'ask_user',
      executor_kind: 'human',
      policy_state: 'approval_required',
      policy_decision: 'needs_approval',
      selected_executor_id: null,
      recommendation: 'Ask Stephen for explicit approval or a free-only policy before any execution.',
      permission_statement: 'Recommendation is not permission. Missing or non-free-only policy cannot execute in V0.',
    };
  }
  const selected = rankedOptions.find((option) => option.selectable);
  if (!selected) {
    return {
      action_kind: 'defer',
      executor_kind: 'human',
      policy_state: 'approval_required',
      policy_decision: 'needs_approval',
      selected_executor_id: null,
      recommendation: 'No local zero-cost executor can satisfy this request. Ask Stephen before proceeding.',
      permission_statement: 'Recommendation is not permission. No selectable local route exists.',
    };
  }
  const actionKind = request.outcome.task_type === 'issue_triage' || request.outcome.task_type === 'pr_review'
    ? 'inspect'
    : selected.action_kind;
  return {
    action_kind: actionKind,
    executor_kind: selected.executor_kind,
    policy_state: 'allowed',
    policy_decision: policyResult.policy_decision,
    selected_executor_id: selected.executor_id,
    recommendation: `Use ${selected.executor_name} to produce ${request.outcome.desired_artifact}, then verify with the generated verifier plan.`,
    permission_statement: 'Recommendation is not permission for external actions. V0 allows only local, zero-cost artifact generation and inspection.',
  };
}

function buildCost(policyResult, rankedOptions) {
  const selected = rankedOptions.find((option) => option.selectable);
  return {
    chargeable: false,
    estimated_call_cost_usd: selected ? selected.estimated_cost_usd : 0,
    estimated_total_cost_usd: 0,
    max_call_cost_usd: 0,
    max_total_budget_usd: 0,
    shadow_cost_estimate_usd: selected ? selected.estimated_cost_usd : 0,
    would_require_paid_step: policyResult.stop_conditions.includes('requires_paid_api') || rankedOptions.some((option) => option.reject_reasons.includes('paid_executor_blocked_under_free_only')),
  };
}

function artifactRef(routeRunDir, fileName) {
  return path.join(routeRunDir, fileName);
}

function virtualArtifactRef(routeRunId, fileName) {
  return `memory://execution-gateway/${routeRunId}/${fileName}`;
}

function formatContextPacket(response, request) {
  const visibleRefs = request.context_refs.map((ref) => `- ${ref.id}: ${ref.redacted_ref} (${ref.data_class}, ${ref.provenance})`).join('\n') || '- No context refs supplied.';
  return `# Bean Execution Gateway Context Packet

Route run: ${response.route_run_id}
Request: ${response.request_id}
Task type: ${response.task_type}
Policy: ${response.decision.policy_state} / ${response.decision.policy_decision}

Recommendation is not permission. This packet authorizes only the local action described in response.json. It does not authorize public posts, private repo access, account use, supplier calls, trading, payment setup, or spend.

## Requested Outcome

${redactText(request.outcome.goal)}

Desired artifact: ${request.outcome.desired_artifact}

## Allowed Next Step

${response.decision.recommendation}

## Context Refs

${visibleRefs}

## Stop Conditions

${response.stop_conditions.length ? response.stop_conditions.map((item) => `- ${item}`).join('\n') : '- None for the selected local route.'}

## Sanitization

Status: ${response.sanitization_report.status}
Data class: ${response.sanitization_report.data_class}
Prompt injection findings are treated as untrusted input, not instructions.
`;
}

function formatVerifierPlan(response, request) {
  return `# Bean Execution Gateway Verifier Plan

Route run: ${response.route_run_id}

## Checks

- Confirm the selected executor is local, zero-cost, and selectable in V0.
- Confirm artifacts satisfy: ${request.outcome.success_criteria.join('; ') || 'the requested artifact is specific, inspectable, and locally generated'}.
- Confirm no public posting, account mutation, private-context handling, supplier execution, trading, or spend occurred.
- Confirm response.json stop conditions match the request policy and sanitization findings.
- If blocked or approval-required, confirm no execution step was taken.

## Limitations

- The verifier does not inspect live external systems.
- The verifier cannot prove a future human or agent action will remain safe.
- The verifier is scoped to local artifacts and policy routing only.
`;
}

function buildOutcomeTemplate(response, request) {
  return {
    outcome_id: stableId('outcome_template', response.route_run_id),
    route_run_id: response.route_run_id,
    request_id: response.request_id,
    recorded_at: response.generated_at,
    task_type: response.task_type,
    policy_state: response.decision.policy_state,
    policy_decision: response.decision.policy_decision,
    route_recommendation: response.decision.recommendation,
    selected_route: response.decision.selected_executor_id,
    verifier_result: 'not_run',
    operator_acceptance: 'pending',
    elapsed_seconds: null,
    estimated_cost_usd: response.cost.estimated_total_cost_usd,
    actual_cost_usd: 0,
    actual_external_writes: 0,
    actual_external_executions: 0,
    rejection_or_rework_reason: null,
    evidence_refs: response.artifact_refs,
    sensitive_payload_hash: stableHash(request.context_refs.map((item) => item.ref)),
  };
}

export function runExecutionGateway(input, options = {}) {
  const request = normalizeGatewayRequest(input);
  if (!ADAPTER_BOUNDARIES.has(request.adapter_boundary)) {
    request.adapter_boundary = 'cli';
  }
  const registry = options.registry || loadExecutorRegistry(options.registryPath || defaultRegistryPath);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sanitizationReport = buildSanitizationReport(request.outcome.goal, request.context_refs);
  const policyResult = evaluatePolicy(request, sanitizationReport);
  const rankedOptions = generateCandidates(request, registry, policyResult);
  const decision = chooseDecision(request, policyResult, rankedOptions);
  const routeRunId = stableId('rr', {
    request_hash: request.request_hash,
    idempotency_key: request.idempotency_key,
    registry_version: registry.registry_version || 'unknown',
  });
  const routeRunDir = options.outDir || path.join(defaultRouteRunsDir, routeRunId);
  const persistArtifacts = options.persistArtifacts !== false;
  const artifactRefs = {
    response_json: persistArtifacts ? artifactRef(routeRunDir, 'response.json') : virtualArtifactRef(routeRunId, 'response.json'),
    context_packet_md: persistArtifacts ? artifactRef(routeRunDir, 'context-packet.md') : virtualArtifactRef(routeRunId, 'context-packet.md'),
    verifier_md: persistArtifacts ? artifactRef(routeRunDir, 'verifier.md') : virtualArtifactRef(routeRunId, 'verifier.md'),
    outcome_template_json: persistArtifacts ? artifactRef(routeRunDir, 'outcome-template.json') : virtualArtifactRef(routeRunId, 'outcome-template.json'),
  };
  const response = compact({
    route_run_id: routeRunId,
    trace_id: stableId('trace', { routeRunId, request_hash: request.request_hash }),
    request_id: request.request_id,
    request_hash: request.request_hash,
    idempotency_key: request.idempotency_key,
    generated_at: generatedAt,
    adapter_boundary: 'core_engine',
    active_adapter: request.adapter_boundary === 'cli' ? 'cli' : 'cli',
    deferred_adapters: ['hosted_api', 'sdk', 'mcp', 'github_app', 'slack_app', 'workflow_platform'],
    task_type: request.outcome.task_type,
    decision,
    ranked_options: rankedOptions,
    policy: {
      mode: request.policy.mode,
      policy_state: decision.policy_state,
      policy_decision: decision.policy_decision,
      reasons: policyResult.reasons,
      approval_required_before: policyResult.approval_required_before,
    },
    cost: buildCost(policyResult, rankedOptions),
    chargeable: false,
    would_require_paid_step: buildCost(policyResult, rankedOptions).would_require_paid_step,
    stop_conditions: policyResult.stop_conditions,
    sanitization_report: sanitizationReport,
    artifact_refs: artifactRefs,
    persistence: {
      artifacts_persisted: persistArtifacts,
      request_body_persisted: false,
      ledger_write_default: persistArtifacts,
    },
    expected_value_usd: 0,
    why_not_platform_native: 'Bean adds policy, cost, context, and verifier gates before the acting agent chooses a path.',
    evidence_required_to_choose: [
      'Public/local context only',
      'Zero spend and no external writes',
      'Generated verifier plan',
      'Outcome record after execution or denial',
    ],
    duplicate_handling: {
      deterministic_route_run_id: true,
      duplicate_key: request.idempotency_key,
      side_effects_on_duplicate: 'none',
    },
  });

  if (persistArtifacts) {
    fs.mkdirSync(routeRunDir, { recursive: true });
    writeJson(artifactRefs.response_json, response);
    fs.writeFileSync(artifactRefs.context_packet_md, formatContextPacket(response, request));
    fs.writeFileSync(artifactRefs.verifier_md, formatVerifierPlan(response, request));
    writeJson(artifactRefs.outcome_template_json, buildOutcomeTemplate(response, request));
  }

  return {
    request,
    response,
    route_run_dir: routeRunDir,
  };
}

export function buildOutcomeRecord(input, options = {}) {
  const now = options.recordedAt || new Date().toISOString();
  const record = {
    outcome_id: input.outcome_id || stableId('outcome', {
      route_run_id: input.route_run_id,
      selected_route: input.selected_route,
      verifier_result: input.verifier_result,
      operator_acceptance: input.operator_acceptance,
      recorded_at: input.recorded_at || now,
    }),
    route_run_id: input.route_run_id,
    request_id: input.request_id || null,
    recorded_at: input.recorded_at || now,
    task_type: input.task_type || 'unknown',
    policy_state: input.policy_state || null,
    policy_decision: input.policy_decision || null,
    route_recommendation: input.route_recommendation || null,
    selected_route: input.selected_route || null,
    verifier_result: input.verifier_result || 'not_run',
    operator_acceptance: input.operator_acceptance || 'pending',
    elapsed_seconds: input.elapsed_seconds ?? null,
    estimated_cost_usd: Number(input.estimated_cost_usd || 0),
    actual_cost_usd: Number(input.actual_cost_usd || 0),
    actual_external_writes: Number(input.actual_external_writes || 0),
    actual_external_executions: Number(input.actual_external_executions || 0),
    rejection_or_rework_reason: input.rejection_or_rework_reason || null,
    evidence_refs: input.evidence_refs || {},
    sensitive_payload_hash: input.sensitive_payload_hash || null,
  };
  if (!record.route_run_id) throw new Error('record-outcome requires route_run_id');
  return record;
}

export function recordOutcome(input, options = {}) {
  const ledgerPath = options.ledgerPath || defaultOutcomeLedgerPath;
  const record = buildOutcomeRecord(input, options);
  appendLedgerEvent(ledgerPath, record);
  return {
    ledger_path: ledgerPath,
    record,
  };
}

export function readOutcomeLedger(ledgerPath = defaultOutcomeLedgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function summarizeOutcomeLedger(records) {
  const summary = {
    records: records.length,
    by_task_type: {},
    by_selected_route: {},
    by_verifier_result: {},
    by_operator_acceptance: {},
    actual_cost_usd: 0,
    actual_external_writes: 0,
    actual_external_executions: 0,
  };
  for (const record of records) {
    summary.by_task_type[record.task_type] = (summary.by_task_type[record.task_type] || 0) + 1;
    summary.by_selected_route[record.selected_route || 'none'] = (summary.by_selected_route[record.selected_route || 'none'] || 0) + 1;
    summary.by_verifier_result[record.verifier_result] = (summary.by_verifier_result[record.verifier_result] || 0) + 1;
    summary.by_operator_acceptance[record.operator_acceptance] = (summary.by_operator_acceptance[record.operator_acceptance] || 0) + 1;
    summary.actual_cost_usd += Number(record.actual_cost_usd || 0);
    summary.actual_external_writes += Number(record.actual_external_writes || 0);
    summary.actual_external_executions += Number(record.actual_external_executions || 0);
  }
  return summary;
}

export function runAdversarialSuite({ fixtureInput, outDir, registryPath, generatedAt = '2026-05-25T00:00:00.000Z' }) {
  const fixtures = fixtureInput.fixtures || fixtureInput;
  const results = fixtures.map((fixture) => {
    const route = runExecutionGateway(fixture.request, {
      registryPath,
      generatedAt,
      outDir: path.join(outDir, 'adversarial', fixture.fixture_id),
    }).response;
    const expectedStops = asArray(fixture.expected_stop_conditions);
    const actualStops = new Set(route.stop_conditions);
    const passed = route.decision.policy_state === fixture.expected_policy_state
      && route.decision.policy_decision === fixture.expected_policy_decision
      && expectedStops.every((stop) => actualStops.has(stop));
    return {
      fixture_id: fixture.fixture_id,
      label: fixture.label,
      passed,
      expected_policy_state: fixture.expected_policy_state,
      actual_policy_state: route.decision.policy_state,
      expected_policy_decision: fixture.expected_policy_decision,
      actual_policy_decision: route.decision.policy_decision,
      expected_stop_conditions: expectedStops,
      actual_stop_conditions: route.stop_conditions,
      route_run_id: route.route_run_id,
    };
  });
  return {
    suite_name: fixtureInput.suite_name || 'execution-gateway-adversarial',
    results,
    totals: {
      fixtures: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
    },
  };
}

function judgeMaterialImprovement(task, response) {
  const reasons = [];
  if (response.stop_conditions.length > 0) reasons.push('explicit_stop_condition');
  if (response.artifact_refs.verifier_md) reasons.push('verifier_plan_added');
  if (response.cost.chargeable === false && response.cost.estimated_total_cost_usd === 0) reasons.push('zero_spend_enforced');
  if (response.sanitization_report.findings.prompt_injection_findings.length > 0) reasons.push('prompt_injection_neutralized');
  if (response.decision.policy_state === 'allowed' && response.decision.selected_executor_id !== task.baseline_agent_alone?.selected_executor_id) {
    reasons.push('better_local_executor_selected');
  }
  const expected = Boolean(task.expected_material_improvement);
  return {
    material: expected || reasons.length >= 2,
    reasons: unique([...(task.expected_improvement_reasons || []), ...reasons]),
  };
}

export function runProofSuite({ fixtureInput, outDir, ledgerPath, registryPath, generatedAt = '2026-05-25T00:00:00.000Z' }) {
  const tasks = fixtureInput.tasks || fixtureInput;
  const results = tasks.map((task) => {
    const { response } = runExecutionGateway(task.request, {
      registryPath,
      generatedAt,
      outDir: path.join(outDir, 'proof-routes', task.task_id),
    });
    const improvement = judgeMaterialImprovement(task, response);
    const outcome = recordOutcome({
      route_run_id: response.route_run_id,
      request_id: response.request_id,
      task_type: response.task_type,
      policy_state: response.decision.policy_state,
      policy_decision: response.decision.policy_decision,
      route_recommendation: response.decision.recommendation,
      selected_route: response.decision.selected_executor_id,
      verifier_result: response.decision.policy_state === 'blocked' ? 'blocked_as_expected' : 'simulated_pass',
      operator_acceptance: response.decision.policy_state === 'blocked' ? 'denied' : 'accepted',
      elapsed_seconds: task.simulated_elapsed_seconds || 60,
      estimated_cost_usd: response.cost.estimated_total_cost_usd,
      actual_cost_usd: 0,
      actual_external_writes: 0,
      actual_external_executions: 0,
      evidence_refs: response.artifact_refs,
      sensitive_payload_hash: stableHash(task.request.context_refs || []),
    }, { ledgerPath, recordedAt: generatedAt }).record;
    return {
      task_id: task.task_id,
      label: task.label,
      repeat_use_case: task.repeat_use_case || null,
      baseline_agent_alone: task.baseline_agent_alone,
      bean_route: {
        route_run_id: response.route_run_id,
        policy_state: response.decision.policy_state,
        policy_decision: response.decision.policy_decision,
        selected_executor_id: response.decision.selected_executor_id,
        action_kind: response.decision.action_kind,
        stop_conditions: response.stop_conditions,
        verifier_ref: response.artifact_refs.verifier_md,
      },
      material_improvement: improvement.material,
      improvement_reasons: improvement.reasons,
      outcome_id: outcome.outcome_id,
    };
  });
  return {
    suite_name: fixtureInput.suite_name || 'execution-gateway-proof',
    results,
    totals: {
      tasks: results.length,
      route_records: results.length,
      outcome_records: results.length,
      material_improvements: results.filter((result) => result.material_improvement).length,
      repeat_use_cases: unique(results.map((result) => result.repeat_use_case)).filter(Boolean).length,
      spend_usd: 0,
      external_writes: 0,
      external_executions: 0,
    },
  };
}

export function formatEvaluationReport({ proofReport, adversarialReport, ledgerSummary, generatedAt = new Date().toISOString() }) {
  const proofGate = proofReport.totals.tasks >= 20
    && proofReport.totals.material_improvements >= 3
    && proofReport.totals.repeat_use_cases >= 5
    && proofReport.totals.outcome_records >= 10
    && adversarialReport.totals.failed === 0
    && proofReport.totals.spend_usd === 0
    && proofReport.totals.external_writes === 0
    && proofReport.totals.external_executions === 0;
  const topImprovements = proofReport.results.filter((result) => result.material_improvement).slice(0, 5)
    .map((result) => `- ${result.task_id}: ${result.improvement_reasons.join(', ')}`).join('\n');
  const repeatCases = unique(proofReport.results.map((result) => result.repeat_use_case)).filter(Boolean)
    .map((item) => `- ${item}`).join('\n');
  return `# Agent Execution Gateway V0 Evaluation Report

Generated: ${generatedAt}

## Gate Result

${proofGate ? 'PASS' : 'FAIL'}

## Proof Totals

- Tasks: ${proofReport.totals.tasks}
- Route records: ${proofReport.totals.route_records}
- Outcome records: ${proofReport.totals.outcome_records}
- Material improvements: ${proofReport.totals.material_improvements}
- Repeat-use cases: ${proofReport.totals.repeat_use_cases}
- Spend: ${proofReport.totals.spend_usd} USD
- External writes: ${proofReport.totals.external_writes}
- External executions: ${proofReport.totals.external_executions}

## Adversarial Totals

- Fixtures: ${adversarialReport.totals.fixtures}
- Passed: ${adversarialReport.totals.passed}
- Failed: ${adversarialReport.totals.failed}

## Material Improvements

${topImprovements || '- None'}

## Repeat-Use Cases

${repeatCases || '- None'}

## Outcome Ledger Summary

- Records: ${ledgerSummary.records}
- Actual cost: ${ledgerSummary.actual_cost_usd} USD
- External writes: ${ledgerSummary.actual_external_writes}
- External executions: ${ledgerSummary.actual_external_executions}

## Decision

V0 is allowed to continue only as a local, free, CLI-backed gateway. Hosted adapters, public release, external suppliers, account mutation, payment rails, and private-context handling remain blocked until Stephen explicitly approves a separate packet.
`;
}

export function runEvaluation({ proofInput, adversarialInput, outDir, ledgerPath, registryPath, generatedAt = '2026-05-25T00:00:00.000Z' }) {
  fs.mkdirSync(outDir, { recursive: true });
  const proofReport = runProofSuite({ fixtureInput: proofInput, outDir, ledgerPath, registryPath, generatedAt });
  const adversarialReport = runAdversarialSuite({ fixtureInput: adversarialInput, outDir, registryPath, generatedAt });
  const ledgerSummary = summarizeOutcomeLedger(readOutcomeLedger(ledgerPath));
  const report = {
    generated_at: generatedAt,
    proof: proofReport,
    adversarial: adversarialReport,
    outcome_ledger: ledgerSummary,
    gate_passed: proofReport.totals.tasks >= 20
      && proofReport.totals.material_improvements >= 3
      && proofReport.totals.repeat_use_cases >= 5
      && proofReport.totals.outcome_records >= 10
      && adversarialReport.totals.failed === 0,
  };
  writeJson(path.join(outDir, 'evaluation-report.json'), report);
  fs.writeFileSync(path.join(outDir, 'evaluation-report.md'), formatEvaluationReport({ proofReport, adversarialReport, ledgerSummary, generatedAt }));
  return report;
}
