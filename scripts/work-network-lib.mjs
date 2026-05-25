#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TASK_TYPES = new Set([
  'issue_triage',
  'pr_review',
  'patch_plan',
  'repo_readiness_audit',
  'agent_task_triage',
]);

export const defaultState = () => ({
  demand_events: [],
  work_orders: [],
  policy_decisions: [],
  routing_decisions: [],
  shadow_quotes: [],
  completion_records: [],
});

export const defaultRunnerProfiles = [
  {
    id: 'bean-local-triage',
    name: 'BEAN Local Triage',
    operator_type: 'internal',
    network_source: 'bean',
    adapter_type: 'local_model_or_deterministic',
    supported_task_types: ['issue_triage', 'agent_task_triage', 'repo_readiness_audit'],
    compute_placement: 'local_internal',
    pricing_claim: 0,
    latency_claim: 30,
    context_requirements: ['public_context'],
    trust_tier: 'trusted_internal',
    past_outcome_refs: [],
  },
  {
    id: 'codex-planner-reviewer',
    name: 'Codex Planner Reviewer',
    operator_type: 'internal',
    network_source: 'codex',
    adapter_type: 'session_runner',
    supported_task_types: ['issue_triage', 'pr_review', 'patch_plan', 'repo_readiness_audit'],
    compute_placement: 'internal_session',
    pricing_claim: 0,
    latency_claim: 120,
    context_requirements: ['public_context'],
    trust_tier: 'trusted_internal',
    past_outcome_refs: [],
  },
  {
    id: 'deterministic-verifier',
    name: 'Deterministic Verifier',
    operator_type: 'internal',
    network_source: 'bean',
    adapter_type: 'script',
    supported_task_types: ['pr_review', 'patch_plan'],
    compute_placement: 'local_internal',
    pricing_claim: 0,
    latency_claim: 10,
    context_requirements: ['public_context'],
    trust_tier: 'trusted_internal',
    past_outcome_refs: [],
  },
  {
    id: 'human-baseline',
    name: 'Human Baseline',
    operator_type: 'human',
    network_source: 'bean',
    adapter_type: 'manual',
    supported_task_types: ['issue_triage', 'pr_review', 'patch_plan', 'repo_readiness_audit', 'agent_task_triage'],
    compute_placement: 'human_internal',
    pricing_claim: 0,
    latency_claim: 300,
    context_requirements: ['public_context'],
    trust_tier: 'trusted_internal',
    past_outcome_refs: [],
  },
  {
    id: 'a2a-shadow-agent',
    name: 'A2A Shadow Agent',
    operator_type: 'external_agent',
    network_source: 'a2a',
    adapter_type: 'shadow_discovery',
    supported_task_types: ['issue_triage', 'pr_review', 'agent_task_triage'],
    compute_placement: 'external_supplier_compute',
    pricing_claim: null,
    latency_claim: null,
    context_requirements: ['public_context'],
    trust_tier: 'shadow_only',
    past_outcome_refs: [],
  },
  {
    id: 'agentverse-shadow-agent',
    name: 'Agentverse Shadow Agent',
    operator_type: 'external_agent',
    network_source: 'agentverse',
    adapter_type: 'shadow_discovery',
    supported_task_types: ['agent_task_triage', 'issue_triage'],
    compute_placement: 'external_supplier_compute',
    pricing_claim: null,
    latency_claim: null,
    context_requirements: ['public_context'],
    trust_tier: 'shadow_only',
    past_outcome_refs: [],
  },
  {
    id: 'olas-mech-shadow',
    name: 'Olas Mech Shadow Supplier',
    operator_type: 'external_agent',
    network_source: 'olas_mech',
    adapter_type: 'shadow_discovery',
    supported_task_types: ['agent_task_triage', 'patch_plan'],
    compute_placement: 'external_supplier_compute',
    pricing_claim: null,
    latency_claim: null,
    context_requirements: ['public_context'],
    trust_tier: 'shadow_only',
    past_outcome_refs: [],
  },
  {
    id: 'mcp-executor-shadow',
    name: 'MCP Executor Wrapper Shadow',
    operator_type: 'external_tool_agent',
    network_source: 'mcp',
    adapter_type: 'shadow_discovery',
    supported_task_types: ['issue_triage', 'pr_review'],
    compute_placement: 'external_supplier_compute',
    pricing_claim: null,
    latency_claim: null,
    context_requirements: ['public_context'],
    trust_tier: 'shadow_only',
    past_outcome_refs: [],
  },
];

