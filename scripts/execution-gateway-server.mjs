#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildOutcomeRecord,
  defaultOutcomeLedgerPath,
  defaultRegistryPath,
  recordOutcome,
  rootDir,
  runExecutionGateway,
  summarizeOutcomeLedger,
} from './execution-gateway-lib.mjs';
import {
  buildOpenApiSpec,
  summarizeLedgerFile,
} from './execution-gateway-tools.mjs';

const API_VERSION = 'v0';
const DEMO_ASSET_PATH = path.join(rootDir, 'assets', 'execution-gateway-demo', 'index.html');
const HOSTED_DEMO_WARNING = 'Do not paste private, work, company, customer, secret, credential, local file, internal, or regulated context into the public demo.';

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      flags._.push(arg);
    }
  }
  return flags;
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-bean-api-surface': 'execution-gateway',
    ...extraHeaders,
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-bean-api-surface': 'execution-gateway',
    ...extraHeaders,
  });
  res.end(html);
}

const hostedRejectPattern = /\b(?:work\s+data|company\s+data|customer\s+data|customer\s+file|private\s+repo|internal\s+repo|api[_-]?key|secret|password|token)\b|(?:private|internal|vpn|intranet|localhost|127\.0\.0\.1|0\.0\.0\.0|file):\/\/|\/Users\/|\/private\/|~\//i;

function scrubLocalPaths(value) {
  if (Array.isArray(value)) return value.map((item) => scrubLocalPaths(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, scrubLocalPaths(child)]));
  }
  if (typeof value !== 'string') return value;
  return value
    .replaceAll(rootDir, '[LOCAL_WORKSPACE]')
    .replace(/\/Users\/[^\s"']+/g, '[LOCAL_PATH]')
    .replace(/file:\/\/[^\s"']+/g, '[LOCAL_FILE_URL]');
}

function rejectHostedDemoInput(input) {
  const text = JSON.stringify(input || {});
  if (text.length > 64_000) {
    return 'hosted_demo_request_too_large';
  }
  if (hostedRejectPattern.test(text)) {
    return 'hosted_demo_rejects_private_work_or_secret_like_context';
  }
  return null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function makeServer({ routeOutDir, ledgerPath, registryPath, hostedDemo = false }) {
  const memoryLedger = [];
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://bean.local');
    const pathname = url.pathname === '/v0' ? '/' : url.pathname.replace(/^\/v0(?=\/)/, '');
    const modeHeaders = hostedDemo
      ? { 'x-bean-hosted-demo': 'true', 'x-bean-local-only': 'false' }
      : { 'x-bean-hosted-demo': 'false', 'x-bean-local-only': 'true' };
    const withMeta = (payload) => ({
      api_version: API_VERSION,
      public_demo: hostedDemo,
      hosted_demo: hostedDemo,
      ...payload,
    });
    const reply = (statusCode, payload) => sendJson(res, statusCode, withMeta(payload), modeHeaders);

    try {
      if (req.method === 'OPTIONS') {
        reply(403, {
          ok: false,
          error: 'CORS is disabled by default for the local-only V0 server.',
        });
        return;
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/demo')) {
        sendHtml(res, 200, fs.readFileSync(DEMO_ASSET_PATH, 'utf8'), modeHeaders);
        return;
      }

      if (req.method === 'GET' && pathname === '/health') {
        reply(200, {
          ok: true,
          local_only: !hostedDemo,
          public_demo: hostedDemo,
          hosted_demo: hostedDemo,
          spend_usd: 0,
          external_writes: 0,
          external_executions: 0,
          request_body_logging: false,
          request_body_persistence: false,
          disk_ledger_writes_default: !hostedDemo,
          warning: hostedDemo ? HOSTED_DEMO_WARNING : 'Local API only. Do not expose private data unless you own the environment.',
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/openapi.json') {
        sendJson(res, 200, buildOpenApiSpec(), modeHeaders);
        return;
      }

      if (req.method === 'GET' && pathname === '/ledger/summary') {
        reply(200, hostedDemo
          ? { ledger_path: 'memory://hosted-demo/outcomes', ...summarizeOutcomeLedger(memoryLedger), hosted_demo: true }
          : summarizeLedgerFile(ledgerPath));
        return;
      }

      if (req.method === 'POST' && pathname === '/route') {
        const body = await readJsonBody(req);
        const input = {
          ...body,
          adapter_boundary: hostedDemo ? 'hosted_api' : body.adapter_boundary,
        };
        const hostedRejectReason = hostedDemo ? rejectHostedDemoInput(input) : null;
        if (hostedRejectReason) {
          reply(400, {
            ok: false,
            hosted_demo: true,
            error: hostedRejectReason,
            warning: HOSTED_DEMO_WARNING,
          });
          return;
        }
        const route = runExecutionGateway(input, {
          registryPath,
          outDir: hostedDemo ? undefined : input.out_dir ? path.resolve(input.out_dir) : path.join(routeOutDir, input.request_id || 'request'),
          persistArtifacts: !hostedDemo,
        });
        reply(200, scrubLocalPaths({
          ...route.response,
          hosted_demo: hostedDemo,
          local_server_note: hostedDemo
            ? 'Hosted demo mode: public/synthetic inputs only, no artifact persistence, no disk ledger writes, no request-body logging.'
            : 'Localhost-only V0 API. Response is a route decision, not permission for external action.',
        }));
        return;
      }

      if (req.method === 'POST' && pathname === '/outcomes') {
        const input = await readJsonBody(req);
        if (hostedDemo) {
          const record = buildOutcomeRecord(input);
          memoryLedger.push(record);
          reply(200, {
            ledger_path: 'memory://hosted-demo/outcomes',
            record,
            hosted_demo: true,
            persisted_to_disk: false,
          });
          return;
        }
        const outcome = recordOutcome(input, { ledgerPath });
        reply(200, outcome);
        return;
      }

      reply(404, {
        ok: false,
        error: 'Not found',
      });
    } catch (error) {
      reply(400, {
        ok: false,
        error: error.message,
      });
    }
  });
}

async function main(argv) {
  const flags = parseFlags(argv);
  const host = flags.host || '127.0.0.1';
  const port = Number(flags.port || 8787);
  const routeOutDir = flags.out ? path.resolve(flags.out) : path.join(rootDir, 'dist', 'execution-gateway', 'api-routes');
  const ledgerPath = flags.ledger ? path.resolve(flags.ledger) : defaultOutcomeLedgerPath;
  const registryPath = flags.registry ? path.resolve(flags.registry) : defaultRegistryPath;
  const hostedDemo = Boolean(flags['hosted-demo'] || process.env.BEAN_GATEWAY_HOSTED_DEMO === '1');

  if (!hostedDemo && host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('V0 server only binds to localhost or 127.0.0.1');
  }

  const server = makeServer({ routeOutDir, ledgerPath, registryPath, hostedDemo });
  await new Promise((resolve) => server.listen(port, host, resolve));
  process.stdout.write(`Bean Execution Gateway ${hostedDemo ? 'hosted-demo' : 'local'} API listening on http://${host}:${port}\n`);
  process.stdout.write(`${hostedDemo ? 'Hosted-demo mode: public/synthetic inputs only, no artifact persistence, no disk ledger writes, no request-body logging.' : 'Local-only: no external writes, no spend, no account mutation, no supplier execution.'}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  makeServer,
};
