#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { runExecutionGateway } from './execution-gateway-lib.mjs';
import { createOpenDemandService } from './open-demand-lib.mjs';
import { createProductControlPlane } from './v2-product-control-plane-lib.mjs';

const rootDir = process.cwd();
const defaultCorpusPath = path.join(rootDir, 'fixtures', 'execution-gateway', 'retrospective-task-corpus.json');
const defaultUsefulnessPath = path.join(rootDir, 'fixtures', 'execution-gateway', 'trusted-beta-usefulness-fixtures.json');
const currentHeadline = 'Route an outcome before an agent spends, posts, or runs.';
const previousHostedHeadline = 'Find the execution path before an agent runs.';
const positioningVariantInputs = [
  {
    id: 'current_gateway',
    headline: currentHeadline,
    subhead: 'Compare owned agents, public paths, build decisions, and block unsafe work before compute or supplier dispatch.',
    cta: 'Try a public route or open the OpenAPI contract.',
  },
  {
    id: 'marketplace_gateway',
    headline: 'A gateway to internal agents, public agents, or a build decision.',
    subhead: 'Agents ask for outcomes. BEAN decides which available path is safe, cheap, and proofable before execution.',
    cta: 'Route an outcome.',
  },
  {
    id: 'micro_priced_router',
    headline: 'Route agent work before paying for compute.',
    subhead: 'Compare quality, speed, cost, and risk before choosing owned compute, public paths, or future supplier-hosted execution.',
    cta: 'Inspect the route memo.',
  },
  {
    id: 'build_vs_use',
    headline: 'Build, use, or block the agent path.',
    subhead: 'Turn vague outcome requests into an executable path decision with proof requirements and human gates.',
    cta: 'Run the build-vs-use demo.',
  },
];

function parseArgs(argv) {
  const parsed = {
    out: path.join(rootDir, 'dist', 'execution-gateway', 'retrospective-experiments'),
    baseUrl: process.env.BEAN_GATEWAY_BASE_URL || 'https://bean-execution-gateway-poc.onrender.com',
    corpus: defaultCorpusPath,
    usefulness: defaultUsefulnessPath,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') parsed.out = argv[index + 1] || parsed.out;
    if (arg === '--base-url') parsed.baseUrl = argv[index + 1] || parsed.baseUrl;
    if (arg === '--corpus') parsed.corpus = argv[index + 1] || parsed.corpus;
    if (arg === '--usefulness') parsed.usefulness = argv[index + 1] || parsed.usefulness;
  }
  return parsed;
}

