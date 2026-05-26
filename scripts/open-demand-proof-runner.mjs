import { execFile as nodeExecFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(nodeExecFile);

const MAX_STDIO_CHARS = 12_000;
const MAX_FILE_LIST = 120;
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
const DEFAULT_CLONE_TIMEOUT_MS = 30_000;

function stableDigest(value, length = 12) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function safeId(value, limit = 80) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'item').slice(0, limit);
}

function truncate(value, limit = MAX_STDIO_CHARS) {
  const text = String(value || '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated:${text.length - limit}]`;
}

function parsePublicGithubUrl(sourceUrl) {
  let url;
  try {
    url = new URL(String(sourceUrl || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
  const [owner, repo, type, number] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  if (type && !['issues', 'pull', 'discussions'].includes(type)) return null;
  if (number && !/^[0-9]+$/.test(number)) return null;
  return {
    owner,
    repo,
    type: type || 'repo',
    number: number || null,
    repository: `${owner}/${repo}`,
    clone_url: `https://github.com/${owner}/${repo}.git`,
    repo_url: `https://github.com/${owner}/${repo}`,
  };
}

async function runCommand(command, args, { cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, execFileImpl = execFile } = {}) {
  const started = Date.now();
  try {
    const result = await execFileImpl(command, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1_000_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
      },
    });
    return {
      command: [command, ...args],
      exit_code: 0,
      elapsed_ms: Date.now() - started,
      stdout_excerpt: truncate(result.stdout),
      stderr_excerpt: truncate(result.stderr),
    };
  } catch (error) {
    return {
      command: [command, ...args],
      exit_code: Number.isInteger(error.code) ? error.code : 1,
      elapsed_ms: Date.now() - started,
      stdout_excerpt: truncate(error.stdout),
      stderr_excerpt: truncate(error.stderr || error.message),
      failed: true,
    };
  }
}

function listFiles(root, { limit = MAX_FILE_LIST } = {}) {
  const files = [];
  const queue = ['.'];
  const ignore = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'target', '__pycache__']);
  while (queue.length && files.length < limit) {
    const relative = queue.shift();
    const absolute = path.join(root, relative);
    let entries = [];
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) queue.push(child);
      else files.push(child.replace(/^\.\//, ''));
      if (files.length >= limit) break;
    }
  }
  return files.sort();
}

function readSmallText(filePath, limit = 5000) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 256_000) return '';
    return fs.readFileSync(filePath, 'utf8').slice(0, limit);
  } catch {
    return '';
  }
}

function detectLocalChecks(repoDir, files) {
  const checks = [];
  if (files.includes('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8'));
      for (const scriptName of ['test', 'lint', 'typecheck']) {
        if (pkg.scripts?.[scriptName]) {
          checks.push({
            command: ['npm', 'run', scriptName, '--if-present'],
            runnable_without_install: fs.existsSync(path.join(repoDir, 'node_modules')),
            reason: `package.json defines ${scriptName}`,
          });
        }
      }
    } catch {
      checks.push({ command: ['npm', 'test'], runnable_without_install: false, reason: 'package.json present but not parseable' });
    }
  }
  if (files.includes('pyproject.toml')) {
    checks.push({ command: ['python', '-m', 'pytest'], runnable_without_install: false, reason: 'pyproject.toml present' });
  }
  if (files.includes('pytest.ini') || files.some((file) => file.startsWith('tests/') && file.endsWith('.py'))) {
    checks.push({ command: ['python', '-m', 'pytest'], runnable_without_install: false, reason: 'pytest-like files present' });
  }
  if (files.includes('Makefile')) {
    checks.push({ command: ['make', 'test'], runnable_without_install: false, reason: 'Makefile present' });
  }
  return checks.slice(0, 8);
}

function inspectRepository(repoDir) {
  const files = listFiles(repoDir);
  const readme = files.find((file) => /^readme(\.|$)/i.test(path.basename(file)));
  const manifests = files.filter((file) => [
    'package.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'Makefile',
    'README.md',
    'README',
  ].includes(path.basename(file)));
  return {
    files_observed: files.length,
    file_sample: files.slice(0, 40),
    manifest_files: manifests,
    readme_excerpt: readme ? readSmallText(path.join(repoDir, readme), 1800) : '',
    local_check_candidates: detectLocalChecks(repoDir, files),
  };
}

