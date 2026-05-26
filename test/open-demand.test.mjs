import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  DECISION_REJECT,
  PROOF_EXAMPLES,
  createOpenDemandService,
  githubIssueToOpportunity,
  negativeControls,
  scoreOpportunity,
} from '../scripts/open-demand-lib.mjs';
import { makeServer } from '../scripts/execution-gateway-server.mjs';
import {
  PublicLearningStore,
  parsePublicGithubUrl,
  runPublicProof,
} from '../scripts/open-demand-proof-runner.mjs';

function fakeFetch(_url) {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      items: [
        {
          html_url: 'https://github.com/example/project/issues/123',
          repository_url: 'https://api.github.com/repos/example/project',
          number: 123,
          title: 'Add regression test for parser bug',
          body: 'Steps to reproduce are public. Expected result should be covered by pytest.',
          labels: [{ name: 'good first issue' }, { name: 'bug' }],
          comments: 2,
        },
      ],
    }),
  });
}

function fakeGithubMetadataFetch(url) {
  const text = String(url);
  if (text.endsWith('/issues/123')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        number: 123,
        title: 'Add regression test for parser bug',
        state: 'open',
        comments: 2,
        labels: [{ name: 'bug' }],
        updated_at: '2026-05-25T00:00:00Z',
      }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({
      full_name: 'example/project',
      default_branch: 'main',
      size: 42,
      open_issues_count: 7,
      pushed_at: '2026-05-25T00:00:00Z',
      archived: false,
      disabled: false,
      visibility: 'public',
    }),
  });
}

