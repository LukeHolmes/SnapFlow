// SnapFlow backend — modular monolith (architecture §5.1). A single stateless
// deployable; scale horizontally by running more instances behind a load balancer.
import express, { type Request } from 'express';
import { config } from './config';
import { errorMiddleware } from './errors';
import { authRouter } from './auth/routes';
import { entitlementsRouter } from './entitlements/routes';
import './entitlements/account-route';
import { aiRouter } from './ai/routes';
import { vaultRouter } from './vault/routes';
import { billingRouter } from './billing/routes';
import { syncRouter } from './sync/routes';
import { deliverRouter } from './deliver/routes';
import { oauthRouter } from './oauth/routes';
import { integrationsRouter } from './integrations/routes';
import { teamsRouter } from './teams/routes';
import { evidenceRouter } from './evidence/routes';
import { initDb } from './store';
import { validateConfig } from './config';

export function createApp() {
  const app = express();
  app.use(express.json({
    limit: '30mb', // screenshots (incl. blobs) arrive base64-encoded
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf.toString('utf8');
    },
  }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'snapflow-backend' }));

  app.use(authRouter);
  app.use(entitlementsRouter);
  app.use(aiRouter);
  app.use(vaultRouter);
  app.use(billingRouter);
  app.use(syncRouter);
  app.use(deliverRouter);
  app.use(oauthRouter);
  app.use(integrationsRouter);
  app.use(teamsRouter);
  app.use(evidenceRouter);

  app.use(errorMiddleware);
  return app;
}

// Boot only when run directly (tests import createApp without listening).
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  validateConfig();
  initDb()
    .then(() => createApp().listen(config.port, () => console.log(`SnapFlow backend listening on :${config.port} (${config.databaseUrl ? 'postgres' : 'sqlite'})`)))
    .catch(err => { console.error('Failed to start:', err); process.exit(1); });
}