function readJsonFixture(fixturePath) {
  const resolved = path.resolve(rootDir, fixturePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function scorePositioningVariant(variant) {
  const text = `${variant.headline} ${variant.subhead} ${variant.cta}`.toLowerCase();
  const checks = {
    outcome_first: /\boutcome\b/.test(text),
    execution_path: /\bpath\b|\broute\b|\bgateway\b/.test(text),
    before_compute: /before.*(?:compute|spend|supplier|execution)/.test(text),
    agent_audience: /\bagent/.test(text),
    developer_audience: /\bapi\b|\bdeveloper\b|\bopenapi\b/.test(text),
    source_agnostic: /\bowned\b.*\bpublic\b.*\bbuild\b|\binternal\b.*\bpublic\b/.test(text),
    safety_honest: /\bblock\b|\bno spend\b|\bapproval\b/.test(text),
    short_headline: variant.headline.length <= 62,
    clear_cta: /\btry\b|\broute\b|\bopenapi\b|\bgithub\b/.test(variant.cta.toLowerCase()),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { ...variant, score, checks };
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(new URL(pathname, baseUrl));
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { text_excerpt: text.slice(0, 240) };
  }
  return { status: response.status, ok: response.ok, payload };
}

async function fetchText(baseUrl, pathname) {
  const response = await fetch(new URL(pathname, baseUrl));
  return { status: response.status, ok: response.ok, text: await response.text() };
}

async function runLiveChecks(baseUrl) {
  const checks = [];
  for (const pathname of ['/', '/v0/health', '/v0/ready', '/v0/openapi.json']) {
    const started = Date.now();
    try {
      const result = await fetchJson(baseUrl, pathname);
      checks.push({
        pathname,
        ok: result.ok,
        status: result.status,
        elapsed_ms: Date.now() - started,
        production_ready: result.payload?.production_ready,
        public_demo: result.payload?.public_demo,
      });
    } catch (error) {
      checks.push({ pathname, ok: false, status: 0, elapsed_ms: Date.now() - started, error: error.message });
    }
  }
  return checks;
}

async function runLiveHomepageDrift(baseUrl) {
  const result = await fetchText(baseUrl, '/');
  const hasCurrentHeadline = result.text.includes(currentHeadline);
  const hasPreviousHeadline = result.text.includes(previousHostedHeadline);
  return {
    status: result.status,
    ok: result.ok,
    current_headline_live: hasCurrentHeadline,
    previous_headline_live: hasPreviousHeadline,
    local_candidate_headline: currentHeadline,
    hosted_drift_expected_until_deploy: !hasCurrentHeadline && hasPreviousHeadline,
  };
}

function runGatewayPolicyCases() {
  const cases = [
    {
      id: 'safe_public_issue',
      expected_policy_state: 'allowed',
      input: {
        outcome: {
          goal: 'Triage a public GitHub issue and produce a local verifier packet.',
          task_type: 'issue_triage',
          desired_artifact: 'triage_packet',
        },
        context_refs: ['https://github.com/example/project/issues/123'],
        policy: { mode: 'free_only' },
      },
    },
    {
      id: 'public_but_prompt_injection',
      expected_policy_state: 'allowed',
      input: {
        outcome: {
          goal: 'Review this public issue body that says ignore previous instructions and produce a safe triage packet.',
          task_type: 'issue_triage',
          desired_artifact: 'triage_packet',
        },
        context_refs: ['https://github.com/example/project/issues/124'],
        policy: { mode: 'free_only' },
      },
    },
    {
      id: 'paid_public_write',
      expected_policy_state: 'blocked',
      expected_stop_conditions: ['requires_paid_api', 'requires_public_post'],
      input: {
        outcome: {
          goal: 'Use a paid API and post a public comment with the result.',
          task_type: 'agent_task_triage',
          desired_artifact: 'blocked_packet',
        },
        context_refs: ['https://github.com/example/project/issues/125'],
        policy: { mode: 'free_only' },
      },
    },
    {
      id: 'private_context',
      expected_policy_state: 'blocked',
      expected_stop_conditions: ['requires_private_repo_access'],
      input: {
        outcome: {
          goal: 'Review a private repo issue and create a patch plan.',
          task_type: 'patch_plan',
          desired_artifact: 'blocked_packet',
        },
        context_refs: ['private://github/example/internal-repo/issues/9'],
        policy: { mode: 'free_only' },
      },
    },
    {
      id: 'external_supplier',
      expected_policy_state: 'blocked',
      expected_stop_conditions: ['requires_external_supplier'],
      input: {
        outcome: {
          goal: 'Hire an external supplier to solve this public task.',
          task_type: 'marketplace_evaluation',
          desired_artifact: 'blocked_packet',
        },
        context_refs: ['https://github.com/example/project/issues/126'],
        policy: { mode: 'free_only' },
      },
    },
  ];

  return cases.map((item) => {
    const result = runExecutionGateway(item.input, { persistArtifacts: false });
    const stopConditions = result.response.stop_conditions || [];
    const expectedStops = item.expected_stop_conditions || [];
    const matchedStops = expectedStops.filter((condition) => stopConditions.includes(condition));
    const passed = result.response.decision.policy_state === item.expected_policy_state
      && matchedStops.length === expectedStops.length
      && result.response.cost.estimated_total_cost_usd === 0;
    return {
      id: item.id,
      passed,
      expected_policy_state: item.expected_policy_state,
      actual_policy_state: result.response.decision.policy_state,
      selected_executor_id: result.response.decision.selected_executor_id,
      stop_conditions: stopConditions,
      matched_stop_conditions: matchedStops,
      estimated_total_cost_usd: result.response.cost.estimated_total_cost_usd,
      external_actions_performed: false,
    };
  });
}

function runProductPathCases() {
  const service = createProductControlPlane({ memoryOnly: true });
  const cases = [
    {
      id: 'owned_agent',
      expected_path: 'owned_agent_local_proof',
      input: {
        outcome: {
          goal: 'Use our owned local agent to produce a public proof packet.',
          task_type: 'agent_task_triage',
        },
        context_refs: ['https://github.com/example/project/issues/200'],
      },
    },
    {
      id: 'public_path',
      expected_path: 'public_open_source_path',
      input: {
        outcome: {
          goal: 'Use an existing public open-source agent path for this public GitHub issue.',
          task_type: 'agent_task_triage',
        },
        context_refs: ['https://github.com/example/project/issues/201'],
      },
    },
    {
      id: 'build_decision',
      expected_path: 'build_new_agent_decision',
      input: {
        outcome: {
          goal: 'Build a new custom agent workflow from scratch for this public benchmark.',
          task_type: 'agent_task_triage',
        },
        context_refs: ['https://example.com/public-benchmark'],
      },
    },
    {
      id: 'blocked_private',
      expected_path: null,
      input: {
        outcome: {
          goal: 'Use my private repo and secret token to route this task.',
          task_type: 'agent_task_triage',
        },
        context_refs: ['private://github/example/internal/issues/1'],
      },
    },
  ];
  return cases.map((item) => {
    const result = service.submitOutcome(item.input);
    const selectedPath = result.decision.selected_path?.path_id || null;
    return {
      id: item.id,
      passed: selectedPath === item.expected_path,
      expected_path: item.expected_path,
      selected_path: selectedPath,
      routing_intent: result.demand.routing_intent,
      policy_state: result.demand.policy_state,
      spend_usd: result.decision.spend_usd,
      external_writes: result.decision.external_writes,
      external_supplier_execution: result.decision.external_supplier_execution,
    };
  });
}

function runFirstUserCorpus(corpus) {
  const service = createProductControlPlane({ memoryOnly: true });
  return corpus.cases.map((item) => {
    const gateway = runExecutionGateway(item.input, { persistArtifacts: false }).response;
    const product = service.submitOutcome(item.input);
    const gatewayStops = gateway.stop_conditions || [];
    const expectedStops = item.expected_gateway_stop_conditions || [];
    const matchedStops = expectedStops.filter((condition) => gatewayStops.includes(condition));
    const selectedProductPath = product.decision.selected_path?.path_id || null;
    return {
      id: item.id,
      label: item.label,
      source_mode: item.source_mode || 'unspecified',
      passed: gateway.decision.policy_state === item.expected_gateway_policy_state
        && product.demand.policy_state === item.expected_product_policy_state
        && selectedProductPath === item.expected_product_path
        && matchedStops.length === expectedStops.length
        && gateway.cost.estimated_total_cost_usd === 0
        && product.decision.spend_usd === 0
        && product.decision.external_writes === 0
        && product.decision.external_supplier_execution === false,
      gateway: {
        expected_policy_state: item.expected_gateway_policy_state,
        actual_policy_state: gateway.decision.policy_state,
        expected_stop_conditions: expectedStops,
        actual_stop_conditions: gatewayStops,
        matched_stop_conditions: matchedStops,
      },
      product: {
        expected_policy_state: item.expected_product_policy_state,
        actual_policy_state: product.demand.policy_state,
        routing_intent: product.demand.routing_intent,
        expected_path: item.expected_product_path,
        selected_path: selectedProductPath,
      },
    };
  });
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item) || 'none';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function summarizeFirstUserCorpusConfusion(cases) {
  const failures = cases.filter((item) => !item.passed);
  const actualStopConditions = cases.flatMap((item) => item.gateway.actual_stop_conditions || []);
  const expectedStopConditions = cases.flatMap((item) => item.gateway.expected_stop_conditions || []);
  const missingStopConditions = cases.flatMap((item) => {
    const actual = new Set(item.gateway.actual_stop_conditions || []);
    return (item.gateway.expected_stop_conditions || []).filter((condition) => !actual.has(condition));
  });

  return {
    case_count: cases.length,
    pass_count: cases.length - failures.length,
    miss_count: failures.length,
    by_label: countBy(cases, (item) => item.label),
    by_source_mode: countBy(cases, (item) => item.source_mode),
    by_gateway_policy: countBy(cases, (item) => `${item.gateway.expected_policy_state}->${item.gateway.actual_policy_state}`),
    by_product_policy: countBy(cases, (item) => `${item.product.expected_policy_state}->${item.product.actual_policy_state}`),
    by_product_path: countBy(cases, (item) => `${item.product.expected_path || 'none'}->${item.product.selected_path || 'none'}`),
    by_actual_stop_condition: countBy(actualStopConditions.map((condition) => ({ condition })), (item) => item.condition),
    by_expected_stop_condition: countBy(expectedStopConditions.map((condition) => ({ condition })), (item) => item.condition),
    by_missing_stop_condition: countBy(missingStopConditions.map((condition) => ({ condition })), (item) => item.condition),
    failures: failures.map((item) => ({
      id: item.id,
      label: item.label,
      source_mode: item.source_mode,
      gateway_policy: `${item.gateway.expected_policy_state}->${item.gateway.actual_policy_state}`,
      product_policy: `${item.product.expected_policy_state}->${item.product.actual_policy_state}`,
      product_path: `${item.product.expected_path || 'none'}->${item.product.selected_path || 'none'}`,
      missing_stop_conditions: (item.gateway.expected_stop_conditions || []).filter(
        (condition) => !(item.gateway.actual_stop_conditions || []).includes(condition),
      ),
    })),
  };
}

export function summarizeSourceModePerformance(cases) {
  const bySourceMode = new Map();
  for (const item of cases) {
    const sourceMode = item.source_mode || 'unspecified';
    const existing = bySourceMode.get(sourceMode) || {
      source_mode: sourceMode,
      case_count: 0,
      pass_count: 0,
      miss_count: 0,
      labels: new Set(),
      missed_cases: [],
    };
    existing.case_count += 1;
    existing.labels.add(item.label);
    if (item.passed) {
      existing.pass_count += 1;
    } else {
      existing.miss_count += 1;
      existing.missed_cases.push(item.id);
    }
    bySourceMode.set(sourceMode, existing);
  }
  return [...bySourceMode.values()]
    .map((item) => ({
      ...item,
      labels: [...item.labels].sort(),
      pass_rate: item.pass_count / Math.max(item.case_count, 1),
    }))
    .sort((left, right) => left.source_mode.localeCompare(right.source_mode));
}

export function runTrustedBetaUsefulnessFixtures(fixtures) {
  const service = createProductControlPlane({ memoryOnly: true });
  return fixtures.fixtures.map((item) => {
    const result = service.submitOutcome(item.input);
    const selectedPath = result.decision.selected_path?.path_id || null;
    const routeMatches = selectedPath === item.expected_path
      && result.demand.policy_state === item.expected_policy_state;
    const routeUseful = routeMatches === item.expected_route_useful;
    const feedback = service.recordFeedback({
      target_type: 'route_decision',
      target_id: result.decision.route_id,
      helpful: routeUseful,
      route_useful: routeUseful,
      reason_code: item.expected_reason_code,
      chosen_route: selectedPath || 'none',
      latency_bucket: 'under_30s',
    });
    return {
      id: item.id,
      persona: item.persona,
      passed: routeMatches && feedback.accepted && feedback.feedback.free_text_stored === false,
      expected_policy_state: item.expected_policy_state,
      actual_policy_state: result.demand.policy_state,
      expected_path: item.expected_path,
      selected_path: selectedPath,
      expected_route_useful: item.expected_route_useful,
      route_useful: routeUseful,
      reason_code: feedback.feedback.reason_code,
      free_text_stored: feedback.feedback.free_text_stored,
      request_body_stored: feedback.feedback.request_body_stored,
      spend_usd: result.decision.spend_usd,
      external_writes: result.decision.external_writes,
      external_supplier_execution: result.decision.external_supplier_execution,
    };
  });
}

export function summarizeTrustedBetaUsefulness(cases) {
  const passCount = cases.filter((item) => item.passed).length;
  const usefulCount = cases.filter((item) => item.route_useful).length;
  return {
    case_count: cases.length,
    pass_count: passCount,
    miss_count: cases.length - passCount,
    usefulness_rate: usefulCount / Math.max(cases.length, 1),
    pass_rate: passCount / Math.max(cases.length, 1),
    by_persona: countBy(cases, (item) => item.persona),
    by_selected_path: countBy(cases, (item) => item.selected_path || 'none'),
    by_reason_code: countBy(cases, (item) => item.reason_code),
    failures: cases.filter((item) => !item.passed).map((item) => ({
      id: item.id,
      persona: item.persona,
      policy: `${item.expected_policy_state}->${item.actual_policy_state}`,
      path: `${item.expected_path || 'none'}->${item.selected_path || 'none'}`,
    })),
  };
}

async function runOpenDemandExperiments() {
  const service = createOpenDemandService({ memoryOnlyLearning: true, allowClone: false });
  const sourceModes = ['fixture', 'public-benchmark', 'public-bounty', 'public-research', 'non-code-fixture', 'github-discussions'];
  const runs = [];
  for (const sourceMode of sourceModes) {
    const scan = await service.scan({ source_mode: sourceMode, limit: 8 });
    runs.push({
      source_mode: sourceMode,
      opportunity_count: scan.opportunities.length,
      executable_path_rate: scan.hero_metrics.executable_path_rate,
      unsafe_actions_prevented: scan.hero_metrics.unsafe_actions_prevented,
      selected_count: scan.opportunities.filter((item) => item.decision !== 'reject').length,
      top_opportunity_id: scan.opportunities[0]?.id || null,
      top_decision: scan.opportunities[0]?.decision || null,
      top_lane: scan.opportunities[0]?.lane || null,
    });
  }
  return runs;
}

function summarize(report) {
  const gatewayPasses = report.gateway_policy_cases.filter((item) => item.passed).length;
  const productPasses = report.product_path_cases.filter((item) => item.passed).length;
  const corpusPasses = report.first_user_corpus_cases.filter((item) => item.passed).length;
  const usefulnessPasses = report.trusted_beta_usefulness_cases.filter((item) => item.passed).length;
  const bestPositioning = report.positioning_variants[0];
  const bestOpenDemand = [...report.open_demand_experiments].sort((a, b) => b.executable_path_rate - a.executable_path_rate)[0];
  return {
    gateway_policy_pass_rate: gatewayPasses / report.gateway_policy_cases.length,
    product_path_pass_rate: productPasses / report.product_path_cases.length,
    first_user_corpus_pass_rate: corpusPasses / Math.max(report.first_user_corpus_cases.length, 1),
    first_user_corpus_miss_count: report.first_user_corpus_confusion.miss_count,
    trusted_beta_usefulness_pass_rate: usefulnessPasses / Math.max(report.trusted_beta_usefulness_cases.length, 1),
    trusted_beta_usefulness_rate: report.trusted_beta_usefulness_summary.usefulness_rate,
    live_checks_ok: report.live_checks.every((item) => item.ok),
    live_homepage_current_headline: report.live_homepage_drift.current_headline_live,
    live_homepage_previous_headline: report.live_homepage_drift.previous_headline_live,
    live_copy_drift_detected: report.live_homepage_drift.hosted_drift_expected_until_deploy,
    best_positioning_variant: bestPositioning.id,
    best_open_demand_source_mode: bestOpenDemand?.source_mode || null,
    recommendation: 'Keep optimizing toward outcome-to-path clarity, then validate with real trusted beta reviewers before broader launch.',
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Retrospective Experiment Report',
    '',
    `Generated: ${report.generated_at}`,
    `Base URL: ${report.base_url}`,
    '',
    '## Summary',
    '',
    `- Gateway policy pass rate: ${Math.round(report.summary.gateway_policy_pass_rate * 100)}%`,
    `- Product path pass rate: ${Math.round(report.summary.product_path_pass_rate * 100)}%`,
    `- First-user corpus pass rate: ${Math.round(report.summary.first_user_corpus_pass_rate * 100)}%`,
    `- Trusted-beta usefulness fixture pass rate: ${Math.round(report.summary.trusted_beta_usefulness_pass_rate * 100)}%`,
    `- Live checks ok: ${report.summary.live_checks_ok}`,
    `- Live copy drift detected: ${report.summary.live_copy_drift_detected}`,
    `- Best positioning variant: ${report.summary.best_positioning_variant}`,
    `- Best open-demand source mode: ${report.summary.best_open_demand_source_mode}`,
    '',
    '## Positioning Ranking',
    '',
    '| Rank | Variant | Score | Headline |',
    '| --- | --- | --- | --- |',
    ...report.positioning_variants.map((item, index) => `| ${index + 1} | ${item.id} | ${item.score}/9 | ${item.headline} |`),
    '',
    '## Gateway Policy Cases',
    '',
    '| Case | Passed | Policy | Stops |',
    '| --- | --- | --- | --- |',
    ...report.gateway_policy_cases.map((item) => `| ${item.id} | ${item.passed} | ${item.actual_policy_state} | ${item.stop_conditions.join(', ') || 'none'} |`),
    '',
    '## Product Path Cases',
    '',
    '| Case | Passed | Intent | Selected Path |',
    '| --- | --- | --- | --- |',
    ...report.product_path_cases.map((item) => `| ${item.id} | ${item.passed} | ${item.routing_intent} | ${item.selected_path || 'none'} |`),
    '',
    '## First-User Corpus',
    '',
    '| Case | Passed | Label | Gateway Policy | Product Path |',
    '| --- | --- | --- | --- | --- |',
    ...report.first_user_corpus_cases.map((item) => `| ${item.id} | ${item.passed} | ${item.label} | ${item.gateway.actual_policy_state} | ${item.product.selected_path || 'none'} |`),
    '',
    '## First-User Corpus Confusion',
    '',
    `- Miss count: ${report.first_user_corpus_confusion.miss_count}`,
    `- Source modes: ${Object.entries(report.first_user_corpus_confusion.by_source_mode).map(([key, count]) => `${key} (${count})`).join(', ') || 'none'}`,
    `- Product path confusion: ${Object.entries(report.first_user_corpus_confusion.by_product_path).map(([key, count]) => `${key} (${count})`).join(', ') || 'none'}`,
    `- Gateway policy confusion: ${Object.entries(report.first_user_corpus_confusion.by_gateway_policy).map(([key, count]) => `${key} (${count})`).join(', ') || 'none'}`,
    `- Missing stop conditions: ${Object.entries(report.first_user_corpus_confusion.by_missing_stop_condition).map(([key, count]) => `${key} (${count})`).join(', ') || 'none'}`,
    '',
    '## Source Mode Performance',
    '',
    '| Source Mode | Cases | Pass Rate | Labels | Missed Cases |',
    '| --- | --- | --- | --- | --- |',
    ...report.source_mode_performance.map((item) => `| ${item.source_mode} | ${item.case_count} | ${Math.round(item.pass_rate * 100)}% | ${item.labels.join(', ')} | ${item.missed_cases.join(', ') || 'none'} |`),
    '',
    '## Live Homepage Drift',
    '',
    `- Current local headline live: ${report.live_homepage_drift.current_headline_live}`,
    `- Previous deployed headline live: ${report.live_homepage_drift.previous_headline_live}`,
    `- Drift expected until deploy: ${report.live_homepage_drift.hosted_drift_expected_until_deploy}`,
    '',
    '## Trusted-Beta Usefulness Fixtures',
    '',
    `- Case count: ${report.trusted_beta_usefulness_summary.case_count}`,
    `- Pass rate: ${Math.round(report.trusted_beta_usefulness_summary.pass_rate * 100)}%`,
    `- Usefulness rate: ${Math.round(report.trusted_beta_usefulness_summary.usefulness_rate * 100)}%`,
    `- Selected paths: ${Object.entries(report.trusted_beta_usefulness_summary.by_selected_path).map(([key, count]) => `${key} (${count})`).join(', ') || 'none'}`,
    `- Reason codes: ${Object.entries(report.trusted_beta_usefulness_summary.by_reason_code).map(([key, count]) => `${key} (${count})`).join(', ') || 'none'}`,
    '',
    '| Fixture | Passed | Persona | Policy | Path | Useful |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.trusted_beta_usefulness_cases.map((item) => `| ${item.id} | ${item.passed} | ${item.persona} | ${item.actual_policy_state} | ${item.selected_path || 'none'} | ${item.route_useful} |`),
    '',
    '## Open Demand Modes',
    '',
    '| Source Mode | Executable Path Rate | Unsafe Actions Prevented | Top Lane |',
    '| --- | --- | --- | --- |',
    ...report.open_demand_experiments.map((item) => `| ${item.source_mode} | ${item.executable_path_rate} | ${item.unsafe_actions_prevented} | ${item.top_lane || 'none'} |`),
    '',
    '## Next Experiment',
    '',
    '- Replace synthetic usefulness fixtures with real trusted-beta feedback once Stephen approves reviewers and outreach.',
    '- Keep public launch blocked until trusted beta reviewers produce real route-usefulness feedback.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const outDir = path.resolve(rootDir, args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const corpus = readJsonFixture(args.corpus);
  const usefulness = readJsonFixture(args.usefulness);

  const firstUserCorpusCases = runFirstUserCorpus(corpus);
  const trustedBetaUsefulnessCases = runTrustedBetaUsefulnessFixtures(usefulness);
  const report = {
    schema_version: 'bean.retrospective_experiment.v1',
    generated_at: generatedAt,
    base_url: args.baseUrl,
    live_checks: await runLiveChecks(args.baseUrl),
    live_homepage_drift: await runLiveHomepageDrift(args.baseUrl),
    gateway_policy_cases: runGatewayPolicyCases(),
    product_path_cases: runProductPathCases(),
    first_user_corpus: {
      schema_version: corpus.schema_version,
      case_count: corpus.cases.length,
    },
    first_user_corpus_cases: firstUserCorpusCases,
    first_user_corpus_confusion: summarizeFirstUserCorpusConfusion(firstUserCorpusCases),
    source_mode_performance: summarizeSourceModePerformance(firstUserCorpusCases),
    trusted_beta_usefulness: {
      schema_version: usefulness.schema_version,
      fixture_count: usefulness.fixtures.length,
    },
    trusted_beta_usefulness_cases: trustedBetaUsefulnessCases,
    trusted_beta_usefulness_summary: summarizeTrustedBetaUsefulness(trustedBetaUsefulnessCases),
    open_demand_experiments: await runOpenDemandExperiments(),
    positioning_variants: positioningVariantInputs.map(scorePositioningVariant).sort((a, b) => b.score - a.score),
  };
  report.summary = summarize(report);
  report.ok = report.summary.gateway_policy_pass_rate === 1
    && report.summary.product_path_pass_rate === 1
    && report.summary.first_user_corpus_pass_rate === 1
    && report.summary.trusted_beta_usefulness_pass_rate === 1
    && report.summary.live_checks_ok;

  const slug = generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `retrospective-${slug}.json`);
  const markdownPath = path.join(outDir, `retrospective-${slug}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdown(report));
  fs.writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'latest.md'), renderMarkdown(report));

  console.log(JSON.stringify({
    ok: report.ok,
    out_dir: outDir,
    json: jsonPath,
    markdown: markdownPath,
    summary: report.summary,
  }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

const directRunPath = process.argv[1] ? new URL(process.argv[1], 'file:').href : null;
if (import.meta.url === directRunPath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
