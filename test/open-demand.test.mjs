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
    assert.equal(metrics.body.metrics.open_demand.scans, 1);
    assert.equal(metrics.body.metrics.open_demand.bundles, 1);
    assert.equal(metrics.body.metrics.open_demand.runs, 1);
    assert.equal(metrics.body.metrics.open_demand.feedback, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