export function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function stableId(prefix, value) {
  return `${prefix}_${stableHash(value).slice(0, 16)}`;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function loadState(statePath) {
  if (!fs.existsSync(statePath)) return defaultState();
  return { ...defaultState(), ...readJson(statePath) };
}

export function saveState(statePath, state) {
  writeJson(statePath, state);
}

export function appendLedgerEvent(ledgerPath, event) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`);
}

export function makeLedgerEvent({ eventType, sourceType, workOrderId = null, actor = 'bean-work-network', payloadRef = null, payload = null, now = new Date() }) {
  const base = {
    event_type: eventType,
    timestamp: now.toISOString(),
    source_type: sourceType || 'unknown',
    work_order_id: workOrderId,
    actor,
    payload_ref: payloadRef,
  };
  return {
    event_id: stableId('le', { ...base, payload }),
    ...base,
    hash: stableHash(payload || base),
  };
}

function toArray(input) {
  return Array.isArray(input) ? input : [input];
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function firstDefined(input, ...keys) {
  for (const key of keys) {
    if (hasOwn(input, key)) return input[key];
  }
  return undefined;
}

function parseBudgetSignal(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/(?:\$|USD\s*)?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function sensitivityFromInput(input) {
  return input.sensitivity_guess || input.sensitivity || 'public_only';
}

export function normalizeManualJson(input) {
  return toArray(input).map((item) => {
    const contextRefs = item.context_refs || item.contextRefs || [];
    const event = {
      id: item.id || stableId('de', ['manual_json', item.source_ref || item.sourceRef || item.raw_summary || item.rawSummary]),
      source_type: item.source_type || item.sourceType || 'manual',
      source_ref: item.source_ref || item.sourceRef || 'manual://local',
      source_adapter: 'manual_json',
      raw_summary: item.raw_summary || item.rawSummary || item.title || 'Manual work signal',
      requester_ref: item.requester_ref || item.requesterRef || null,
      buyer_intent_signal: item.buyer_intent_signal || item.buyerIntentSignal || 'unknown',
      budget_signal: parseBudgetSignal(item.budget_signal ?? item.budgetSignal ?? item.budget_cap ?? item.budgetCap),
      deadline_signal: item.deadline_signal || item.deadlineSignal || null,
      context_refs: contextRefs,
      sensitivity_guess: sensitivityFromInput(item),
      required_artifact_guess: item.required_artifact_guess || item.requiredArtifactGuess || item.required_artifact || 'triage_report',
      task_type_guess: item.task_type_guess || item.taskTypeGuess || item.task_type || null,
      source_policy_tags: item.source_policy_tags || item.sourcePolicyTags || ['manual'],
    };
    for (const [targetKey, sourceKeys] of [
      ['expected_runner_id', ['expected_runner_id', 'expectedRunnerId']],
      ['expected_policy_decision', ['expected_policy_decision', 'expectedPolicyDecision']],
      ['fixture_group', ['fixture_group', 'fixtureGroup']],
      ['fixture_label', ['fixture_label', 'fixtureLabel']],
    ]) {
      const value = firstDefined(item, ...sourceKeys);
      if (value !== undefined) event[targetKey] = value;
    }
    return event;
  });
}

export function parseGitHubUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'github.com') {
    throw new Error(`Expected github.com URL, got ${url}`);
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  const [owner, repo, kind, number] = parts;
  if (!owner || !repo || !['issues', 'pull'].includes(kind) || !/^\d+$/.test(number || '')) {
    throw new Error(`Expected GitHub issue or PR URL, got ${url}`);
  }
  return {
    owner,
    repo,
    kind,
    number: Number(number),
    repository: `${owner}/${repo}`,
  };
}

export function normalizeGitHubPublic(input) {
  return toArray(input).map((item) => {
    const source = typeof item === 'string' ? { url: item } : item;
    const url = source.url;
    const parsed = parseGitHubUrl(url);
    const taskType = parsed.kind === 'pull' ? 'pr_review' : (source.task_type_guess || source.task_type || 'issue_triage');
    const event = {
      id: stableId('de', ['github_public', url]),
      source_type: 'public_work_source',
      source_ref: url,
      source_adapter: 'github_public',
      raw_summary: source.title || `${parsed.repository} ${parsed.kind === 'pull' ? 'PR' : 'issue'} #${parsed.number}`,
      requester_ref: source.requester_ref || null,
      buyer_intent_signal: source.buyer_intent_signal || (source.bounty_signal ? 'budget_signal_present' : 'unknown'),
      budget_signal: parseBudgetSignal(source.budget_signal ?? source.rewardAmount ?? source.reward),
      deadline_signal: source.deadline_signal || null,
      context_refs: [url],
      sensitivity_guess: 'public_only',
      required_artifact_guess: source.required_artifact_guess || (parsed.kind === 'pull' ? 'pr_review_report' : 'agent_fit_triage'),
      task_type_guess: taskType,
      source_policy_tags: ['public', 'github', parsed.kind, ...(source.source_policy_tags || [])],
      github: parsed,
    };
    for (const [targetKey, sourceKeys] of [
      ['expected_runner_id', ['expected_runner_id', 'expectedRunnerId']],
      ['expected_policy_decision', ['expected_policy_decision', 'expectedPolicyDecision']],
      ['fixture_group', ['fixture_group', 'fixtureGroup']],
      ['fixture_label', ['fixture_label', 'fixtureLabel']],
    ]) {
      const value = firstDefined(source, ...sourceKeys);
      if (value !== undefined) event[targetKey] = value;
    }
    return event;
  });
}

