import crypto from 'node:crypto';

const LANE_OSS_CODE = 'oss_code';
const LANE_NON_CODE_OPEN_GIG = 'non_code_open_gig';

const DECISION_EXECUTE_LOCAL_TRAINING = 'execute_local_training';
const DECISION_DRAFT_REVIEW_PACKET = 'draft_review_packet';
const DECISION_INSPECT_MORE = 'inspect_more';
const DECISION_REJECT = 'reject';

const GITHUB_SEARCH_QUERY = 'is:issue is:open label:"good first issue" no:assignee';
const LIVE_NEGATIVE_CONTROL_COUNT = 5;

const GUARDRAILS = [
  'no_spend',
  'no_account_creation',
  'no_public_comments',
  'no_pr_submission',
  'no_bounty_claim',
  'no_private_data',
  'no_external_platform_mutation',
];

const BLOCKED_ACTIONS = [
  'public_comment',
  'pull_request_submission',
  'bounty_claim',
  'account_creation',
  'platform_submission',
  'paid_api_call',
  'private_data_export',
];

const HERO_METRIC_DEFINITIONS = [
  {
    id: 'executable_path_rate',
    label: 'Executable path rate',
    unit: 'ratio',
    summary: 'Share of scanned public signals that can become a safe local packet.',
  },
  {
    id: 'time_to_ranked_paths_seconds',
    label: 'Time to ranked paths',
    unit: 'seconds',
    summary: 'Wall-clock time to turn a broad demand scan into ranked agent paths.',
  },
  {
    id: 'unsafe_actions_prevented',
    label: 'Unsafe actions prevented',
    unit: 'count',
    summary: 'Spend, private-data, account, public-write, and external-submission gates stopped before execution.',
  },
];

const PROOF_EXAMPLES = [
  {
    id: 'public_issue_to_packet',
    title: 'Public issue to local packet',
    lane: LANE_OSS_CODE,
    outcome: 'Turn a public bug report into a maintainer-safe patch packet.',
    why_it_matters: 'Agents usually receive an outcome, not a named supplier. The gateway finds a safe first path without posting or spending.',
    expected_signal: 'ranked public issue, task bundle, verifier packet',
    request: {
      source_mode: 'fixture',
      limit: 8,
    },
  },
  {
    id: 'build_vs_use_existing_agent',
    title: 'Build vs use existing agent decision',
    lane: 'agent_path_selection',
    outcome: 'Decide whether to use an existing public agent pattern or build a new one.',
    why_it_matters: 'The gateway can make buy/build routing explicit before the requester pays for compute.',
    expected_signal: 'selected path, local proof plan, human gates',
    request: {
      outcome: {
        goal: 'Find the best agent path for a public repo triage task.',
        task_type: 'agent_task_triage',
        desired_artifact: 'agent_path_packet',
      },
      context_refs: ['https://github.com/example/project/issues/101'],
      policy: { mode: 'free_only' },
    },
  },
  {
    id: 'non_code_public_benchmark',
    title: 'Non-code public benchmark',
    lane: LANE_NON_CODE_OPEN_GIG,
    outcome: 'Use a public benchmark as unpaid training demand.',
    why_it_matters: 'The product should learn from open work even when there is no immediate payout.',
    expected_signal: 'repeatable scoring loop without account creation',
    request: {
      source_mode: 'fixture',
      limit: 4,
    },
  },
  {
    id: 'paid_public_write_block',
    title: 'Paid public write block',
    lane: 'safety_gate',
    outcome: 'Block paid API usage and public posting until an operator approves it.',
    why_it_matters: 'The requester should not absorb surprise compute, platform, or reputation risk.',
    expected_signal: 'blocked route with explicit stop conditions',
    request: {
      outcome: {
        goal: 'Use a paid API and post a comment on the public issue.',
        task_type: 'agent_task_triage',
        desired_artifact: 'blocked_packet',
      },
      context_refs: ['https://github.com/example/project/issues/102'],
      policy: { mode: 'free_only' },
    },
  },
  {
    id: 'private_context_reject',
    title: 'Private context rejection',
    lane: 'safety_gate',
    outcome: 'Reject private or secret-like input in the hosted public demo.',
    why_it_matters: 'The public surface must prove it can say no before it earns trust.',
    expected_signal: 'hosted-demo rejection, no request-body persistence',
    request: {
      outcome: {
        goal: 'Review a private repo issue and create a patch plan.',
        task_type: 'patch_plan',
        desired_artifact: 'blocked_packet',
      },
      context_refs: ['private://github/example/internal-repo/issues/9'],
      policy: { mode: 'free_only' },
    },
  },
];

