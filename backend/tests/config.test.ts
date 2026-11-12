import { test } from 'node:test';
import assert from 'node:assert/strict';

const { validateConfig, config } = await import('../src/config');

const prodCfg = () => ({
  ...config,
  isProduction: true as const,
  nodeEnv: 'production',
  devLogin: false,
  authSecret: 'x'.repeat(40),
  billingWebhookSecret: 'y'.repeat(40),
});

test('validateConfig rejects production with DEV_LOGIN', () => {
  assert.throws(
    () => validateConfig({ ...prodCfg(), devLogin: true }),
    /DEV_LOGIN/,
  );
});

test('validateConfig rejects weak AUTH_SECRET in production', async () => {
  delete process.env.AUTH_SECRET;
  const { __devAuthSecretDefault } = await import('../src/config');
  assert.throws(
    () => validateConfig({ ...prodCfg(), authSecret: __devAuthSecretDefault }),
    /AUTH_SECRET/,
  );
});

test('validateConfig allows dev defaults in non-production', () => {
  assert.doesNotThrow(() => validateConfig({ ...config, isProduction: false, devLogin: true }));
});
