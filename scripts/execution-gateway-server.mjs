#!/usr/bin/env node

import http from 'node:http';
import crypto from 'node:crypto';
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
import {
  OpenDemandError,
  createOpenDemandService,
} from './open-demand-lib.mjs';

const API_VERSION = 'v0';
const DEMO_ASSET_PATH = path.join(rootDir, 'assets', 'execution-gateway-demo', 'index.html');
const HOSTED_DEMO_WARNING = 'Do not paste private, work, company, customer, secret, credential, local file, internal, or regulated context into the public demo.';
const MAX_JSON_BODY_BYTES = 1_000_000;
const HOSTED_DEMO_MAX_INPUT_CHARS = 64_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

const apiContentSecurityPolicy = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const demoContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

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

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function makeRequestId(req) {
  const raw = Array.isArray(req.headers['x-request-id'])
    ? req.headers['x-request-id'][0]
    : req.headers['x-request-id'];
  if (typeof raw === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(raw)) {
    return raw;
  }
  return crypto.randomUUID();
}

function securityHeaders({ requestId, contentSecurityPolicy = apiContentSecurityPolicy } = {}) {
  return {
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'x-xss-protection': '0',
    'content-security-policy': contentSecurityPolicy,
    'x-request-id': requestId,
  };
}

function getClientKey(req) {
  const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function createRateLimiter({ limitPerMinute = DEFAULT_RATE_LIMIT_PER_MINUTE } = {}) {
  const buckets = new Map();
  const windowMs = 60_000;
  return {
    check(req, now = Date.now()) {
      const key = getClientKey(req);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const remaining = Math.max(0, limitPerMinute - bucket.count);
      return {
        allowed: bucket.count <= limitPerMinute,
        limit: limitPerMinute,
        remaining,
        resetAt: bucket.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    },
    snapshot(now = Date.now()) {
      let active_buckets = 0;
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(key);
        } else {
          active_buckets += 1;
        }
      }
      return { limit_per_minute: limitPerMinute, active_buckets };
    },
  };
}

function rateLimitHeaders(rateLimit) {
  return {
    'x-ratelimit-limit': String(rateLimit.limit),
    'x-ratelimit-remaining': String(rateLimit.remaining),
    'x-ratelimit-reset': String(Math.ceil(rateLimit.resetAt / 1000)),
  };
}

function createMetrics() {
  return {
    started_at: new Date().toISOString(),
    requests_total: 0,
    by_method_path: {},
    by_status: {},
    rate_limited: 0,
    hosted_rejections: 0,
    route_decisions: {
      allowed: 0,
      blocked: 0,
      approval_required: 0,
      unknown: 0,
    },
    dispatch_attempts: 0,
    outcomes_recorded: 0,
    feedback_recorded: 0,
    open_demand: {
      scans: 0,
      paths: 0,
      bundles: 0,
      runs: 0,
      proof_runs: 0,
      reports: 0,
      examples: 0,
      feedback: 0,
      feedback_helpful: 0,
      learning_reports: 0,
      guardrail_violations: 0,
    },
    body_too_large: 0,
    errors: 0,
  };
}

function incrementCounter(bucket, key) {
  bucket[key] = (bucket[key] || 0) + 1;
}

function authConfig() {
  const required = process.env.BEAN_GATEWAY_REQUIRE_API_KEY === '1';
  const configured = Boolean(process.env.BEAN_GATEWAY_API_KEY);
  return {
    required,
    configured,
    production_ready: required && configured,
    protected_paths: ['/v0/route', '/v0/outcomes', '/v0/dispatch', '/v0/ledger/summary', '/v0/metrics'],
  };
}