const FEEDBACK_REASON_CODES = [
  'routed_to_useful_path',
  'blocked_correctly',
  'bad_routing',
  'unclear_value',
  'missing_supplier',
  'too_slow',
];

const FIXTURE_OPPORTUNITIES = [
  {
    id: 'fixture_oss_docs_test',
    lane: LANE_OSS_CODE,
    source_type: 'public_github_issue',
    source_name: 'demo_fixture',
    source_url: 'fixture://open-demand/oss-docs-test',
    repository: 'example/project',
    title: 'Unpaid OSS issue with clear repro and test command',
    body_excerpt: 'Steps to reproduce and expected behavior are documented. Add a focused test and patch packet.',
    labels: ['good first issue', 'bug'],
    comments: 1,
    payout_profile: 'unpaid',
    cash_potential_usd_min: 0,
    cash_potential_usd_max: 0,
    non_cash_value: ['public OSS task signal', 'agent-solvability benchmark'],
    public_signal: true,
    clear_acceptance: true,
    local_verifiable: true,
    repeatable: true,
    agent_executable: true,
    account_required: false,
    identity_required: false,
    external_submission_required: false,
    public_post_required: false,
    spend_required_usd: 0,
    private_data_required: false,
    ai_assistance_policy: 'allowed',
    expected_training_records: ['task_bundle', 'solver_run', 'verification_result', 'learning_outcome'],
  },
  {
    id: 'fixture_public_benchmark',
    lane: LANE_NON_CODE_OPEN_GIG,
    source_type: 'public_benchmark_or_practice_dataset',
    source_name: 'demo_fixture',
    source_url: 'fixture://open-demand/public-benchmark',
    title: 'Unpaid public benchmark with local scoring loop',
    body_excerpt: 'Public benchmark task with local scoring criteria and no account required for the demo packet.',
    labels: ['benchmark', 'practice'],
    comments: 0,
    payout_profile: 'unpaid',
    cash_potential_usd_min: 0,
    cash_potential_usd_max: 0,
    non_cash_value: ['non-code solver benchmark', 'repeatable scoring evidence'],
    public_signal: true,
    clear_acceptance: true,
    local_verifiable: true,
    repeatable: true,
    agent_executable: true,
    account_required: false,
    identity_required: false,
    external_submission_required: false,
    public_post_required: false,
    spend_required_usd: 0,
    private_data_required: false,
    ai_assistance_policy: 'allowed',
    expected_training_records: ['dataset_task_bundle', 'solver_run', 'score_result', 'learning_outcome'],
  },
  {
    id: 'negative_control_private_data',
    lane: LANE_NON_CODE_OPEN_GIG,
    source_type: 'private_dataset_labeling',
    source_name: 'negative_control',
    source_url: 'fixture://open-demand/private-data',
    title: 'Private data labeling task that requires upload',
    body_excerpt: 'Requires uploading private customer files to a platform.',
    labels: ['blocked'],
    comments: 0,
    payout_profile: 'low_paid',
    cash_potential_usd_min: 5,
    cash_potential_usd_max: 25,
    non_cash_value: ['negative example'],
    public_signal: false,
    clear_acceptance: true,
    local_verifiable: false,
    repeatable: true,
    agent_executable: true,
    account_required: true,
    identity_required: true,
    external_submission_required: true,
    public_post_required: false,
    spend_required_usd: 0,
    private_data_required: true,
    ai_assistance_policy: 'unknown',
    expected_training_records: ['privacy_reject'],
  },
  {
    id: 'negative_control_deposit',
    lane: LANE_NON_CODE_OPEN_GIG,
    source_type: 'creative_spec_contest',
    source_name: 'negative_control',
    source_url: 'fixture://open-demand/deposit',
    title: 'Contest requiring deposit before entry',
    body_excerpt: 'Speculative entry requires an upfront payment.',
    labels: ['blocked'],
    comments: 0,
    payout_profile: 'speculative',
    cash_potential_usd_min: 0,
    cash_potential_usd_max: 100,
    non_cash_value: ['negative example'],
    public_signal: true,
    clear_acceptance: false,
    local_verifiable: false,
    repeatable: false,
    agent_executable: true,
    account_required: true,
    identity_required: true,
    external_submission_required: true,
    public_post_required: false,
    spend_required_usd: 25,
    private_data_required: false,
    ai_assistance_policy: 'unknown',
    expected_training_records: ['false_positive'],
  },
];