function fixtureProof(bundle, started) {
  return {
    schema_version: 'bean.public_proof_run.v1',
    proof_run_id: `proof-${stableDigest(`${bundle.task_id}:fixture`)}`,
    task_id: bundle.task_id,
    status: 'fixture_public_proof',
    source_kind: 'fixture',
    source_url: bundle.source_url || 'fixture://open-demand',
    elapsed_ms: Date.now() - started,
    external_actions_performed: false,
    spend_usd: 0,
    public_reads: 0,
    public_writes: 0,
    package_installs: 0,
    commands_executed: [],
    repository_inspection: {
      files_observed: 6,
      file_sample: ['README.md', 'package.json', 'src/index.js', 'test/index.test.js', 'docs/usage.md', 'LICENSE'],
      manifest_files: ['README.md', 'package.json'],
      readme_excerpt: 'Fixture-backed public proof. No external network read was required.',
      local_check_candidates: [
        { command: ['npm', 'test', '--if-present'], runnable_without_install: false, reason: 'fixture package.json defines test' },
      ],
    },
    proof_summary: 'Fixture proof produced a concrete local packet shape without external write, spend, account action, or package install.',
    stop_conditions: ['external_submission_required_for_public_outcome'],
  };
}

async function fetchGithubMetadata(github, { fetchImpl = fetch } = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'bean-open-demand-proof-runner',
  };
  const repoResponse = await fetchImpl(`https://api.github.com/repos/${github.owner}/${github.repo}`, { headers });
  const repo = repoResponse.ok ? await repoResponse.json() : null;
  let item = null;
  if (github.type === 'issues' && github.number) {
    const issueResponse = await fetchImpl(`https://api.github.com/repos/${github.owner}/${github.repo}/issues/${github.number}`, { headers });
    item = issueResponse.ok ? await issueResponse.json() : null;
  }
  return {
    repository: repo ? {
      full_name: repo.full_name,
      default_branch: repo.default_branch,
      size_kb: repo.size,
      open_issues_count: repo.open_issues_count,
      pushed_at: repo.pushed_at,
      archived: repo.archived,
      disabled: repo.disabled,
      visibility: repo.visibility,
    } : null,
    item: item ? {
      number: item.number,
      title: item.title,
      state: item.state,
      comments: item.comments,
      labels: (item.labels || []).map((label) => label.name).filter(Boolean),
      updated_at: item.updated_at,
    } : null,
  };
}

async function runPublicProof(bundle, {
  workspaceRoot = path.join(os.tmpdir(), 'bean-open-demand-proof'),
  allowClone = process.env.BEAN_OPEN_DEMAND_ALLOW_CLONE !== '0',
  fetchImpl = fetch,
  execFileImpl = execFile,
} = {}) {
  const started = Date.now();
  if (String(bundle.source_url || '').startsWith('fixture://')) {
    return fixtureProof(bundle, started);
  }
  const github = parsePublicGithubUrl(bundle.source_url);
  if (!github) {
    return {
      schema_version: 'bean.public_proof_run.v1',
      proof_run_id: `proof-${stableDigest(`${bundle.task_id}:unsupported`)}`,
      task_id: bundle.task_id,
      status: 'blocked',
      source_kind: 'unsupported_source',
      source_url: bundle.source_url || '',
      elapsed_ms: Date.now() - started,
      external_actions_performed: false,
      spend_usd: 0,
      public_reads: 0,
      public_writes: 0,
      package_installs: 0,
      commands_executed: [],
      proof_summary: 'Source is not an allowlisted public GitHub URL or fixture source.',
      stop_conditions: ['unsupported_source_for_public_proof'],
    };
  }

  const commands = [];
  const metadata = await fetchGithubMetadata(github, { fetchImpl }).catch((error) => ({
    error: error.message,
  }));
  const repoTooLarge = Number(metadata.repository?.size_kb || 0) > 200_000;
  const repoArchived = Boolean(metadata.repository?.archived || metadata.repository?.disabled);
  if (!allowClone || repoTooLarge || repoArchived) {
    const lsRemote = await runCommand('git', ['ls-remote', '--heads', github.clone_url], { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS, execFileImpl });
    commands.push(lsRemote);
    return {
      schema_version: 'bean.public_proof_run.v1',
      proof_run_id: `proof-${stableDigest(`${bundle.task_id}:metadata`)}`,
      task_id: bundle.task_id,
      status: lsRemote.exit_code === 0 ? 'read_only_public_metadata_proof' : 'failed',
      source_kind: 'public_github',
      source_url: bundle.source_url || '',
      repository: github.repository,
      elapsed_ms: Date.now() - started,
      external_actions_performed: false,
      spend_usd: 0,
      public_reads: 1,
      public_writes: 0,
      package_installs: 0,
      commands_executed: commands,
      github_metadata: metadata,
      proof_summary: repoTooLarge
        ? 'Repository metadata was inspected, but clone was skipped because the repo exceeded the public-demo size limit.'
        : 'Repository public refs and metadata were inspected without cloning or executing project code.',
      stop_conditions: repoArchived ? ['archived_or_disabled_repo'] : ['external_submission_required_for_public_outcome'],
    };
  }

  fs.mkdirSync(workspaceRoot, { recursive: true });
  const repoDir = path.join(workspaceRoot, safeId(`${github.owner}-${github.repo}-${stableDigest(bundle.task_id)}`));
  fs.rmSync(repoDir, { recursive: true, force: true });
  const clone = await runCommand('git', ['clone', '--depth=1', '--filter=blob:none', '--no-tags', github.clone_url, repoDir], {
    timeoutMs: DEFAULT_CLONE_TIMEOUT_MS,
    execFileImpl,
  });
  commands.push(clone);
  if (clone.exit_code !== 0) {
    return {
      schema_version: 'bean.public_proof_run.v1',
      proof_run_id: `proof-${stableDigest(`${bundle.task_id}:clone-failed`)}`,
      task_id: bundle.task_id,
      status: 'failed',
      source_kind: 'public_github',
      source_url: bundle.source_url || '',
      repository: github.repository,
      elapsed_ms: Date.now() - started,
      external_actions_performed: false,
      spend_usd: 0,
      public_reads: 1,
      public_writes: 0,
      package_installs: 0,
      commands_executed: commands,
      github_metadata: metadata,
      proof_summary: 'Public clone failed inside the bounded proof runner.',
      stop_conditions: ['clone_failed'],
    };
  }

  const inspect = inspectRepository(repoDir);
  const runnable = inspect.local_check_candidates.find((item) => item.runnable_without_install);
  if (runnable) {
    const check = await runCommand(runnable.command[0], runnable.command.slice(1), {
      cwd: repoDir,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      execFileImpl,
    });
    commands.push(check);
  }

  return {
    schema_version: 'bean.public_proof_run.v1',
    proof_run_id: `proof-${stableDigest(`${bundle.task_id}:clone`)}`,
    task_id: bundle.task_id,
    status: runnable ? (commands.at(-1).exit_code === 0 ? 'local_check_passed' : 'local_check_failed') : 'public_clone_inspected',
    source_kind: 'public_github',
    source_url: bundle.source_url || '',
    repository: github.repository,
    elapsed_ms: Date.now() - started,
    external_actions_performed: false,
    spend_usd: 0,
    public_reads: 1,
    public_writes: 0,
    package_installs: 0,
    commands_executed: commands,
    github_metadata: metadata,
    repository_inspection: inspect,
    proof_summary: runnable
      ? 'Public repository was cloned and an already-runnable local check was attempted without installs.'
      : 'Public repository was cloned and inspected. No local check was run because it would require dependency installation or an unknown setup.',
    stop_conditions: ['external_submission_required_for_public_outcome'],
  };
}

