import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { runExecutionGateway } from '../scripts/execution-gateway-lib.mjs';
import {
  runTrustedBetaUsefulnessFixtures,
  summarizeFirstUserCorpusConfusion,
  summarizeSourceModePerformance,
  summarizeTrustedBetaUsefulness,
} from '../scripts/retrospective-experiments.mjs';
import { createProductControlPlane } from '../scripts/v2-product-control-plane-lib.mjs';

test('retrospective first-user corpus matches expected route labels', () => {
  const corpus = JSON.parse(fs.readFileSync(new URL('../fixtures/execution-gateway/retrospective-task-corpus.json', import.meta.url), 'utf8'));
  const service = createProductControlPlane({ memoryOnly: true });

  assert.equal(corpus.schema_version, 'bean.retrospective_task_corpus.v1');
  assert.ok(corpus.cases.length >= 6);

  for (const item of corpus.cases) {
    assert.equal(typeof item.source_mode, 'string', `${item.id}: source mode`);
    assert.notEqual(item.source_mode.length, 0, `${item.id}: source mode present`);
    const gateway = runExecutionGateway(item.input, { persistArtifacts: false }).response;
    const product = service.submitOutcome(item.input);
    const gatewayStops = gateway.stop_conditions || [];
    const expectedStops = item.expected_gateway_stop_conditions || [];

    assert.equal(gateway.decision.policy_state, item.expected_gateway_policy_state, `${item.id}: gateway policy`);
    assert.equal(product.demand.policy_state, item.expected_product_policy_state, `${item.id}: product policy`);
    assert.equal(product.decision.selected_path?.path_id || null, item.expected_product_path, `${item.id}: product path`);
    for (const stopCondition of expectedStops) {
      assert.ok(gatewayStops.includes(stopCondition), `${item.id}: missing stop ${stopCondition}`);
    }
    assert.equal(gateway.cost.estimated_total_cost_usd, 0, `${item.id}: gateway cost`);
    assert.equal(product.decision.spend_usd, 0, `${item.id}: product spend`);
    assert.equal(product.decision.external_writes, 0, `${item.id}: external writes`);
    assert.equal(product.decision.external_supplier_execution, false, `${item.id}: external supplier execution`);
  }
});

test('retrospective confusion summary groups misses by route and stop condition', () => {
  const summary = summarizeFirstUserCorpusConfusion([
    {
      id: 'safe',
      label: 'owned',
      source_mode: 'public-github-issue',
      passed: true,
      gateway: {
        expected_policy_state: 'allowed',
        actual_policy_state: 'allowed',
        expected_stop_conditions: [],
        actual_stop_conditions: [],
      },
      product: {
        expected_policy_state: 'allowed',
        actual_policy_state: 'allowed',
        expected_path: 'owned_agent_local_proof',
        selected_path: 'owned_agent_local_proof',
      },
    },
    {
      id: 'miss',
      label: 'approval_required',
      source_mode: 'public-marketplace-gated',
      passed: false,
      gateway: {
        expected_policy_state: 'blocked',
        actual_policy_state: 'allowed',
        expected_stop_conditions: ['requires_paid_api'],
        actual_stop_conditions: [],
      },
      product: {
        expected_policy_state: 'approval_required',
        actual_policy_state: 'allowed',
        expected_path: 'public_open_source_path',
        selected_path: 'owned_agent_local_proof',
      },
    },
  ]);

  assert.equal(summary.case_count, 2);
  assert.equal(summary.pass_count, 1);
  assert.equal(summary.miss_count, 1);
  assert.deepEqual(summary.by_label, { owned: 1, approval_required: 1 });
  assert.deepEqual(summary.by_source_mode, { 'public-github-issue': 1, 'public-marketplace-gated': 1 });
  assert.equal(summary.by_gateway_policy['blocked->allowed'], 1);
  assert.equal(summary.by_product_policy['approval_required->allowed'], 1);
  assert.equal(summary.by_product_path['public_open_source_path->owned_agent_local_proof'], 1);
  assert.deepEqual(summary.by_missing_stop_condition, { requires_paid_api: 1 });
  assert.equal(summary.failures[0].id, 'miss');
  assert.equal(summary.failures[0].source_mode, 'public-marketplace-gated');
});

test('retrospective source mode summary preserves pass rate and labels', () => {
  const summary = summarizeSourceModePerformance([
    {
      id: 'public-1',
      label: 'public_path',
      source_mode: 'public-research',
      passed: true,
    },
    {
      id: 'public-2',
      label: 'approval_required',
      source_mode: 'public-research',
      passed: false,
    },
    {
      id: 'dataset-1',
      label: 'owned',
      source_mode: 'public-dataset',
      passed: true,
    },
  ]);

  assert.deepEqual(summary.map((item) => item.source_mode), ['public-dataset', 'public-research']);
  assert.equal(summary[0].pass_rate, 1);
  assert.equal(summary[1].case_count, 2);
  assert.equal(summary[1].pass_rate, 0.5);
  assert.deepEqual(summary[1].labels, ['approval_required', 'public_path']);
  assert.deepEqual(summary[1].missed_cases, ['public-2']);
});

test('trusted-beta usefulness fixtures measure useful route outcomes without storing text', () => {
  const fixtures = JSON.parse(fs.readFileSync(new URL('../fixtures/execution-gateway/trusted-beta-usefulness-fixtures.json', import.meta.url), 'utf8'));
  const cases = runTrustedBetaUsefulnessFixtures(fixtures);
  const summary = summarizeTrustedBetaUsefulness(cases);

  assert.equal(fixtures.schema_version, 'bean.trusted_beta_usefulness_fixtures.v1');
  assert.ok(cases.length >= 5);
  assert.equal(summary.pass_rate, 1);
  assert.equal(summary.usefulness_rate, 1);
  assert.equal(summary.failures.length, 0);
  assert.ok(summary.by_selected_path.owned_agent_local_proof >= 1);
  assert.ok(summary.by_selected_path.public_open_source_path >= 1);
  assert.ok(summary.by_selected_path.build_new_agent_decision >= 1);
  assert.ok(summary.by_selected_path.none >= 1);
  for (const item of cases) {
    assert.equal(item.free_text_stored, false, `${item.id}: free text`);
    assert.equal(item.request_body_stored, false, `${item.id}: request body`);
    assert.equal(item.spend_usd, 0, `${item.id}: spend`);
    assert.equal(item.external_writes, 0, `${item.id}: external writes`);
    assert.equal(item.external_supplier_execution, false, `${item.id}: supplier execution`);
  }
});