class OpenDemandError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function stableDigest(value, length = 10) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function safeId(value, limit = 80) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'item').slice(0, limit);
}

function boundedLimit(limit) {
  const parsed = Number(limit || 20);
  if (!Number.isInteger(parsed)) return 20;
  return Math.max(1, Math.min(parsed, 50));
}

function boolScore(value, points) {
  return value ? points : 0;
}

function hardBlockers(opportunity) {
  const blockers = [];
  if (Number(opportunity.spend_required_usd || 0) > 0) blockers.push('spend_required');
  if (opportunity.private_data_required) blockers.push('private_data_required');
  if (opportunity.ai_assistance_policy === 'forbidden') blockers.push('ai_assistance_forbidden');
  return blockers;
}

function humanBlockers(opportunity) {
  const blockers = [];
  for (const [field, reason] of [
    ['account_required', 'account_required'],
    ['identity_required', 'identity_required'],
    ['external_submission_required', 'external_submission_required'],
    ['public_post_required', 'public_post_required'],
  ]) {
    if (opportunity[field]) blockers.push(reason);
  }
  if (['unknown', 'human_must_execute'].includes(opportunity.ai_assistance_policy)) {
    blockers.push(`ai_policy_${opportunity.ai_assistance_policy}`);
  }
  return blockers;
}

function scoreOpportunity(opportunity) {
  const trainabilityScore =
    boolScore(opportunity.public_signal, 18) +
    boolScore(opportunity.clear_acceptance, 18) +
    boolScore(opportunity.local_verifiable, 22) +
    boolScore(opportunity.repeatable, 18) +
    boolScore(opportunity.agent_executable, 14) +
    Math.min((opportunity.expected_training_records || []).length * 3, 10);
  const executionReadinessScore =
    boolScore(opportunity.clear_acceptance, 20) +
    boolScore(opportunity.local_verifiable, 25) +
    boolScore(opportunity.agent_executable, 25) +
    boolScore(!opportunity.account_required, 10) +
    boolScore(!opportunity.external_submission_required, 10) +
    boolScore(!opportunity.private_data_required, 10);
  const blockers = hardBlockers(opportunity);
  const needsHuman = humanBlockers(opportunity);
  let decision = DECISION_REJECT;
  if (blockers.length) decision = DECISION_REJECT;
  else if (executionReadinessScore >= 80 && !needsHuman.length) decision = DECISION_EXECUTE_LOCAL_TRAINING;
  else if (trainabilityScore >= 65) decision = DECISION_DRAFT_REVIEW_PACKET;
  else if (trainabilityScore >= 45) decision = DECISION_INSPECT_MORE;
  return {
    ...opportunity,
    trainability_score: trainabilityScore,
    execution_readiness_score: executionReadinessScore,
    earning_score: Math.min(Number(opportunity.cash_potential_usd_max || 0), 100),
    hard_blockers: blockers,
    human_blockers: needsHuman,
    decision,
    external_actions_allowed: false,
  };
}

function rankOpportunities(opportunities) {
  const ranked = opportunities
    .map((item) => scoreOpportunity(item))
    .sort((left, right) => {
      const leftRejected = left.decision === DECISION_REJECT ? 1 : 0;
      const rightRejected = right.decision === DECISION_REJECT ? 1 : 0;
      if (leftRejected !== rightRejected) return leftRejected - rightRejected;
      if (left.trainability_score !== right.trainability_score) return right.trainability_score - left.trainability_score;
      if (left.execution_readiness_score !== right.execution_readiness_score) return right.execution_readiness_score - left.execution_readiness_score;
      return String(left.id).localeCompare(String(right.id));
    });
  return ranked.map((item, index) => ({ ...item, rank: index + 1 }));
}