function summarizeMarketplaceListing(platform, listing) {
  const title = listing.title || listing.name || listing.category || 'Marketplace work signal';
  const url = listing.url || listing.link || listing.source_url || `${platform.toLowerCase()}://${listing.id || stableHash(listing).slice(0, 10)}`;
  const token = listing.token || listing.rewardToken || listing.currency || null;
  const tags = ['marketplace', platform.toLowerCase()];
  if (token) tags.push(`reward:${String(token).toLowerCase()}`);
  const event = {
    id: stableId('de', ['agent_marketplace_readonly', platform, listing.id || url || title]),
    source_type: 'marketplace_work_source',
    source_ref: url,
    source_adapter: 'agent_marketplace_readonly',
    raw_summary: title,
    requester_ref: platform,
    buyer_intent_signal: listing.decision === 'inspect' || listing.status === 'open' ? 'marketplace_listing' : 'unknown',
    budget_signal: parseBudgetSignal(listing.rewardAmount ?? listing.reward ?? listing.budgetUsd ?? listing.budget_usd),
    deadline_signal: listing.deadline || null,
    context_refs: [url],
    sensitivity_guess: 'public_only',
    required_artifact_guess: 'marketplace_task_triage',
    task_type_guess: 'agent_task_triage',
    source_policy_tags: [...tags, ...(listing.source_policy_tags || [])],
  };
  for (const [targetKey, sourceKeys] of [
    ['expected_runner_id', ['expected_runner_id', 'expectedRunnerId']],
    ['expected_policy_decision', ['expected_policy_decision', 'expectedPolicyDecision']],
    ['fixture_group', ['fixture_group', 'fixtureGroup']],
    ['fixture_label', ['fixture_label', 'fixtureLabel']],
  ]) {
    const value = firstDefined(listing, ...sourceKeys);
    if (value !== undefined) event[targetKey] = value;
  }
  return event;
}

export function normalizeAgentMarketplaceReadonly(input) {
  const events = [];
  const platforms = input.platforms || [];
  for (const platformReport of platforms) {
    const platform = platformReport.platform || 'Marketplace';
    for (const listing of platformReport.listings || []) {
      if (listing.decision === 'inspect') events.push(summarizeMarketplaceListing(platform, listing));
    }
    for (const job of platformReport.jobs || []) {
      if (!job.status || job.status === 'open') events.push(summarizeMarketplaceListing(platform, { ...job, budgetUsd: job.budgetUsd ?? job.budget_usd }));
    }
  }
  for (const listing of input.listings || []) {
    if (!listing.decision || listing.decision === 'inspect') events.push(summarizeMarketplaceListing(input.platform || 'Marketplace', listing));
  }
  return events;
}