class PublicLearningStore {
  constructor({ ledgerPath, memoryOnly = false } = {}) {
    this.ledgerPath = ledgerPath || path.join(process.cwd(), 'dist', 'execution-gateway', 'public-learning-ledger.jsonl');
    this.memoryOnly = memoryOnly;
    this.records = [];
  }

  append(kind, payload) {
    const record = {
      schema_version: 'bean.public_learning_record.v1',
      record_id: `learn-${stableDigest(`${kind}:${JSON.stringify(payload)}:${Date.now()}`, 18)}`,
      kind,
      recorded_at: new Date().toISOString(),
      public_only: true,
      request_body_stored: false,
      payload,
    };
    this.records.push(record);
    if (!this.memoryOnly) {
      fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
      fs.appendFileSync(this.ledgerPath, `${JSON.stringify(record)}\n`);
    }
    return record;
  }

  summary() {
    const byKindMemory = {};
    for (const record of this.records) byKindMemory[record.kind] = (byKindMemory[record.kind] || 0) + 1;
    if (!this.memoryOnly && fs.existsSync(this.ledgerPath)) {
      const lines = fs.readFileSync(this.ledgerPath, 'utf8').split('\n').filter(Boolean);
      const byKindDisk = {};
      for (const line of lines.slice(Math.max(0, lines.length - 200))) {
        try {
          const record = JSON.parse(line);
          byKindDisk[record.kind] = (byKindDisk[record.kind] || 0) + 1;
        } catch {
          // Ignore malformed historical lines in the summary path.
        }
      }
      return {
        ledger_path: this.ledgerPath,
        memory_only: false,
        records_in_memory: this.records.length,
        records_on_disk: lines.length,
        by_kind_memory: byKindMemory,
        by_kind_recent_disk: byKindDisk,
      };
    }
    return {
      ledger_path: 'memory://public-learning-ledger',
      memory_only: true,
      records_in_memory: this.records.length,
      by_kind_memory: byKindMemory,
    };
  }
}

export {
  PublicLearningStore,
  parsePublicGithubUrl,
  runPublicProof,
};
