// Real OAuth 2.0 login (authorization-code), replacing the dev token in production.
//   GET /auth/oauth/:provider/start     → redirect to the provider with a CSRF state
//   GET /auth/oauth/:provider/callback  → verify state, exchange code, fetch email,
//                                         get-or-create the account, issue our bearer
import { Router } from 'express';
import { getProvider, buildAuthorizeUrl, exchangeCode, fetchEmail } from './providers';
import { getDestinationProvider } from './destination-providers';
import { storeDestinationToken } from './destination-tokens';
import { oauthState } from './state';
import { accounts } from '../accounts/store';
import { mintAuthCredentials } from '../auth/sessions';
import { config } from '../config';
import { AppError, asyncHandler } from '../errors';
import { routeParam } from '../params';

export const oauthRouter = Router();

function callbackUri(providerId: string): string {
  return `${config.oauthRedirectBase}/auth/oauth/${providerId}/callback`;
}

oauthRouter.get('/auth/oauth/:provider/start', asyncHandler(async (req, res) => {
  const providerId = routeParam(req.params.provider);
  const provider = getProvider(providerId);
  if (!provider) throw new AppError(404, 'unknown_provider', `No OAuth provider '${providerId}'`);
  const state = await oauthState.create(provider.id);
  res.redirect(buildAuthorizeUrl(provider, state, callbackUri(provider.id)));
}));

oauthRouter.get('/auth/oauth/:provider/callback', asyncHandler(async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  if (!code || !state) throw new AppError(400, 'bad_request', 'code and state are required');

  // Single-use CSRF state; must match the provider in the path.
  const oauth = await oauthState.consumeContext(state);
  const provdierForState = oauth?.provider;
  if (!provdierForState || provdierForState !== routeParam(req.params.provider)) {
    throw new AppError(400, 'invalid_state', 'OAuth state is missing, expired, or mismatched');
  }
  const flow = String(oauth?.data.flow ?? 'account');

  if (flow === 'destination') {
    const destination = String(oauth?.data.destination ?? '');
    const accountId = String(oauth?.data.accountId ?? '');
    const provider = getDestinationProvider(destination);
    if (!provider || provider.providerId !== provdierForState) {
      throw new AppError(400, 'invalid_state', 'Destination OAuth state is missing destination metadata');
    }
    if (!accountId) throw new AppError(400, 'invalid_state', 'Destination OAuth state is missing account metadata');
    try {
      const token = await provider.exchangeCode(code, callbackUri(provider.providerId));
      const profile = await provider.describe(token);
      await storeDestinationToken(accountId, provider.destination, token, profile);
      if (config.appRedirectUrl) {
        res.redirect(`${config.appRedirectUrl}?oauth=connected&destination=${encodeURIComponent(provider.destination)}`);
      } else {
        res.json({ ok: true, destination: provider.destination, profile });
      }
    } catch (err) {
      const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'OAuth failed';
      if (config.appRedirectUrl) {
        res.redirect(`${config.appRedirectUrl}?oauth=error&destination=${encodeURIComponent(provider.destination)}&error=${encodeURIComponent(message)}`);
      } else {
        throw err;
      }
    }
    return;
  }

  const provider = getProvider(provdierForState)!;

  const accessToken = await exchangeCode(provider, code, callbackUri(provider.id));
  const email = await fetchEmail(provider, accessToken);
  if (!email) throw new AppError(400, 'no_email', 'Provider did not return an email address');

  // New users start on Free; tier changes flow through billing.
  const account = await accounts.getOrCreate(email, 'free');
  const credentials = await mintAuthCredentials(account.id);

  // Deep-link back into the desktop app when configured; otherwise return JSON.
  if (config.appRedirectUrl) {
    const q = new URLSearchParams({
      token: credentials.accessToken,
      access: credentials.accessToken,
      refresh: credentials.refreshToken,
      expires_in: String(credentials.expiresIn),
    });
    res.redirect(`${config.appRedirectUrl}?${q.toString()}`);
  } else {
    res.json({
      token: credentials.accessToken,
      ...credentials,
      account: { id: account.id, email: account.email, tier: account.tier },
    });
  }
}));
