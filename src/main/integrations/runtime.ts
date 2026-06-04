import type { SyncAgent } from '../sync/agent';

interface IntegrationRuntime {
  sync: SyncAgent | null;
}

const runtime: IntegrationRuntime = {
  sync: null,
};

export function configureIntegrationRuntime(next: Partial<IntegrationRuntime>): void {
  Object.assign(runtime, next);
}

export function getIntegrationRuntime(): IntegrationRuntime {
  return runtime;
}
