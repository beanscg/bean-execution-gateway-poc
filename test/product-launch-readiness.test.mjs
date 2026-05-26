import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('product launch checklist is complete but does not overclaim launch readiness', () => {
  const doc = fs.readFileSync(new URL('../docs/product-launch-checklist.md', import.meta.url), 'utf8');
  const rows = [...doc.matchAll(/^\| (L\d{3}) \| ([^|]+) \| ([^|]+) \| (Done|Prepared|Blocked) \| ([^|]+) \|$/gm)];
  const ids = rows.map((match) => match[1]);
  const statuses = rows.map((match) => match[4]);
  const blockedText = rows.filter((match) => match[4] === 'Blocked').map((match) => match[3]).join(' ');

  assert.equal(rows.length, 120);
  assert.equal(new Set(ids).size, 120);
  assert.equal(ids[0], 'L001');
  assert.equal(ids.at(-1), 'L120');
  assert.ok(statuses.includes('Done'));
  assert.ok(statuses.includes('Prepared'));
  assert.ok(statuses.includes('Blocked'));
  assert.match(doc, /Broader public product push: Blocked/);
  assert.match(doc, /Customer\/private\/paid\/supplier launch: No-go/);
  assert.match(blockedText, /auth|API keys/i);
  assert.match(blockedText, /payment|billing|payout/i);
  assert.match(blockedText, /supplier/i);
  assert.match(blockedText, /private|tenant|customer/i);
  assert.match(blockedText, /legal|terms|liability|KYC|tax/i);
});