export function normalizeWithAdapter(adapter, input) {
  if (adapter === 'manual_json') return normalizeManualJson(input);
  if (adapter === 'github_public') return normalizeGitHubPublic(input);
  if (adapter === 'agent_marketplace_readonly') return normalizeAgentMarketplaceReadonly(input);
  throw new Error(`Unsupported demand adapter: ${adapter}`);
}

function defaultVerifierIdForTask(taskType) {
  if (taskType === 'pr_review' || taskType === 'patch_plan') return 'deterministic-verifier';
  if (taskType === 'issue_triage' || taskType === 'agent_task_triage' || taskType === 'repo_readiness_audit') return 'bean-local-triage';
  return 'human-baseline';
}

export function createWorkOrderFromDemandEvent(event) {
  const taskType = event.task_type_guess || 'issue_triage';
  const order = {
    id: stableId('wo', [event.id, taskType, event.required_artifact_guess]),
    demand_event_id: event.id,
    source_ref: event.source_ref,
    source_adapter: event.source_adapter,
    task_type: taskType,
    required_artifact: event.required_artifact_guess,
    context_refs: event.context_refs,
    sensitivity: event.sensitivity_guess,
    verifier_id: defaultVerifierIdForTask(taskType),
    budget_cap: parseBudgetSignal(event.budget_signal),
    deadline: event.deadline_signal,
    approval_required: true,
    source_policy_tags: event.source_policy_tags || [],
  };
  for (const key of ['expected_runner_id', 'expected_policy_decision', 'fixture_group', 'fixture_label']) {
    if (hasOwn(event, key)) order[key] = event[key];
  }
  return order;
}