function fixtureOpportunities(limit) {
  const rows = [];
  for (let index = 0; rows.length < limit; index += 1) {
    const item = { ...FIXTURE_OPPORTUNITIES[index % FIXTURE_OPPORTUNITIES.length] };
    const cycle = Math.floor(index / FIXTURE_OPPORTUNITIES.length) + 1;
    item.id = `${item.id}_${String(cycle).padStart(2, '0')}`;
    rows.push(item);
  }
  return rows;
}

function negativeControls(limit) {
  const source = FIXTURE_OPPORTUNITIES.filter((item) => item.spend_required_usd || item.private_data_required);
  const rows = [];
  for (let index = 0; rows.length < limit; index += 1) {
    const item = { ...source[index % source.length] };
    item.id = `negative_control_${item.id}_${String(index + 1).padStart(2, '0')}`;
    item.source_name = 'negative_control';
    rows.push(item);
  }
  return rows;
}

function githubIssueToOpportunity(item) {
  const htmlUrl = String(item.html_url || '');
  const repoUrl = String(item.repository_url || '');
  const repoParts = repoUrl ? repoUrl.split('/').slice(-2) : [];
  const repoSlug = repoParts.length === 2 ? repoParts.join('/') : 'unknown/repo';
  const labels = Array.isArray(item.labels) ? item.labels.map((label) => String(label.name || '')).filter(Boolean) : [];
  const title = String(item.title || 'Untitled public issue');
  const body = String(item.body || '');
  const searchable = [title, body, labels.join(' ')].join(' ').toLowerCase();
  const clearAcceptance = /\b(test|repro|expected|acceptance|steps|docs|bug)\b/.test(searchable);
  const localVerifiable = /\b(test|pytest|unit|build|lint|docs|repro|regression)\b/.test(searchable);
  const agentExecutable = !/\b(needs access|secret|credential|private)\b/.test(searchable);
  return {
    id: `github_${safeId(repoSlug)}_${item.number || stableDigest(htmlUrl)}`,
    lane: LANE_OSS_CODE,
    source_type: 'public_github_issue',
    source_name: 'github_search_api',
    source_url: htmlUrl,
    repository: repoSlug,
    title,
    body_excerpt: body.slice(0, 500),
    labels,
    comments: Number(item.comments || 0),
    created_at: item.created_at,
    updated_at: item.updated_at,
    payout_profile: 'unpaid',
    cash_potential_usd_min: 0,
    cash_potential_usd_max: 0,
    non_cash_value: ['public OSS task signal', 'agent-solvability benchmark', 'maintainer-safe packet corpus'],
    public_signal: true,
    clear_acceptance: clearAcceptance,
    local_verifiable: localVerifiable,
    repeatable: true,
    agent_executable: agentExecutable,
    account_required: false,
    identity_required: false,
    external_submission_required: false,
    public_post_required: false,
    spend_required_usd: 0,
    private_data_required: false,
    ai_assistance_policy: 'allowed',
    expected_training_records: ['task_bundle', 'solver_run', 'verification_result', 'learning_outcome'],
  };
}

