import type { SyncAgent } from '../sync/agent';
import type { Engine } from '../engine';

interface IntegrationRuntime {
  sync: SyncAgent | null;
  engine: Engine | null;
}

const runtime: IntegrationRuntime = {
  sync: null,
  engine: null,
};

export function configureIntegrationRuntime(next: Partial<IntegrationRuntime>): void {
  Object.assign(runtime, next);
}

export function getIntegrationRuntime(): IntegrationRuntime {
  return runtime;
}
