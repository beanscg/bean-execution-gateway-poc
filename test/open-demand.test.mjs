import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import {
  DECISION_REJECT,
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

    const opportunity = scan.body.opportunities.find((item) => item.decision !== DECISION_REJECT);
    const bundle = await requestJson(baseUrl, `/v0/open-demand/opportunities/${opportunity.id}/bundle`, { method: 'POST' });
    assert.equal(bundle.statusCode, 201);
    assert.equal(bundle.body.bundle.external_actions_allowed, false);

    const run = await requestJson(baseUrl, `/v0/open-demand/tasks/${bundle.body.bundle.task_id}/run`, { method: 'POST' });
    assert.equal(run.statusCode, 201);
    assert.equal(run.body.run.external_actions_performed, false);
    assert.equal(run.body.report.submission_state, 'not_submitted_human_approval_required');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
