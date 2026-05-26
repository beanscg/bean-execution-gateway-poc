import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const checklistPath = path.join(rootDir, 'docs/product-launch-checklist.md');
const requiredFiles = [
  'README.md',
  'TERMS.md',
  'PRIVACY.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'ROADMAP.md',
  'docs/product-launch-checklist.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/workflows/ci.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/route_feedback.yml',
  '.github/ISSUE_TEMPLATE/non_sensitive_security.yml',
];

function parseArgs(argv) {
  const parsed = { out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') parsed.out = argv[index + 1] || '';
  }
  return parsed;
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function parseChecklist(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\| (L\d{3}) \| ([^|]+) \| ([^|]+) \| (Done|Prepared|Blocked) \| ([^|]+) \|$/);
    if (!match) continue;
    rows.push({
      id: match[1],
      area: match[2].trim(),
      requirement: match[3].trim(),
      status: match[4],
      evidence_or_blocker: match[5].trim(),
    });
  }
  return rows;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});
}

function assertContains(text, pattern, label, failures) {
  if (!pattern.test(text)) failures.push(label);
}

const args = parseArgs(process.argv.slice(2));
const failures = [];
const missingFiles = requiredFiles.filter((file) => !fileExists(file));
if (missingFiles.length) failures.push(`missing required files: ${missingFiles.join(', ')}`);

const checklist = fs.readFileSync(checklistPath, 'utf8');
const rows = parseChecklist(checklist);
if (rows.length !== 120) failures.push(`expected 120 launch checklist rows, found ${rows.length}`);

const ids = new Set(rows.map((row) => row.id));
for (let index = 1; index <= 120; index += 1) {
  const id = `L${String(index).padStart(3, '0')}`;
  if (!ids.has(id)) failures.push(`missing checklist id ${id}`);
}

const statusCounts = countBy(rows, 'status');
const blockerText = rows.filter((row) => row.status === 'Blocked').map((row) => row.requirement).join(' ');
assertContains(blockerText, /auth|API keys/i, 'blocked gates must mention auth/API keys', failures);
assertContains(blockerText, /payment|billing|payout/i, 'blocked gates must mention payment/billing/payouts', failures);
assertContains(blockerText, /supplier/i, 'blocked gates must mention supplier readiness', failures);
assertContains(blockerText, /private|tenant|customer/i, 'blocked gates must mention private/customer/tenant readiness', failures);
assertContains(blockerText, /legal|terms|liability|KYC|tax/i, 'blocked gates must mention legal/commercial readiness', failures);

const readme = readText('README.md');
assertContains(readme, /Route an outcome before an agent spends, posts, or runs\./, 'README must open with launch positioning', failures);
assertContains(readme, /Beta Boundary/, 'README must expose beta boundary', failures);
assertContains(readme, /Agent And Developer Quickstart/, 'README must include agent/developer quickstart', failures);

const packageJson = JSON.parse(readText('package.json'));
if (!packageJson.scripts?.['launch:readiness']) failures.push('package.json missing launch:readiness script');
if (!Array.isArray(packageJson.keywords) || !packageJson.keywords.includes('agent-routing')) failures.push('package keywords missing agent-routing');

const report = {
  ok: failures.length === 0,
  generated_at: new Date().toISOString(),
  product_launch_ready: false,
  public_demo_ready: true,
  trusted_beta_review_ready: true,
  broader_public_push_ready: false,
  customer_private_paid_or_supplier_ready: false,
  checklist_rows: rows.length,
  status_counts: statusCounts,
  missing_files: missingFiles,
  failures,
  required_blocked_gates: [
    'authenticated tenants and scoped API keys',
    'durable audit and retention store',
    'private context vault and tenant isolation',
    'supplier identity, quality, dispute, and settlement operations',
    'payment, payout, KYC, tax, refund, and chargeback rails',
    'monitoring, alerting, abuse queue, incident response, and support ownership',
    'legal and platform ToS review',
    'real trusted-beta learning from public or synthetic users',
  ],
};

if (args.out) {
  const outPath = path.resolve(rootDir, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
