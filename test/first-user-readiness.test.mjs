import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';

import { makeServer } from '../scripts/execution-gateway-server.mjs';

function requestText(baseUrl, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(pathname, baseUrl), { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
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

test('public demo first viewport is first-user oriented', () => {
  const html = fs.readFileSync(new URL('../assets/execution-gateway-demo/index.html', import.meta.url), 'utf8');

  assert.match(html, /Find the execution path before an agent runs\./);
  assert.match(html, /Use public path/);
  assert.match(html, /Use or build/);
  assert.match(html, /Block risky work/);
  assert.match(html, /Decision memo/);
  assert.match(html, /What a human approves next/);
  assert.match(html, /Public\/synthetic inputs only/);
  assert.doesNotMatch(html.slice(0, 5000), /Product Delivery Contract|GTM|80\/80|V1|V2/);
});

test('first-user readiness doc maps all 100 goals', () => {
  const doc = fs.readFileSync(new URL('../docs/first-user-readiness.md', import.meta.url), 'utf8');
  const ids = [...doc.matchAll(/\| F(\d{3}) \|/g)].map((match) => match[1]);

  assert.equal(ids.length, 100);
  assert.deepEqual(ids.slice(0, 3), ['001', '002', '003']);
  assert.deepEqual(ids.slice(-3), ['098', '099', '100']);
  assert.match(doc, /First-user readiness goals completed: 100\/100/);
});

test('hosted homepage serves guided demo content', async () => {
  const server = makeServer({
    routeOutDir: '/tmp/bean-first-user-test-routes',
    ledgerPath: '/tmp/bean-first-user-test-ledger.jsonl',
    registryPath: new URL('../data/execution-gateway/registry.json', import.meta.url).pathname,
    hostedDemo: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const homepage = await requestText(baseUrl, '/');
    assert.equal(homepage.statusCode, 200);
    assert.match(homepage.body, /Run guided route/);
    assert.match(homepage.body, /Feedback stores metadata only/i);

    const path = await requestJson(baseUrl, '/v0/path', {
      method: 'POST',
      body: {
        outcome: {
          goal: 'Find a first-user route for a public task.',
          task_type: 'agent_task_triage',
          desired_artifact: 'agent_path_packet',
        },
        source_mode: 'fixture',
        policy: { mode: 'free_only' },
      },
    });
    assert.equal(path.statusCode, 200);
    assert.equal(path.body.schema_version, 'bean.agent_path_decision.v1');
    assert.equal(path.body.external_actions_performed, false);
    assert.equal(path.body.request_body_persistence, false);
    assert.ok(path.body.selected_path.scores.quality >= 0);

    const feedback = await requestJson(baseUrl, '/v0/v2/feedback', {
      method: 'POST',
      body: {
        target_type: 'route_decision',
        target_id: path.body.path_id,
        helpful: false,
        route_useful: false,
        reason_code: 'unclear_value',
        chosen_route: path.body.selected_path.supplier_class,
        latency_bucket: 'under_30s',
      },
    });
    assert.equal(feedback.statusCode, 201);
    assert.equal(feedback.body.feedback.reason_code, 'unclear_value');
    assert.equal(feedback.body.feedback.free_text_stored, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
