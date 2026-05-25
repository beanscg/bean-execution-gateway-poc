import path from 'node:path';

import {
  defaultOutcomeLedgerPath,
  defaultRegistryPath,
  recordOutcome,
  runExecutionGateway,
} from '../../../scripts/execution-gateway-lib.mjs';
import {
  summarizeLedgerFile,
  summarizeRouteRun,
} from '../../../scripts/execution-gateway-tools.mjs';

export function findExecutionPath(request, options = {}) {
  return runExecutionGateway(request, {
    registryPath: options.registryPath || defaultRegistryPath,
    outDir: options.outDir,
    generatedAt: options.generatedAt,
  }).response;
}

export function recordExecutionOutcome(outcome, options = {}) {
  return recordOutcome(outcome, {
    ledgerPath: options.ledgerPath || defaultOutcomeLedgerPath,
    recordedAt: options.recordedAt,
  }).record;
}

export function summarizeExecutionLedger(options = {}) {
  return summarizeLedgerFile(options.ledgerPath || defaultOutcomeLedgerPath);
}

export function summarizeExecutionRoute(routeRunDir) {
  return summarizeRouteRun(path.resolve(routeRunDir));
}