function requestJson(baseUrl, pathname, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? undefined : JSON.stringify(body);
    const req = http.request(
      new URL(pathname, baseUrl),
      {
        method,
        headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('fixture scan ranks safe candidates above negative controls', async () => {
  const service = createOpenDemandService({ fetchImpl: fakeFetch });
  const scan = await service.scan({ source_mode: 'fixture', limit: 8 });

  assert.equal(scan.external_actions_performed, false);
  assert.equal(scan.metrics.opportunities_scanned, 8);
  assert.equal(scan.metrics.guardrail_violations, 0);
  assert.equal(scan.metrics.scoring_signal_observed, true);
  assert.ok(scan.metrics.selected_candidates > 0);
});

test('bundle and verifier lifecycle stays local and gated', async () => {
  const service = createOpenDemandService({ fetchImpl: fakeFetch });
  const scan = await service.scan({ source_mode: 'fixture', limit: 4 });
  const opportunity = scan.opportunities.find((item) => item.decision !== DECISION_REJECT);

  const bundle = (await service.bundle(opportunity.id)).bundle;
  const run = await service.run(bundle.task_id);
  const report = (await service.report(bundle.task_id)).report;

  assert.equal(bundle.external_actions_allowed, false);
  assert.equal(run.run.external_actions_performed, false);
  assert.equal(report.external_actions_performed, false);
  assert.equal(report.submission_state, 'not_submitted_human_approval_required');
  assert.ok(bundle.guardrails.includes('no_spend'));
  assert.equal(bundle.local_proof_plan.scope, 'public_or_fixture_only');
  assert.ok(bundle.local_proof_plan.stop_conditions.includes('spend_required'));
  assert.ok(report.tests_or_checks.length > 0);
  assert.equal(report.public_proof.external_actions_performed, false);
  assert.equal(report.public_proof.spend_usd, 0);
});

test('source-specific fixture scans expose quality speed cost risk proofability', async () => {
  const service = createOpenDemandService({ fetchImpl: fakeFetch });
  for (const sourceMode of ['public-benchmark', 'public-bounty', 'public-research', 'non-code-fixture', 'github-discussions']) {
    const scan = await service.scan({ source_mode: sourceMode, limit: 3 });
    assert.equal(scan.external_actions_performed, false);
    assert.equal(scan.opportunities.length, 3);
    assert.ok(scan.opportunities.every((item) => Number.isFinite(item.quality_score)));
    assert.ok(scan.opportunities.every((item) => Number.isFinite(item.speed_score)));
    assert.ok(scan.opportunities.every((item) => Number.isFinite(item.cost_score)));
    assert.ok(scan.opportunities.every((item) => Number.isFinite(item.risk_score)));
    assert.ok(scan.opportunities.every((item) => Number.isFinite(item.proofability_score)));
  }
});

test('path API chooses an agent path and prepares the next proof step', async () => {
  const service = createOpenDemandService({ fetchImpl: fakeFetch });
  const path = await service.path({
    outcome: {
      goal: 'Find the safest way to execute a public task.',
      task_type: 'agent_task_triage',
      desired_artifact: 'agent_path_packet',
    },
    source_mode: 'fixture',
  });

  assert.equal(path.schema_version, 'bean.agent_path_decision.v1');
  assert.equal(path.external_actions_performed, false);
  assert.equal(path.pricing_model.v0_spend_usd, 0);
  assert.ok(['owned_agent', 'public_path', 'build_decision'].includes(path.selected_path.supplier_class));
  assert.equal(path.next_step.action, 'run_public_proof');
});

test('public proof runner parses and blocks unsafe source URLs', async () => {
  assert.deepEqual(parsePublicGithubUrl('https://github.com/example/project/issues/123'), {
    owner: 'example',
    repo: 'project',
    type: 'issues',
    number: '123',
    repository: 'example/project',
    clone_url: 'https://github.com/example/project.git',
    repo_url: 'https://github.com/example/project',
  });
  assert.equal(parsePublicGithubUrl('git@github.com:example/project.git'), null);
  assert.equal(parsePublicGithubUrl('https://github.com/example/project/security/advisories'), null);
});

test('public proof runner returns fixture and read-only GitHub metadata proofs without writes', async () => {
  const fixture = await runPublicProof({
    task_id: 'task-fixture',
    source_url: 'fixture://open-demand/public-benchmark',
  });
  assert.equal(fixture.status, 'fixture_public_proof');
  assert.equal(fixture.external_actions_performed, false);
  assert.equal(fixture.public_writes, 0);

  const github = await runPublicProof({
    task_id: 'task-github',
    source_url: 'https://github.com/example/project/issues/123',
  }, {
    allowClone: false,
    fetchImpl: fakeGithubMetadataFetch,
    execFileImpl: async () => ({ stdout: 'abc123 refs/heads/main\n', stderr: '' }),
  });
  assert.equal(github.status, 'read_only_public_metadata_proof');
  assert.equal(github.public_reads, 1);
  assert.equal(github.public_writes, 0);
  assert.equal(github.package_installs, 0);
});

test('public learning store summarizes memory records', () => {
  const store = new PublicLearningStore({ memoryOnly: true });
  store.append('scan', { selected_ids: ['a'] });
  store.append('path_decision', { selected_opportunity_id: 'a' });
  const summary = store.summary();

  assert.equal(summary.memory_only, true);
  assert.equal(summary.records_in_memory, 2);
  assert.equal(summary.by_kind_memory.scan, 1);
  assert.equal(summary.by_kind_memory.path_decision, 1);
});

test('proof examples and feedback stay metadata-only', () => {
  const service = createOpenDemandService({ fetchImpl: fakeFetch });
  const examples = service.examples();

  assert.ok(PROOF_EXAMPLES.length >= 5);
  assert.equal(examples.external_actions_allowed, false);
  assert.ok(examples.hero_metric_definitions.some((item) => item.id === 'executable_path_rate'));

  const feedback = service.feedback({
    target_type: 'open_demand_opportunity',
    target_id: 'fixture_oss_docs_test_01',
    helpful: true,
    route_useful: true,
    would_have_built_manually: false,
    saved_time_estimate_minutes: 12,
    reason_code: 'routed_to_useful_path',
  });
  assert.equal(feedback.accepted, true);
  assert.equal(feedback.feedback.free_text_stored, false);
  assert.equal(feedback.feedback_summary.helpful, 1);

  assert.throws(
    () => service.feedback({ target_type: 'route', target_id: 'x', comment: 'free text is not accepted' }),
    /feedback_accepts_metadata_only/,
  );
});

test('negative controls reject spend and private data', () => {
  const scored = negativeControls(2).map((item) => scoreOpportunity(item));

  assert.equal(scored.every((item) => item.decision === DECISION_REJECT), true);
  assert.ok(scored.some((item) => item.hard_blockers.includes('private_data_required')));
  assert.ok(scored.some((item) => item.hard_blockers.includes('spend_required')));
});

test('github issue conversion uses public read-only defaults', () => {
  const issue = githubIssueToOpportunity({
    html_url: 'https://github.com/example/project/issues/123',
    repository_url: 'https://api.github.com/repos/example/project',
    number: 123,
    title: 'Add regression test for parser bug',
    body: 'Steps to reproduce are public. Expected result should be covered by pytest.',
    labels: [{ name: 'good first issue' }, { name: 'bug' }],
    comments: 2,
  });

  assert.equal(issue.repository, 'example/project');
  assert.equal(issue.public_signal, true);
  assert.equal(issue.account_required, false);
  assert.equal(issue.external_submission_required, false);
  assert.equal(issue.spend_required_usd, 0);
});

test('public server exposes open-demand lifecycle without auth or external writes', async () => {
  const server = makeServer({
    routeOutDir: '/tmp/bean-public-test-routes',
    ledgerPath: '/tmp/bean-public-test-ledger.jsonl',
    registryPath: new URL('../data/execution-gateway/registry.json', import.meta.url).pathname,
    hostedDemo: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const health = await requestJson(baseUrl, '/v0/open-demand/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.body.external_actions_allowed, false);

    const path = await requestJson(baseUrl, '/v0/path', {
      method: 'POST',
      body: {
        outcome: {
          goal: 'Find the safest executable path for a public task.',
          task_type: 'agent_task_triage',
          desired_artifact: 'agent_path_packet',
        },
        source_mode: 'fixture',
      },
    });
    assert.equal(path.statusCode, 200);
    assert.equal(path.body.schema_version, 'bean.agent_path_decision.v1');
    assert.equal(path.body.external_actions_performed, false);
    assert.equal(path.body.pricing_model.v0_spend_usd, 0);

    const scan = await requestJson(baseUrl, '/v0/open-demand/scan', {
      method: 'POST',
      body: { source_mode: 'fixture', limit: 6 },
    });
    assert.equal(scan.statusCode, 200);
    assert.equal(scan.body.external_actions_performed, false);
    assert.equal(scan.body.metrics.guardrail_violations, 0);
    assert.equal(scan.body.hero_metrics.measurement_scope, 'metadata_only_public_demo');
    assert.ok(scan.body.hero_metrics.definitions.length >= 3);

    const opportunity = scan.body.opportunities.find((item) => item.decision !== DECISION_REJECT);
    const bundle = await requestJson(baseUrl, `/v0/open-demand/opportunities/${opportunity.id}/bundle`, { method: 'POST' });
    assert.equal(bundle.statusCode, 201);
    assert.equal(bundle.body.bundle.external_actions_allowed, false);
    assert.equal(bundle.body.bundle.local_proof_plan.scope, 'public_or_fixture_only');

    const run = await requestJson(baseUrl, `/v0/open-demand/tasks/${bundle.body.bundle.task_id}/run`, { method: 'POST' });
    assert.equal(run.statusCode, 201);
    assert.equal(run.body.run.external_actions_performed, false);
    assert.equal(run.body.report.submission_state, 'not_submitted_human_approval_required');

    const examples = await requestJson(baseUrl, '/v0/examples');
    assert.equal(examples.statusCode, 200);
    assert.ok(examples.body.examples.length >= 5);

    const feedback = await requestJson(baseUrl, '/v0/open-demand/feedback', {
      method: 'POST',
      body: {
        target_type: 'open_demand_opportunity',
        target_id: opportunity.id,
        helpful: true,
        route_useful: true,
        would_have_built_manually: false,
        saved_time_estimate_minutes: 7,
        reason_code: 'routed_to_useful_path',
      },
    });
    assert.equal(feedback.statusCode, 201);
    assert.equal(feedback.body.free_text_stored, false);

    const metrics = await requestJson(baseUrl, '/v0/metrics');
    assert.equal(metrics.statusCode, 200);
    assert.equal(metrics.body.metrics.open_demand.paths, 1);
    assert.equal(metrics.body.metrics.open_demand.scans, 1);
    assert.equal(metrics.body.metrics.open_demand.bundles, 1);
    assert.equal(metrics.body.metrics.open_demand.runs, 1);
    assert.equal(metrics.body.metrics.open_demand.feedback, 1);

    const learning = await requestJson(baseUrl, '/v0/open-demand/learning');
    assert.equal(learning.statusCode, 200);
    assert.equal(learning.body.request_body_persistence, false);
    assert.equal(learning.body.learning.memory_only, true);
    assert.ok(learning.body.learning.by_kind_memory.path_decision >= 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
