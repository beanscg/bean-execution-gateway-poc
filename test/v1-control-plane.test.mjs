import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { makeServer } from '../scripts/execution-gateway-server.mjs';
import {
  V1_GOALS,
  createV1ControlPlane,
  scoreBid,
} from '../scripts/v1-control-plane-lib.mjs';

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

test('v1 goal list covers all 80 local-contract goals', () => {
  const service = createV1ControlPlane({ memoryOnly: true });
  const goals = service.goals();

  assert.equal(V1_GOALS.length, 80);
  assert.equal(goals.total_goals, 80);
  assert.equal(goals.completed_local_contract_goals, 80);
  assert.equal(goals.ranges.length, 8);
  assert.ok(goals.blocked_production_gates.includes('no_payment_rail_connected'));
});

test('v1 control plane keeps supplier, payment, and private context gated', () => {
  const service = createV1ControlPlane({ memoryOnly: true });

  const tenant = service.createTenant({ tenant_ref: 'demo', scopes: ['public_demo:path'] }).tenant;
  assert.equal(tenant.api_key_stored, false);
  assert.equal(tenant.spend_allowed_usd, 0);

  const publicEnvelope = service.createContextEnvelope({
    context_refs: ['https://github.com/example/project/issues/1'],
    classification: 'public',
  });
  assert.equal(publicEnvelope.raw_context_stored, false);
  assert.equal(publicEnvelope.vault_status, 'public_metadata_envelope_created');

  const blockedEnvelope = service.createContextEnvelope({
    context_refs: ['private://repo/example/internal'],
    classification: 'private',
  });
  assert.equal(blockedEnvelope.vault_status, 'blocked_no_private_vault_in_v0');

  const externalBid = service.submitSupplierBid({
    supplier_id: 'external-agent',
    supplier_kind: 'external_supplier',
    price_usd: 1,
    estimated_latency_seconds: 20,
    compute_location: 'supplier_hosted',
    quality_evidence: ['claim'],
    data_boundary: 'public_only',
    acceptance_terms: { charge_on: 'accepted_outcome' },
  });
  assert.equal(externalBid.decision, 'recorded_not_selectable');
  assert.ok(externalBid.blocked_reasons.includes('external_supplier_execution_disabled'));
  assert.ok(externalBid.blocked_reasons.includes('nonzero_price_requires_payment_rail'));

  const localBid = service.submitSupplierBid({
    supplier_id: 'owned-agent',
    supplier_kind: 'owned_agent',
    price_usd: 0,
    estimated_latency_seconds: 20,
    compute_location: 'gateway_hosted',
    quality_evidence: ['verified_fixture', 'prior_local_proof'],
    data_boundary: 'public_only',
    acceptance_terms: { charge_on: 'accepted_outcome' },
  });
  assert.equal(localBid.decision, 'eligible_local_contract');
  assert.ok(localBid.scores.total > externalBid.scores.total);

  const acceptance = service.recordAcceptance({
    outcome_id: 'outcome-demo',
    acceptance_state: 'accepted',
    payable_usd: 5,
  });
  assert.equal(acceptance.payable_usd, 0);
  assert.equal(acceptance.settlement_status, 'blocked_no_payment_rail');

  const quote = service.quotePayment({ requested_payable_usd: 10 });
  assert.equal(quote.payable_usd, 0);
  assert.equal(quote.chargeable, false);

  const abuse = service.createAbuseCase({ reason_code: 'paid_action_attempt', severity: 'high', source: 'test' });
  assert.equal(abuse.free_text_stored, false);

  const readiness = service.readiness();
  assert.equal(readiness.ok_for_public_demo, true);
  assert.equal(readiness.ok_for_customer_or_paid_traffic, false);
  assert.equal(readiness.completed_local_contract_goals, 80);

  const audit = service.auditSummary();
  assert.equal(audit.request_body_stored, false);
  assert.ok(audit.events >= 8);
});

test('bid scoring rewards quality and zero-cost local compute', () => {
  const strong = scoreBid({
    supplier_kind: 'owned_agent',
    price_usd: 0,
    estimated_latency_seconds: 10,
    quality_evidence: ['a', 'b', 'c'],
    data_boundary: 'public_only',
  });
  const weak = scoreBid({
    supplier_kind: 'external_supplier',
    price_usd: 9,
    estimated_latency_seconds: 400,
    quality_evidence: [],
    data_boundary: 'unknown',
  });

  assert.ok(strong.total > weak.total);
  assert.equal(strong.cost, 100);
  assert.equal(weak.risk, 20);
});

test('public server exposes v1 control plane contracts without external actions', async () => {
  const server = makeServer({
    routeOutDir: '/tmp/bean-v1-test-routes',
    ledgerPath: '/tmp/bean-v1-test-ledger.jsonl',
    registryPath: new URL('../data/execution-gateway/registry.json', import.meta.url).pathname,
    hostedDemo: true,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const goals = await requestJson(baseUrl, '/v0/v1/goals');
    assert.equal(goals.statusCode, 200);
    assert.equal(goals.body.total_goals, 80);
    assert.equal(goals.body.completed_local_contract_goals, 80);

    const tenant = await requestJson(baseUrl, '/v0/v1/tenants', {
      method: 'POST',
      body: { tenant_ref: 'public-demo', scopes: ['public_demo:path'] },
    });
    assert.equal(tenant.statusCode, 201);
    assert.equal(tenant.body.tenant.api_key_stored, false);

    const bid = await requestJson(baseUrl, '/v0/v1/supplier-bids', {
      method: 'POST',
      body: {
        supplier_id: 'owned-agent',
        supplier_kind: 'owned_agent',
        price_usd: 0,
        estimated_latency_seconds: 15,
        compute_location: 'gateway_hosted',
        quality_evidence: ['verified_fixture'],
        data_boundary: 'public_only',
        acceptance_terms: { charge_on: 'accepted_outcome' },
      },
    });
    assert.equal(bid.statusCode, 201);
    assert.equal(bid.body.decision, 'eligible_local_contract');
    assert.equal(bid.body.external_actions_performed, false);

    const payment = await requestJson(baseUrl, '/v0/v1/payment-quotes', {
      method: 'POST',
      body: { requested_payable_usd: 25 },
    });
    assert.equal(payment.statusCode, 201);
    assert.equal(payment.body.payable_usd, 0);
    assert.equal(payment.body.payment_rail_status, 'blocked_requires_payment_rail_and_operator_approval');

    const abuse = await requestJson(baseUrl, '/v0/v1/abuse/cases', {
      method: 'POST',
      body: { reason_code: 'supplier_execution_attempt', severity: 'medium', source: 'test' },
    });
    assert.equal(abuse.statusCode, 201);
    assert.equal(abuse.body.request_body_stored, false);

    const readiness = await requestJson(baseUrl, '/v0/v1/readiness');
    assert.equal(readiness.statusCode, 200);
    assert.equal(readiness.body.ok_for_public_demo, true);
    assert.equal(readiness.body.ok_for_customer_or_paid_traffic, false);

    const replay = await requestJson(baseUrl, '/v0/v1/replay');
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body.external_actions_performed, false);
    assert.equal(replay.body.spend_usd, 0);

    const metrics = await requestJson(baseUrl, '/v0/metrics');
    assert.equal(metrics.statusCode, 200);
    assert.equal(metrics.body.metrics.v1_control_plane.goals, 1);
    assert.equal(metrics.body.metrics.v1_control_plane.supplier_bids, 1);
    assert.equal(metrics.body.metrics.v1_control_plane.payment_quotes, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