export function makePolicyDecision(workOrder, runnerProfiles = defaultRunnerProfiles) {
  const blockedReasons = [];
  if (workOrder.sensitivity !== 'public_only') {
    blockedReasons.push('non_public_sensitivity_not_allowed_in_v0');
  }
  if ((workOrder.context_refs || []).some((ref) => /^private:|secret:|file:\/\//i.test(ref))) {
    blockedReasons.push('context_ref_not_public');
  }
  if (!TASK_TYPES.has(workOrder.task_type)) {
    blockedReasons.push('unsupported_task_type');
  }

  if (blockedReasons.length > 0) {
    return {
      work_order_id: workOrder.id,
      decision: 'blocked',
      allowed_context_refs: [],
      allowed_compute_placements: [],
      allowed_supply_classes: [],
      allowed_runner_ids: [],
      required_approvals: ['human_review'],
      blocked_reasons: blockedReasons,
    };
  }

  const internalRunnerIds = runnerProfiles
    .filter((runner) => runner.trust_tier === 'trusted_internal' && runner.supported_task_types.includes(workOrder.task_type))
    .map((runner) => runner.id);
  const sourceTags = new Set(workOrder.source_policy_tags || []);
  const decision = sourceTags.has('marketplace') && workOrder.budget_cap == null
    ? 'shadow_supply_only'
    : 'allowed_internal_only';

  return {
    work_order_id: workOrder.id,
    decision,
    allowed_context_refs: workOrder.context_refs,
    allowed_compute_placements: decision === 'shadow_supply_only' ? [] : ['local_internal', 'internal_session', 'human_internal'],
    allowed_supply_classes: decision === 'shadow_supply_only' ? ['shadow_external_supply'] : ['internal'],
    allowed_runner_ids: decision === 'shadow_supply_only' ? [] : internalRunnerIds,
    required_approvals: ['external_write_before_publish'],
    blocked_reasons: [],
  };
}

function scoreRunner(workOrder, runner) {
  const taskFit = runner.supported_task_types.includes(workOrder.task_type) ? 50 : 0;
  const trust = runner.trust_tier === 'trusted_internal' ? 30 : 0;
  const cost = runner.pricing_claim == null ? 0 : Math.max(0, 10 - runner.pricing_claim);
  const latency = runner.latency_claim == null ? 0 : Math.max(0, 10 - Math.min(runner.latency_claim / 60, 10));
  const verifierBonus = workOrder.verifier_id === runner.id ? 5 : 0;
  return { task_fit: taskFit, trust, cost, latency, verifier_bonus: verifierBonus, total: taskFit + trust + cost + latency + verifierBonus };
}

export function routeWorkOrder(workOrder, policyDecision, runnerProfiles = defaultRunnerProfiles) {
  const candidateRunners = runnerProfiles
    .filter((runner) => runner.supported_task_types.includes(workOrder.task_type))
    .map((runner) => runner.id);
  const rejected = [];
  const rejectReasons = {};
  const eligible = [];
  const scoreComponents = {};

  for (const runner of runnerProfiles.filter((profile) => candidateRunners.includes(profile.id))) {
    const reasons = [];
    if (policyDecision.decision === 'blocked') reasons.push('policy_blocked');
    if (runner.trust_tier === 'shadow_only') reasons.push('shadow_supply_only_no_execution_in_v0');
    if (!policyDecision.allowed_runner_ids.includes(runner.id)) reasons.push('runner_not_allowed_by_policy');
    if (!runner.supported_task_types.includes(workOrder.task_type)) reasons.push('task_type_not_supported');

    if (reasons.length > 0) {
      rejected.push(runner.id);
      rejectReasons[runner.id] = reasons;
    } else {
      eligible.push(runner.id);
      scoreComponents[runner.id] = scoreRunner(workOrder, runner);
    }
  }

  let selectedRunnerId = null;
  let selectedReason = 'no_eligible_runner';
  if (eligible.length > 0) {
    selectedRunnerId = eligible
      .slice()
      .sort((a, b) => scoreComponents[b].total - scoreComponents[a].total || a.localeCompare(b))[0];
    selectedReason = 'highest_deterministic_score_after_policy_gate';
  } else if (policyDecision.decision === 'shadow_supply_only') {
    selectedReason = 'shadow_supply_only_no_execution';
  } else if (policyDecision.decision === 'blocked') {
    selectedReason = 'policy_blocked';
  }

  return {
    work_order_id: workOrder.id,
    candidate_runners: candidateRunners,
    eligible_runners: eligible,
    rejected_runners: rejected,
    reject_reasons: rejectReasons,
    score_components: scoreComponents,
    selected_runner_id: selectedRunnerId,
    manual_override: null,
    selected_reason: selectedReason,
  };
}

export function makeShadowQuotes(workOrder, policyDecision, runnerProfiles = defaultRunnerProfiles) {
  return runnerProfiles
    .filter((runner) => runner.trust_tier === 'shadow_only' && runner.supported_task_types.includes(workOrder.task_type))
    .map((runner) => ({
      quote_id: stableId('sq', [workOrder.id, runner.id]),
      work_order_id: workOrder.id,
      runner_id: runner.id,
      network_source: runner.network_source,
      adapter_type: runner.adapter_type,
      task_type: workOrder.task_type,
      compute_placement: runner.compute_placement,
      pricing_claim: runner.pricing_claim,
      latency_claim: runner.latency_claim,
      context_share: policyDecision.decision === 'blocked' ? 'none_policy_blocked' : 'public_context_only',
      executable_in_v0: false,
      status: 'shadow_only_no_execution',
      blocked_reasons: policyDecision.decision === 'blocked'
        ? policyDecision.blocked_reasons
        : ['external_execution_not_approved_in_v0'],
    }));
}

export function makeCompletionRecord(workOrder, routingDecision) {
  return {
    work_order_id: workOrder.id,
    runner_id: routingDecision.selected_runner_id,
    artifact_refs: routingDecision.selected_runner_id ? [`artifact://planned/${workOrder.id}/${routingDecision.selected_runner_id}`] : [],
    verifier_status: routingDecision.selected_runner_id ? 'not_run_poc_route_only' : 'not_applicable',
    human_acceptance: null,
    review_minutes: null,
    cost_estimate: routingDecision.selected_runner_id ? 0 : null,
    latency_ms: null,
    failure_reason: routingDecision.selected_runner_id ? null : routingDecision.selected_reason,
  };
}

export function ingestDemandInput({ adapter, input, state = defaultState(), ledgerPath = null, now = new Date() }) {
  const demandEvents = normalizeWithAdapter(adapter, input);
  const workOrders = demandEvents.map(createWorkOrderFromDemandEvent);
  state.demand_events.push(...demandEvents);
  state.work_orders.push(...workOrders);

  if (ledgerPath) {
    for (const event of demandEvents) {
      appendLedgerEvent(ledgerPath, makeLedgerEvent({
        eventType: 'demand_event_created',
        sourceType: event.source_type,
        workOrderId: null,
        payload: event,
        now,
      }));
    }
    for (const order of workOrders) {
      appendLedgerEvent(ledgerPath, makeLedgerEvent({
        eventType: 'work_order_created',
        sourceType: demandEvents.find((event) => event.id === order.demand_event_id)?.source_type,
        workOrderId: order.id,
        payload: order,
        now,
      }));
    }
  }

  return { demandEvents, workOrders, state };
}

export function routeAndRecord({ workOrder, state = defaultState(), runnerProfiles = defaultRunnerProfiles, ledgerPath = null, now = new Date() }) {
  if (!state.shadow_quotes) state.shadow_quotes = [];
  const policyDecision = makePolicyDecision(workOrder, runnerProfiles);
  const routingDecision = routeWorkOrder(workOrder, policyDecision, runnerProfiles);
  const shadowQuotes = makeShadowQuotes(workOrder, policyDecision, runnerProfiles);
  const completionRecord = makeCompletionRecord(workOrder, routingDecision);

  state.policy_decisions.push(policyDecision);
  state.routing_decisions.push(routingDecision);
  state.shadow_quotes.push(...shadowQuotes);
  state.completion_records.push(completionRecord);

  if (ledgerPath) {
    for (const [eventType, payload] of [
      ['policy_decision_created', policyDecision],
      ['routing_decision_created', routingDecision],
      ['completion_record_created', completionRecord],
    ]) {
      appendLedgerEvent(ledgerPath, makeLedgerEvent({
        eventType,
        sourceType: 'work_network',
        workOrderId: workOrder.id,
        payload,
        now,
      }));
    }
  }

  return { policyDecision, routingDecision, shadowQuotes, completionRecord, state };
}

function loadFixtureEntries(fixtureInput) {
  const fixtures = [];
  if (fixtureInput.manual_json) fixtures.push({ adapter: 'manual_json', input: fixtureInput.manual_json });
  if (fixtureInput.github_public) fixtures.push({ adapter: 'github_public', input: fixtureInput.github_public });
  if (fixtureInput.agent_marketplace_readonly) fixtures.push({ adapter: 'agent_marketplace_readonly', input: fixtureInput.agent_marketplace_readonly });
  if (fixtureInput.adapter && fixtureInput.input) fixtures.push({ adapter: fixtureInput.adapter, input: fixtureInput.input });
  return fixtures;
}

export function runReplay({ fixtureInput, runnerProfiles = defaultRunnerProfiles, now = new Date() }) {
  const state = defaultState();
  const fixtures = loadFixtureEntries(fixtureInput);
  for (const fixture of fixtures) {
    ingestDemandInput({ adapter: fixture.adapter, input: fixture.input, state, now });
  }
  for (const workOrder of state.work_orders) {
    routeAndRecord({ workOrder, state, runnerProfiles, now });
  }
  const routed = state.routing_decisions.filter((decision) => decision.selected_runner_id).length;
  const blocked = state.policy_decisions.filter((decision) => decision.decision === 'blocked').length;
  const shadowOnly = state.policy_decisions.filter((decision) => decision.decision === 'shadow_supply_only').length;
  const sourceTypes = new Set(state.demand_events.map((event) => event.source_type));
  return {
    generated_at: now.toISOString(),
    totals: {
      demand_events: state.demand_events.length,
      work_orders: state.work_orders.length,
      routed,
      blocked,
      shadow_only: shadowOnly,
      source_classes: sourceTypes.size,
    },
    fixed_baselines: {
      always_codex_supported: state.work_orders.filter((order) => defaultRunnerProfiles.find((runner) => runner.id === 'codex-planner-reviewer').supported_task_types.includes(order.task_type)).length,
      always_local_supported: state.work_orders.filter((order) => defaultRunnerProfiles.find((runner) => runner.id === 'bean-local-triage').supported_task_types.includes(order.task_type)).length,
    },
    state,
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function findRunner(runnerProfiles, runnerId) {
  return runnerProfiles.find((runner) => runner.id === runnerId);
}

function fixedRunnerPrediction(workOrder, policyDecision, runnerId, runnerProfiles) {
  const runner = findRunner(runnerProfiles, runnerId);
  if (!runner) return null;
  if (!runner.supported_task_types.includes(workOrder.task_type)) return null;
  if (!policyDecision.allowed_runner_ids.includes(runnerId)) return null;
  return runnerId;
}

function summarizeSourceCoverage(state, routingByWorkOrderId, policyByWorkOrderId) {
  const coverage = {};
  const eventById = new Map(state.demand_events.map((event) => [event.id, event]));
  for (const order of state.work_orders) {
    const event = eventById.get(order.demand_event_id);
    const key = event?.source_adapter || 'unknown';
    if (!coverage[key]) {
      coverage[key] = {
        demand_events: 0,
        work_orders: 0,
        routed: 0,
        blocked: 0,
        shadow_only: 0,
        labeled_routes: 0,
        route_matches: 0,
      };
    }
    const bucket = coverage[key];
    bucket.demand_events += 1;
    bucket.work_orders += 1;
    const routing = routingByWorkOrderId.get(order.id);
    const policy = policyByWorkOrderId.get(order.id);
    if (routing?.selected_runner_id) bucket.routed += 1;
    if (policy?.decision === 'blocked') bucket.blocked += 1;
    if (policy?.decision === 'shadow_supply_only') bucket.shadow_only += 1;
    if (hasOwn(order, 'expected_runner_id') && order.expected_runner_id !== null) {
      bucket.labeled_routes += 1;
      if (routing?.selected_runner_id === order.expected_runner_id) bucket.route_matches += 1;
    }
  }
  for (const bucket of Object.values(coverage)) {
    bucket.route_accuracy = ratio(bucket.route_matches, bucket.labeled_routes);
  }
  return coverage;
}

function summarizeFixtureGroups(state, routingByWorkOrderId, policyByWorkOrderId) {
  const groups = {};
  for (const order of state.work_orders) {
    const key = order.fixture_group || 'unlabeled';
    if (!groups[key]) groups[key] = { work_orders: 0, routed: 0, blocked: 0, labeled_routes: 0, route_matches: 0 };
    const bucket = groups[key];
    const routing = routingByWorkOrderId.get(order.id);
    const policy = policyByWorkOrderId.get(order.id);
    bucket.work_orders += 1;
    if (routing?.selected_runner_id) bucket.routed += 1;
    if (policy?.decision === 'blocked') bucket.blocked += 1;
    if (hasOwn(order, 'expected_runner_id') && order.expected_runner_id !== null) {
      bucket.labeled_routes += 1;
      if (routing?.selected_runner_id === order.expected_runner_id) bucket.route_matches += 1;
    }
  }
  for (const bucket of Object.values(groups)) {
    bucket.route_accuracy = ratio(bucket.route_matches, bucket.labeled_routes);
  }
  return groups;
}

function summarizeShadowCalibration(state) {
  const byRunner = {};
  const byNetwork = {};
  for (const quote of state.shadow_quotes || []) {
    increment(byRunner, quote.runner_id);
    increment(byNetwork, quote.network_source);
  }
  return {
    total_shadow_quotes: (state.shadow_quotes || []).length,
    executable_quotes_in_v0: (state.shadow_quotes || []).filter((quote) => quote.executable_in_v0).length,
    by_runner_id: byRunner,
    by_network_source: byNetwork,
  };
}

export function evaluateReplay({ fixtureInput, runnerProfiles = defaultRunnerProfiles, now = new Date() }) {
  const replay = runReplay({ fixtureInput, runnerProfiles, now });
  const state = replay.state;
  const routingByWorkOrderId = new Map(state.routing_decisions.map((decision) => [decision.work_order_id, decision]));
  const policyByWorkOrderId = new Map(state.policy_decisions.map((decision) => [decision.work_order_id, decision]));

  const labeledRoutes = state.work_orders.filter((order) => hasOwn(order, 'expected_runner_id') && order.expected_runner_id !== null);
  const routeMatches = labeledRoutes.filter((order) => routingByWorkOrderId.get(order.id)?.selected_runner_id === order.expected_runner_id);

  const noRouteLabels = state.work_orders.filter((order) => hasOwn(order, 'expected_runner_id') && order.expected_runner_id === null);
  const noRouteMatches = noRouteLabels.filter((order) => routingByWorkOrderId.get(order.id)?.selected_runner_id === null);

  const labeledPolicies = state.work_orders.filter((order) => hasOwn(order, 'expected_policy_decision'));
  const policyMatches = labeledPolicies.filter((order) => policyByWorkOrderId.get(order.id)?.decision === order.expected_policy_decision);

  const baselineRunnerIds = ['bean-local-triage', 'codex-planner-reviewer', 'deterministic-verifier', 'human-baseline'];
  const fixedBaselines = Object.fromEntries(baselineRunnerIds.map((runnerId) => {
    const predictions = labeledRoutes.map((order) => fixedRunnerPrediction(order, policyByWorkOrderId.get(order.id), runnerId, runnerProfiles));
    const matches = predictions.filter((prediction, index) => prediction === labeledRoutes[index].expected_runner_id).length;
    const coverage = predictions.filter(Boolean).length;
    return [runnerId, {
      labeled_routes: labeledRoutes.length,
      predicted_routes: coverage,
      route_matches: matches,
      route_accuracy: ratio(matches, labeledRoutes.length),
      route_coverage: ratio(coverage, labeledRoutes.length),
    }];
  }));

  const bestBaseline = Object.entries(fixedBaselines)
    .slice()
    .sort(([, a], [, b]) => (b.route_accuracy ?? -1) - (a.route_accuracy ?? -1))[0];

  const blockedReasonDistribution = {};
  for (const policy of state.policy_decisions) {
    for (const reason of policy.blocked_reasons || []) increment(blockedReasonDistribution, reason);
  }

  const routerAccuracy = ratio(routeMatches.length, labeledRoutes.length);
  const bestBaselineAccuracy = bestBaseline?.[1].route_accuracy ?? null;

  return {
    generated_at: now.toISOString(),
    suite_name: fixtureInput.suite_name || 'work-network-fixtures',
    replay_totals: replay.totals,
    evaluation: {
      labeled_routes: labeledRoutes.length,
      route_matches: routeMatches.length,
      route_accuracy: routerAccuracy,
      no_route_labels: noRouteLabels.length,
      no_route_matches: noRouteMatches.length,
      no_route_accuracy: ratio(noRouteMatches.length, noRouteLabels.length),
      labeled_policies: labeledPolicies.length,
      policy_matches: policyMatches.length,
      policy_accuracy: ratio(policyMatches.length, labeledPolicies.length),
    },
    router_advantage: {
      router_accuracy: routerAccuracy,
      best_fixed_baseline_id: bestBaseline?.[0] || null,
      best_fixed_baseline_accuracy: bestBaselineAccuracy,
      accuracy_delta_vs_best_fixed_baseline: routerAccuracy === null || bestBaselineAccuracy === null
        ? null
        : Number((routerAccuracy - bestBaselineAccuracy).toFixed(4)),
    },
    fixed_baselines: fixedBaselines,
    source_adapter_coverage: summarizeSourceCoverage(state, routingByWorkOrderId, policyByWorkOrderId),
    fixture_group_coverage: summarizeFixtureGroups(state, routingByWorkOrderId, policyByWorkOrderId),
    blocked_reason_distribution: blockedReasonDistribution,
    shadow_calibration: summarizeShadowCalibration(state),
    guardrails: {
      spend_usd: 0,
      external_writes: 0,
      external_executions: 0,
      account_actions: 0,
      live_api_calls: 0,
    },
    state,
  };
}

export function readLedgerLatest(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return null;
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
  return lines.length ? JSON.parse(lines.at(-1)) : null;
}