async function discoverLiveGithub(limit, query, { fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({ q: query || GITHUB_SEARCH_QUERY, per_page: String(Math.min(limit, 50)) });
  const response = await fetchImpl(`https://api.github.com/search/issues?${params.toString()}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'bean-open-demand-public-demo',
    },
  });
  if (!response.ok) {
    throw new OpenDemandError(`github_search_failed_${response.status}`, 502);
  }
  const payload = await response.json();
  return (payload.items || []).slice(0, limit).map((item) => githubIssueToOpportunity(item));
}

async function discoverOpportunities({ sourceMode, limit, query, fetchImpl }) {
  if (sourceMode === 'fixture') {
    return [fixtureOpportunities(limit), { source_mode: 'fixture', network_read_only: false }];
  }
  try {
    const live = await discoverLiveGithub(limit, query, { fetchImpl });
    if (live.length) {
      const controlCount = Math.min(LIVE_NEGATIVE_CONTROL_COUNT, Math.max(Math.floor(limit / 10), 1), limit);
      const liveCount = Math.max(limit - controlCount, 0);
      return [
        [...live.slice(0, liveCount), ...negativeControls(controlCount)],
        {
          source_mode: 'live_github_with_negative_controls',
          network_read_only: true,
          query: query || GITHUB_SEARCH_QUERY,
          negative_control_count: controlCount,
        },
      ];
    }
  } catch (error) {
    if (sourceMode === 'live-github') throw error;
  }
  return [fixtureOpportunities(limit), { source_mode: 'fixture_fallback', network_read_only: false }];
}

function average(values) {
  const numbers = values.map((value) => Number(value || 0));
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / Math.max(numbers.length, 1)) * 100) / 100;
}

function roundRatio(value) {
  return Math.round(value * 1000) / 1000;
}

function estimateUnsafeActionsPrevented(opportunities) {
  return opportunities.reduce((total, item) => {
    const hard = item.hard_blockers?.length || 0;
    const human = item.human_blockers?.length || 0;
    const requiredExternalGates = [
      item.account_required,
      item.identity_required,
      item.external_submission_required,
      item.public_post_required,
      Number(item.spend_required_usd || 0) > 0,
      item.private_data_required,
    ].filter(Boolean).length;
    return total + hard + human + requiredExternalGates;
  }, 0);
}

function heroMetrics(opportunities, { scanDurationMs = 0, bundleCount = 0, reportCount = 0, feedbackRecords = [] } = {}) {
  const selected = opportunities.filter((item) => item.decision !== DECISION_REJECT);
  const selectedZeroSpend = selected.filter((item) => Number(item.spend_required_usd || 0) === 0 && !item.private_data_required);
  return {
    schema_version: 'bean.open_demand_hero_metrics.v1',
    measurement_scope: 'metadata_only_public_demo',
    executable_path_rate: roundRatio(selected.length / Math.max(opportunities.length, 1)),
    zero_spend_candidate_count: selectedZeroSpend.length,
    time_to_ranked_paths_seconds: Math.round((scanDurationMs / 1000) * 100) / 100,
    unsafe_actions_prevented: estimateUnsafeActionsPrevented(opportunities),
    ready_packet_count: bundleCount,
    evidence_packet_count: reportCount,
    useful_feedback_count: feedbackRecords.filter((item) => item.helpful === true).length,
    definitions: HERO_METRIC_DEFINITIONS,
    caveat: 'Prototype metrics are public-demo proof signals, not revenue, customer SLA, or production reliability claims.',
  };
}

function metrics(opportunities, scanDurationMs = 0) {
  const selected = opportunities.filter((item) => item.decision !== DECISION_REJECT);
  const rejected = opportunities.filter((item) => item.decision === DECISION_REJECT);
  const selectedAverage = average(selected.map((item) => item.trainability_score));
  const rejectedAverage = average(rejected.map((item) => item.trainability_score));
  return {
    opportunities_scanned: opportunities.length,
    selected_candidates: selected.length,
    rejected_candidates: rejected.length,
    candidate_precision_top_10: Math.round((opportunities.slice(0, 10).filter((item) => item.decision !== DECISION_REJECT).length / Math.max(Math.min(10, opportunities.length), 1)) * 1000) / 1000,
    guardrail_violations: opportunities.filter((item) => item.external_actions_allowed).length,
    attempted_average_trainability: selectedAverage,
    rejected_average_trainability: rejectedAverage,
    scoring_signal_observed: Boolean(rejected.length) && selectedAverage > rejectedAverage,
    scan_duration_ms: scanDurationMs,
  };
}

function publicRepoCloneUrl(sourceUrl) {
  const match = String(sourceUrl || '').match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)(?:\/|$)/);
  if (!match) return null;
  return `https://github.com/${match[1]}/${match[2]}.git`;
}

function buildLocalProofPlan(bundle) {
  const cloneUrl = publicRepoCloneUrl(bundle.source_url);
  const isCode = bundle.lane === LANE_OSS_CODE;
  const publicSource = cloneUrl || bundle.source_url || 'fixture-backed public source';
  return {
    schema_version: 'bean.local_proof_plan.v1',
    scope: 'public_or_fixture_only',
    goal: 'Prove whether the selected path can be executed locally before any external submission.',
    source_to_read: publicSource,
    phases: isCode
      ? [
          'Confirm issue and repository are public.',
          'Clone or inspect the public repository in an isolated workspace.',
          'Identify the smallest repro, docs, lint, or test command from public metadata.',
          'Draft a patch or skip rationale locally.',
          'Run the cheapest local verifier available.',
          'Stop before branch push, public PR, issue comment, bounty claim, or paid compute.',
        ]
      : [
          'Confirm the benchmark or task source is public.',
          'Capture scoring criteria and allowed tooling.',
          'Run a baseline local solution or feasibility check.',
          'Record repeatability notes and failure modes.',
          'Stop before account creation, platform submission, identity verification, or paid compute.',
        ],
    suggested_commands: isCode
      ? [
          cloneUrl ? `git clone ${cloneUrl}` : 'inspect public source URL manually',
          'rg -n "test|pytest|vitest|npm test|make test|lint" .',
          'run the smallest discovered local check',
        ]
      : [
          'download or inspect only public fixture/benchmark inputs',
          'run local scorer or create a scoring checklist',
          'record baseline result and repeatability notes',
        ],
    stop_conditions: [
      'spend_required',
      'private_data_required',
      'account_creation_required',
      'public_post_required',
      'external_submission_required',
      'bounty_claim_required',
    ],
  };
}

function buildTaskBundle(opportunity, rank = 0) {
  const taskId = `open-demand-task-${stableDigest(opportunity.id)}`;
  const isCode = opportunity.lane === LANE_OSS_CODE;
  const bundle = {
    schema_version: 'bean.open_demand_task_bundle.v1',
    task_id: taskId,
    rank,
    opportunity_id: opportunity.id,
    lane: opportunity.lane,
    source_type: opportunity.source_type,
    source_url: opportunity.source_url || '',
    title: opportunity.title || '',
    problem_statement: opportunity.body_excerpt || opportunity.title || '',
    expected_output: isCode
      ? 'Maintainer-safe patch packet or skip rationale; no public PR/comment without approval.'
      : 'Local benchmark/research packet with reproducibility notes; no submission without approval.',
    verification_plan: isCode
      ? [
          'Verify task source is public.',
          'Verify no account, private data, or spend is required for local analysis.',
          'Generate reproduction/test command candidates from issue text.',
          'Stop at local packet unless Stephen approves external submission.',
        ]
      : [
          'Verify source is public or fixture-backed.',
          'Verify local scoring or review criteria exist.',
          'Generate a baseline solution or feasibility packet.',
          'Stop before account creation, identity-gated entry, or platform submission.',
        ],
    scores: {
      trainability: opportunity.trainability_score || 0,
      execution_readiness: opportunity.execution_readiness_score || 0,
      earning: opportunity.earning_score || 0,
    },
    guardrails: GUARDRAILS,
    blocked_actions: BLOCKED_ACTIONS,
    human_blockers: opportunity.human_blockers || [],
    hard_blockers: opportunity.hard_blockers || [],
    external_actions_allowed: false,
  };
  return {
    ...bundle,
    local_proof_plan: buildLocalProofPlan(bundle),
  };
}

function verifyTaskBundle(bundle) {
  const failures = [];
  for (const field of ['task_id', 'opportunity_id', 'lane', 'title', 'expected_output', 'verification_plan', 'guardrails']) {
    if (!bundle[field]) failures.push(`missing_${field}`);
  }
  if (bundle.external_actions_allowed) failures.push('external_actions_allowed');
  if (!bundle.guardrails?.includes('no_spend')) failures.push('missing_no_spend_guardrail');
  if (bundle.hard_blockers?.length) failures.push('hard_blockers_present');
  return { passed: failures.length === 0, failures };
}

function runStaticSolver(bundle, attemptIndex) {
  const runId = `solver-run-${stableDigest(`${bundle.task_id}${attemptIndex}`)}`;
  const verifier = verifyTaskBundle(bundle);
  let status = 'failed_verification';
  let accepted = false;
  if (verifier.passed && !bundle.human_blockers?.length) {
    status = 'verified_packet_ready';
    accepted = true;
  } else if (verifier.passed) {
    status = 'review_packet_ready_human_gated';
    accepted = true;
  }
  return {
    schema_version: 'bean.open_demand_solver_run.v1',
    run_id: runId,
    task_id: bundle.task_id,
    runner: 'static_public_demo_solver',
    attempt_index: attemptIndex,
    status,
    accepted,
    external_actions_performed: false,
    verifier: { name: 'static_bundle_verifier', passed: verifier.passed, failures: verifier.failures },
    learning_signal: {
      route_was_safe: !bundle.external_actions_allowed,
      human_gated: Boolean(bundle.human_blockers?.length),
      trainability: bundle.scores?.trainability || 0,
      execution_readiness: bundle.scores?.execution_readiness || 0,
    },
  };
}

function buildEvidencePacket(bundle, run) {
  return {
    schema_version: 'bean.open_demand_evidence_packet.v1',
    packet_id: `evidence-${stableDigest(run.run_id)}`,
    task_id: bundle.task_id,
    run_id: run.run_id,
    title: bundle.title,
    source_url: bundle.source_url || '',
    why_selected: `Trainability ${bundle.scores.trainability}; readiness ${bundle.scores.execution_readiness}.`,
    solver_status: run.status,
    verifier_status: run.verifier?.passed ? 'passed' : 'failed',
    maintainer_safe_summary: 'Prototype packet only. No PR, issue comment, bounty claim, account action, spend, or external submission has been performed.',
    tests_or_checks: bundle.verification_plan || [],
    known_risks: bundle.human_blockers?.length ? bundle.human_blockers : ['Patch quality has not been proven by a real repository test run yet.'],
    submission_state: 'not_submitted_human_approval_required',
    blocked_actions: BLOCKED_ACTIONS,
    external_actions_performed: false,
  };
}

function publicScan(state) {
  const feedbackRecords = state.feedback_records || [];
  return {
    schema_version: state.schema_version,
    created_at: state.created_at,
    source: state.source || {},
    guardrails: state.guardrails || GUARDRAILS,
    external_actions_performed: false,
    metrics: state.metrics || {},
    hero_metrics: heroMetrics(state.opportunities || [], {
      scanDurationMs: state.metrics?.scan_duration_ms || 0,
      bundleCount: Object.keys(state.bundles || {}).length,
      reportCount: Object.keys(state.reports || {}).length,
      feedbackRecords,
    }),
    opportunities: state.opportunities || [],
    bundles: Object.values(state.bundles || {}),
    runs: Object.values(state.runs || {}),
    reports: Object.values(state.reports || {}),
    feedback: {
      total: feedbackRecords.length,
      helpful: feedbackRecords.filter((item) => item.helpful === true).length,
      not_helpful: feedbackRecords.filter((item) => item.helpful === false).length,
    },
  };
}

function findById(items, id) {
  return items.find((item) => item.id === id) || null;
}

function findByTaskIdSource(items, taskId) {
  return items.find((item) => `open-demand-task-${stableDigest(item.id)}` === taskId) || null;
}

function normalizeFeedback(input = {}) {
  const allowedKeys = new Set([
    'target_type',
    'target_id',
    'helpful',
    'route_useful',
    'would_have_built_manually',
    'saved_time_estimate_minutes',
    'reason_code',
  ]);
  const forbidden = Object.keys(input).filter((key) => !allowedKeys.has(key) || /comment|note|text|body|email|secret|token|password|private/i.test(key));
  if (forbidden.length) {
    throw new OpenDemandError(`feedback_accepts_metadata_only:${forbidden.join(',')}`, 400);
  }
  const targetType = String(input.target_type || 'open_demand_route');
  if (!['route', 'open_demand_scan', 'open_demand_opportunity', 'open_demand_task', 'open_demand_report', 'open_demand_route'].includes(targetType)) {
    throw new OpenDemandError('invalid_feedback_target_type', 400);
  }
  const reasonCode = String(input.reason_code || 'routed_to_useful_path');
  if (!FEEDBACK_REASON_CODES.includes(reasonCode)) {
    throw new OpenDemandError('invalid_feedback_reason_code', 400);
  }
  const savedMinutes = Math.max(0, Math.min(Number(input.saved_time_estimate_minutes || 0), 240));
  return {
    schema_version: 'bean.open_demand_feedback.v1',
    feedback_id: `feedback-${stableDigest(JSON.stringify(input), 16)}`,
    created_at: Math.floor(Date.now() / 1000),
    target_type: targetType,
    target_id: safeId(input.target_id || 'unknown', 120),
    helpful: typeof input.helpful === 'boolean' ? input.helpful : null,
    route_useful: typeof input.route_useful === 'boolean' ? input.route_useful : null,
    would_have_built_manually: typeof input.would_have_built_manually === 'boolean' ? input.would_have_built_manually : null,
    saved_time_estimate_minutes: savedMinutes,
    reason_code: reasonCode,
    stored_fields: [...allowedKeys].sort(),
    free_text_stored: false,
  };
}

function createOpenDemandService({ fetchImpl = fetch } = {}) {
  let state = null;
  const feedbackRecords = [];
  async function scan({ source_mode: sourceMode = 'fixture', limit = 20, query = GITHUB_SEARCH_QUERY } = {}) {
    const started = Date.now();
    const bounded = boundedLimit(limit);
    if (!['fixture', 'live-github', 'auto'].includes(sourceMode)) {
      throw new OpenDemandError('source_mode must be fixture, live-github, or auto');
    }
    const [opportunities, source] = await discoverOpportunities({ sourceMode, limit: bounded, query, fetchImpl });
    const ranked = rankOpportunities(opportunities);
    const scanDurationMs = Date.now() - started;
    state = {
      schema_version: 'bean.open_demand_scan.v1',
      created_at: Math.floor(Date.now() / 1000),
      source,
      guardrails: GUARDRAILS,
      external_actions_performed: false,
      metrics: metrics(ranked, scanDurationMs),
      opportunities: ranked,
      bundles: {},
      runs: {},
      reports: {},
      feedback_records: feedbackRecords,
    };
    return publicScan(state);
  }

  async function latest() {
    if (!state) return scan({ source_mode: 'fixture', limit: 12 });
    return publicScan(state);
  }

  async function bundle(opportunityId) {
    const current = await latest();
    const opportunity = findById(current.opportunities || [], opportunityId);
    if (!opportunity) throw new OpenDemandError('opportunity not found', 404);
    const taskBundle = buildTaskBundle(opportunity, opportunity.rank || 0);
    state.bundles[taskBundle.task_id] = taskBundle;
    return { bundle: taskBundle, guardrails: GUARDRAILS };
  }

  async function run(taskId) {
    await latest();
    let taskBundle = state.bundles[taskId];
    if (!taskBundle) {
      const opportunity = findByTaskIdSource(state.opportunities || [], taskId);
      if (opportunity) {
        taskBundle = buildTaskBundle(opportunity, opportunity.rank || 0);
        state.bundles[taskBundle.task_id] = taskBundle;
      }
    }
    if (!taskBundle) throw new OpenDemandError('task bundle not found', 404);
    const solverRun = runStaticSolver(taskBundle, Object.keys(state.runs).length + 1);
    const report = buildEvidencePacket(taskBundle, solverRun);
    state.runs[solverRun.run_id] = solverRun;
    state.reports[taskId] = report;
    return { run: solverRun, report, guardrails: GUARDRAILS };
  }

  async function report(taskId) {
    await latest();
    const found = state.reports[taskId];
    if (!found) throw new OpenDemandError('report not found', 404);
    return { report: found };
  }

  function examples() {
    return {
      schema_version: 'bean.open_demand_examples.v1',
      examples: PROOF_EXAMPLES,
      hero_metric_definitions: HERO_METRIC_DEFINITIONS,
      guardrails: GUARDRAILS,
      external_actions_allowed: false,
    };
  }

  function feedback(input) {
    const record = normalizeFeedback(input);
    feedbackRecords.push(record);
    if (state) state.feedback_records = feedbackRecords;
    return {
      accepted: true,
      feedback: record,
      feedback_summary: {
        total: feedbackRecords.length,
        helpful: feedbackRecords.filter((item) => item.helpful === true).length,
        not_helpful: feedbackRecords.filter((item) => item.helpful === false).length,
      },
      request_body_persistence: false,
      free_text_stored: false,
    };
  }

  return {
    health() {
      return {
        ok: true,
        service: 'bean-open-demand',
        guardrails: GUARDRAILS,
        external_actions_allowed: false,
        latest_available: Boolean(state),
        persistence: 'memory_only',
        hero_metric_definitions: HERO_METRIC_DEFINITIONS,
      };
    },
    examples,
    latest,
    opportunities: latest,
    scan,
    bundle,
    run,
    report,
    feedback,
  };
}

export {
  BLOCKED_ACTIONS,
  DECISION_REJECT,
  FEEDBACK_REASON_CODES,
  GITHUB_SEARCH_QUERY,
  GUARDRAILS,
  HERO_METRIC_DEFINITIONS,
  OpenDemandError,
  PROOF_EXAMPLES,
  buildTaskBundle,
  createOpenDemandService,
  githubIssueToOpportunity,
  heroMetrics,
  negativeControls,
  rankOpportunities,
  scoreOpportunity,
  verifyTaskBundle,
};
