import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { makeServer } from '../scripts/execution-gateway-server.mjs';
import {
  PRODUCT_GOALS,
  ProductControlPlaneError,
  createProductControlPlane,
} from '../scripts/v2-product-control-plane-lib.mjs';

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

test('v2 product goal map covers the full delivered-product checklist as contracts', () => {
  const service = createProductControlPlane({ memoryOnly: true });
  const goals = service.goals();

  assert.equal(PRODUCT_GOALS.length, 120);
  assert.equal(goals.total_goals, 120);
  assert.equal(goals.completed_contract_goals, 120);
  assert.equal(goals.domains.length, 12);
  assert.ok(goals.blocked_production_gates.includes('no_payment_rail_connected'));
});

test('v2 outcome intake routes public work without storing raw prompt data', () => {
  const service = createProductControlPlane({ memoryOnly: true });
  const result = service.submitOutcome({
    outcome: {
      goal: 'Find a zero-spend way to solve this public benchmark.',
      task_type: 'agent_task_triage',
    },
    context_refs: ['https://github.com/example/project/issues/222'],
  });

  assert.equal(result.demand.raw_goal_stored, false);
  assert.equal(result.demand.request_body_stored, false);
  assert.equal(result.demand.sensitivity, 'public_or_synthetic');
  assert.ok(result.decision.selected_path);
  assert.equal(result.decision.dispatch_performed, false);
  assert.equal(result.decision.spend_usd, 0);
  assert.equal(result.learning_signal.raw_prompt_required_for_replay, false);
});

test('v2 controls block private-like input and paid execution while preserving metadata learning', () => {
  const service = createProductControlPlane({ memoryOnly: true });

  const privateResult = service.submitOutcome({
    outcome: {
      goal: 'Use my secret token to inspect a private repo.',
      task_type: 'agent_task_triage',
    },
    context_refs: ['private://github/example/internal/issues/1'],
  });
  assert.equal(privateResult.demand.policy_state, 'blocked');
  assert.equal(privateResult.decision.selected_path, null);

  const supply = service.submitSupplyBid({
    supplier_ref: 'external-paid-supplier',
    supplier_kind: 'external_supplier',
    capability_claims: ['public task solver'],
    quality_evidence: ['claim'],
    compute_location: 'supplier_hosted',
    data_boundary: 'public_only',
    price_usd: 1,
  });
  assert.equal(supply.selectable_now, false);
  assert.ok(supply.blocked_reasons.includes('external_supplier_execution_disabled'));
  assert.ok(supply.blocked_reasons.includes('payment_rail_not_connected'));

  const plan = service.createExecutionPlan({ route_id: 'route-1', mode: 'human_approved_execution', timeout_seconds: 30 });
  assert.equal(plan.mode, 'human_approved_execution_required');
  assert.equal(plan.dispatch_performed, false);

  const acceptance = service.recordAcceptance({
    outcome_ref: 'outcome-1',
    verifier_result: 'passed',
    acceptance_state: 'accepted',
    requested_payable_usd: 12,
  });
  assert.equal(acceptance.payable_usd, 0);
  assert.equal(acceptance.settlement_status, 'blocked_no_payment_rail');

  const feedback = service.recordFeedback({
    target_type: 'route_decision',
    target_id: 'route-1',
    helpful: true,
    route_useful: true,
    reason_code: 'blocked_correctly',
    latency_bucket: 'under_30s',
  });
  assert.equal(feedback.accepted, true);
  assert.equal(feedback.feedback.free_text_stored, false);

  const learning = service.learningSummary();
  assert.equal(learning.request_body_stored, false);
  assert.equal(learning.records.feedback, 1);
  assert.equal(learning.exportable_training_corpus, true);
});

test('v2 feedback rejects free text fields', () => {
  const service = createProductControlPlane({ memoryOnly: true });

  assert.throws(
    () => service.recordFeedback({
      target_type: 'route_decision',
      target_id: 'route-1',
      helpful: false,
      reason_code: 'bad_route',
      comment: 'this should not be stored',
    }),
    ProductControlPlaneError,
  );
});

test('v2 gtm packet is prepared for public beta without claiming marketplace readiness', () => {
  const service = createProductControlPlane({ memoryOnly: true });
  const packet = service.gtmPacket();

  assert.equal(packet.public_beta_status, 'prepared_for_trusted_external_review');
  assert.equal(packet.launch_copy_status, 'prepared_requires_operator_approval_before_public_post');
  assert.equal(packet.beta_cohort_status, 'prepared_not_invited');
  assert.ok(packet.public_beta_limits.includes('no_paid_execution'));
  assert.ok(packet.public_beta_limits.includes('no_external_supplier_execution'));
});

test('public server exposes v2 product contracts without external actions', async () => {
  const server = makeServer({
    routeOutDir: '/tmp/bean-v2-test-routes',
    ledgerPath: '/tmp/bean-v2-test-ledger.jsonl',
    registryPath: new URL('../data/execution-gateway/registry.json', import.meta.url).pathname,
    hostedDemo: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const goals = await requestJson(baseUrl, '/v0/v2/goals');
    assert.equal(goals.statusCode, 200);
    assert.equal(goals.body.total_goals, 120);
    assert.equal(goals.body.completed_contract_goals, 120);

    const route = await requestJson(baseUrl, '/v0/v2/intake', {
      method: 'POST',
      body: {
        outcome: {
          goal: 'Find a safe route for a public task.',
          task_type: 'agent_task_triage',
        },
        context_refs: ['https://github.com/example/project/issues/333'],
      },
    });
    assert.equal(route.statusCode, 201);
    assert.equal(route.body.demand.raw_goal_stored, false);
    assert.equal(route.body.decision.dispatch_performed, false);

    const feedback = await requestJson(baseUrl, '/v0/v2/feedback', {
      method: 'POST',
      body: {
        target_type: 'route_decision',
        target_id: route.body.decision.route_id,
        helpful: true,
        route_useful: true,
        reason_code: 'routed_to_useful_path',
      },
    });
    assert.equal(feedback.statusCode, 201);
    assert.equal(feedback.body.feedback.free_text_stored, false);

    const learning = await requestJson(baseUrl, '/v0/v2/learning');
    assert.equal(learning.statusCode, 200);
    assert.equal(learning.body.records.feedback, 1);

    const readiness = await requestJson(baseUrl, '/v0/v2/readiness');
    assert.equal(readiness.statusCode, 200);
    assert.equal(readiness.body.ok_for_public_learning_traffic, true);
    assert.equal(readiness.body.ok_for_private_customer_or_paid_traffic, false);

    const metrics = await requestJson(baseUrl, '/v0/metrics');
    assert.equal(metrics.statusCode, 200);
    assert.equal(metrics.body.metrics.v2_product.goals, 1);
    assert.equal(metrics.body.metrics.v2_product.demand_intake, 1);
    assert.equal(metrics.body.metrics.v2_product.feedback, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