function authorizeRequest(req, pathname) {
  const config = authConfig();
  const protectedPath = ['/route', '/outcomes', '/dispatch', '/ledger/summary', '/metrics'].includes(pathname);
  if (!config.required || !protectedPath) return { ok: true, config };
  if (!config.configured) {
    return {
      ok: false,
      statusCode: 503,
      error: 'api_key_auth_required_but_not_configured',
      config,
    };
  }
  const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const explicit = Array.isArray(req.headers['x-bean-api-key'])
    ? req.headers['x-bean-api-key'][0]
    : req.headers['x-bean-api-key'];
  if (bearer === process.env.BEAN_GATEWAY_API_KEY || explicit === process.env.BEAN_GATEWAY_API_KEY) {
    return { ok: true, config };
  }
  return {
    ok: false,
    statusCode: 401,
    error: 'api_key_required',
    config,
  };
}

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
  if (text.length > HOSTED_DEMO_MAX_INPUT_CHARS) {
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
    let bytes = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) {
        const error = new Error('Request body too large');
        error.code = 'BODY_TOO_LARGE';
        reject(error);
        return;
      }
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
  const metrics = createMetrics();
  const openDemand = createOpenDemandService({
    memoryOnlyLearning: hostedDemo,
    learningLedgerPath: hostedDemo ? undefined : path.join(path.dirname(ledgerPath), 'open-demand-learning.jsonl'),
    allowClone: !hostedDemo && process.env.BEAN_OPEN_DEMAND_ALLOW_CLONE !== '0',
  });
  const rateLimiter = createRateLimiter({
    limitPerMinute: parsePositiveInteger(process.env.BEAN_GATEWAY_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE),
  });
  return http.createServer(async (req, res) => {
    const requestId = makeRequestId(req);
    const url = new URL(req.url || '/', 'http://bean.local');
    const pathname = url.pathname === '/v0' ? '/' : url.pathname.replace(/^\/v0(?=\/)/, '');
    const originalPathname = url.pathname;
    metrics.requests_total += 1;
    incrementCounter(metrics.by_method_path, `${req.method} ${originalPathname}`);
    const modeHeaders = hostedDemo
      ? { 'x-bean-hosted-demo': 'true', 'x-bean-local-only': 'false' }
      : { 'x-bean-hosted-demo': 'false', 'x-bean-local-only': 'true' };
    const rateLimit = rateLimiter.check(req);
    const baseApiHeaders = {
      ...securityHeaders({ requestId }),
      ...modeHeaders,
      ...rateLimitHeaders(rateLimit),
    };
    const baseHtmlHeaders = {
      ...securityHeaders({ requestId, contentSecurityPolicy: demoContentSecurityPolicy }),
      ...modeHeaders,
      ...rateLimitHeaders(rateLimit),
    };
    const withMeta = (payload) => ({
      api_version: API_VERSION,
      public_demo: hostedDemo,
      hosted_demo: hostedDemo,
      http_request_id: requestId,
      ...payload,
    });
    const countStatus = (statusCode) => incrementCounter(metrics.by_status, String(statusCode));
    const reply = (statusCode, payload, extraHeaders = {}) => {
      countStatus(statusCode);
      sendJson(res, statusCode, withMeta(payload), { ...baseApiHeaders, ...extraHeaders });
    };
    const replyRawJson = (statusCode, payload, extraHeaders = {}) => {
      countStatus(statusCode);
      sendJson(res, statusCode, payload, { ...baseApiHeaders, ...extraHeaders });
    };
    const replyHtml = (statusCode, html, extraHeaders = {}) => {
      countStatus(statusCode);
      sendHtml(res, statusCode, html, { ...baseHtmlHeaders, ...extraHeaders });
    };

    try {
      if (!rateLimit.allowed) {
        metrics.rate_limited += 1;
        reply(429, {
          ok: false,
          error: 'rate_limit_exceeded',
          retry_after_seconds: rateLimit.retryAfterSeconds,
          limit_per_minute: rateLimit.limit,
        }, { 'retry-after': String(rateLimit.retryAfterSeconds) });
        return;
      }

      if (req.method === 'OPTIONS') {
        reply(403, {
          ok: false,
          error: 'CORS is disabled by default for the local-only V0 server.',
        });
        return;
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/demo')) {
        replyHtml(200, fs.readFileSync(DEMO_ASSET_PATH, 'utf8'));
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
          rate_limit_per_minute: rateLimit.limit,
          api_key_auth_required: authConfig().required,
          security_headers: true,
          request_body_logging: false,
          request_body_persistence: false,
          disk_ledger_writes_default: !hostedDemo,
          warning: hostedDemo ? HOSTED_DEMO_WARNING : 'Local API only. Do not expose private data unless you own the environment.',
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/ready') {
        const auth = authConfig();
        reply(200, {
          ok: true,
          production_ready: false,
          production_ready_reason: 'V0 can accept public demo traffic only. Customer/live execution traffic requires the blocked gates below.',
          gates: {
            public_demo_boundary: { status: 'pass', hosted_demo: hostedDemo, input_scope: 'public_or_synthetic_only' },
            security_headers: { status: 'pass', hsts_preload: false },
            rate_limit: { status: 'pass', limit_per_minute: rateLimit.limit },
            metadata_only_metrics: { status: 'pass', request_body_logging: false, request_body_persistence: false },
            auth: {
              status: auth.production_ready ? 'pass' : 'blocked_requires_api_key_secret_and_enable_flag',
              require_flag: 'BEAN_GATEWAY_REQUIRE_API_KEY=1',
              secret_env: 'BEAN_GATEWAY_API_KEY',
            },
            external_dispatch: { status: 'blocked_not_supported', endpoint: '/v0/dispatch' },
            external_supplier_execution: { status: 'blocked_not_supported' },
            payment_rails: { status: 'blocked_not_supported' },
            private_context: { status: 'blocked_not_supported' },
            durable_audit_log: { status: hostedDemo ? 'blocked_not_supported_in_public_demo' : 'partial_local_only' },
            tenant_isolation: { status: 'blocked_not_supported' },
            abuse_review_queue: { status: 'blocked_not_supported' },
          },
          required_before_customer_traffic: [
            'enable authenticated tenants and scoped API keys',
            'add durable audit logs with retention controls',
            'add private-context vaulting and tenant isolation',
            'add supplier identity, scoring, settlement, and dispute controls',
            'add payment rails and cost accounting',
            'add operational monitoring and abuse response',
          ],
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/openapi.json') {
        replyRawJson(200, buildOpenApiSpec());
        return;
      }

      if (req.method === 'GET' && (pathname === '/examples' || pathname === '/open-demand/examples')) {
        metrics.open_demand.examples += 1;
        reply(200, openDemand.examples());
        return;
      }

      if (req.method === 'GET' && pathname === '/open-demand/health') {
        reply(200, openDemand.health());
        return;
      }

      if (req.method === 'GET' && pathname === '/open-demand/learning') {
        metrics.open_demand.learning_reports += 1;
        reply(200, {
          ok: true,
          learning: openDemand.learning(),
          request_body_persistence: false,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/open-demand/latest') {
        reply(200, await openDemand.latest());
        return;
      }

      if (req.method === 'GET' && pathname === '/open-demand/opportunities') {
        reply(200, await openDemand.opportunities());
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/open-demand/tasks/') && pathname.endsWith('/report')) {
        const taskId = pathname.replace(/^\/open-demand\/tasks\//, '').replace(/\/report$/, '');
        metrics.open_demand.reports += 1;
        reply(200, await openDemand.report(taskId));
        return;
      }

      if (req.method === 'POST' && pathname === '/open-demand/scan') {
        const body = await readJsonBody(req);
        const hostedRejectReason = hostedDemo ? rejectHostedDemoInput(body) : null;
        if (hostedRejectReason) {
          metrics.hosted_rejections += 1;
          reply(400, {
            ok: false,
            hosted_demo: true,
            error: hostedRejectReason,
            warning: HOSTED_DEMO_WARNING,
          });
          return;
        }
        const payload = await openDemand.scan(body);
        metrics.open_demand.scans += 1;
        metrics.open_demand.guardrail_violations += Number(payload.metrics?.guardrail_violations || 0);
        reply(200, payload);
        return;
      }

      if (req.method === 'POST' && (pathname === '/path' || pathname === '/open-demand/path')) {
        const body = await readJsonBody(req);
        const hostedRejectReason = hostedDemo ? rejectHostedDemoInput(body) : null;
        if (hostedRejectReason) {
          metrics.hosted_rejections += 1;
          reply(400, {
            ok: false,
            hosted_demo: true,
            error: hostedRejectReason,
            warning: HOSTED_DEMO_WARNING,
          });
          return;
        }
        const payload = await openDemand.path(body);
        metrics.open_demand.paths += 1;
        reply(200, payload);
        return;
      }

      if (req.method === 'POST' && pathname.startsWith('/open-demand/opportunities/') && pathname.endsWith('/bundle')) {
        const opportunityId = pathname.replace(/^\/open-demand\/opportunities\//, '').replace(/\/bundle$/, '');
        metrics.open_demand.bundles += 1;
        reply(201, await openDemand.bundle(decodeURIComponent(opportunityId)));
        return;
      }

      if (req.method === 'POST' && pathname.startsWith('/open-demand/tasks/') && pathname.endsWith('/run')) {
        const taskId = pathname.replace(/^\/open-demand\/tasks\//, '').replace(/\/run$/, '');
        metrics.open_demand.runs += 1;
        const payload = await openDemand.run(decodeURIComponent(taskId));
        metrics.open_demand.proof_runs += 1;
        reply(201, payload);
        return;
      }

      if (req.method === 'POST' && (pathname === '/feedback' || pathname === '/open-demand/feedback')) {
        const body = await readJsonBody(req);
        const hostedRejectReason = hostedDemo ? rejectHostedDemoInput(body) : null;
        if (hostedRejectReason) {
          metrics.hosted_rejections += 1;
          reply(400, {
            ok: false,
            hosted_demo: true,
            error: hostedRejectReason,
            warning: HOSTED_DEMO_WARNING,
          });
          return;
        }
        const payload = openDemand.feedback(body);
        metrics.feedback_recorded += 1;
        metrics.open_demand.feedback += 1;
        if (payload.feedback?.helpful === true) metrics.open_demand.feedback_helpful += 1;
        reply(201, payload);
        return;
      }

      const authorization = authorizeRequest(req, pathname);
      if (!authorization.ok) {
        reply(authorization.statusCode, {
          ok: false,
          error: authorization.error,
          api_key_auth_required: authorization.config.required,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/metrics') {
        reply(200, {
          ok: true,
          metrics_scope: 'metadata_only',
          request_body_logging: false,
          request_body_persistence: false,
          rate_limiter: rateLimiter.snapshot(),
          metrics: {
            ...metrics,
            uptime_seconds: Math.round((Date.now() - Date.parse(metrics.started_at)) / 1000),
          },
        });
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
          metrics.hosted_rejections += 1;
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
        const policyState = route.response?.decision?.policy_state || 'unknown';
        if (metrics.route_decisions[policyState] == null) metrics.route_decisions.unknown += 1;
        else metrics.route_decisions[policyState] += 1;
        reply(200, scrubLocalPaths({
          ...route.response,
          hosted_demo: hostedDemo,
          local_server_note: hostedDemo
            ? 'Hosted demo mode: public/synthetic inputs only, no artifact persistence, no disk ledger writes, no request-body logging.'
            : 'Localhost-only V0 API. Response is a route decision, not permission for external action.',
        }));
        return;
      }

      if (req.method === 'POST' && pathname === '/dispatch') {
        metrics.dispatch_attempts += 1;
        const input = await readJsonBody(req);
        const hostedRejectReason = hostedDemo ? rejectHostedDemoInput(input) : null;
        if (hostedRejectReason) {
          metrics.hosted_rejections += 1;
          reply(400, {
            ok: false,
            hosted_demo: true,
            error: hostedRejectReason,
            warning: HOSTED_DEMO_WARNING,
          });
          return;
        }
        reply(403, {
          ok: false,
          error: 'dispatch_disabled_in_v0',
          message: 'V0 returns route decisions only. It never executes suppliers, external tools, public writes, paid APIs, or customer traffic.',
          spend_usd: 0,
          external_writes: 0,
          external_executions: 0,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/outcomes') {
        const input = await readJsonBody(req);
        if (hostedDemo) {
          const record = buildOutcomeRecord(input);
          memoryLedger.push(record);
          metrics.outcomes_recorded += 1;
          reply(200, {
            ledger_path: 'memory://hosted-demo/outcomes',
            record,
            hosted_demo: true,
            persisted_to_disk: false,
          });
          return;
        }
        const outcome = recordOutcome(input, { ledgerPath });
        metrics.outcomes_recorded += 1;
        reply(200, outcome);
        return;
      }

      reply(404, {
        ok: false,
        error: 'Not found',
      });
    } catch (error) {
      metrics.errors += 1;
      if (error instanceof OpenDemandError) {
        reply(error.statusCode || 400, {
          ok: false,
          error: error.message,
        });
        return;
      }
      if (error.code === 'BODY_TOO_LARGE') {
        metrics.body_too_large += 1;
        reply(413, {
          ok: false,
          error: error.message,
          max_body_bytes: MAX_JSON_BODY_BYTES,
        });
        return;
      }
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
