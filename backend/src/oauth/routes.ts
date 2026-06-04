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
import { issueToken } from '../auth/tokens';
import { config } from '../config';
import { AppError, asyncHandler } from '../errors';

export const oauthRouter = Router();

function callbackUri(providerId: string): string {
  return `${config.oauthRedirectBase}/auth/oauth/${providerId}/callback`;
}

oauthRouter.get('/auth/oauth/:provider/start', asyncHandler(async (req, res) => {
  const provider = getProvider(req.params.provider);
  if (!provider) throw new AppError(404, 'unknown_provider', `No OAuth provider '${req.params.provider}'`);
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
  if (!provdierForState || provdierForState !== req.params.provider) {
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
    const token = await provider.exchangeCode(code, callbackUri(provider.providerId));
    const profile = await provider.describe(token);
    await storeDestinationToken(accountId, provider.destination, token, profile);
    if (config.appRedirectUrl) {
      res.redirect(`${config.appRedirectUrl}?oauth=connected&destination=${encodeURIComponent(provider.destination)}`);
    } else {
      res.json({ ok: true, destination: provider.destination, profile });
    }
    return;
  }

  const provider = getProvider(provdierForState)!;

  const accessToken = await exchangeCode(provider, code, callbackUri(provider.id));
  const email = await fetchEmail(provider, accessToken);
  if (!email) throw new AppError(400, 'no_email', 'Provider did not return an email address');

  // New users start on Free; tier changes flow through billing.
  const account = await accounts.getOrCreate(email, 'free');
  const token = issueToken(account.id);

  // Deep-link back into the desktop app when configured; otherwise return JSON.
  if (config.appRedirectUrl) {
    res.redirect(`${config.appRedirectUrl}?token=${encodeURIComponent(token)}`);
  } else {
    res.json({ token, account: { id: account.id, email: account.email, tier: account.tier } });
  }
}));
