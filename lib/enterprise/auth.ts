import type { EnterpriseDatabase } from './store';
import { boundedJson, EnterpriseHttpError, json, sha256 } from './http';
import { createEnterpriseOidcClient, type OidcConfiguration } from './oidc-client';
import { consumeLoginTransaction, generateOpaqueToken, saveLoginTransaction } from './login-transactions';
import { cleanupExpiredLoginSessions, endEnterpriseSession, finalizeVerifiedLoginSession } from './login-sessions';

// Enterprise authentication is independent from Sites headers and cookies.
export interface EnterpriseAuthEnvironment {
  ENTERPRISE_DB: EnterpriseDatabase;
  APP_ORIGIN: string;
  ENTERPRISE_LOGIN_ENABLED?: string;
  LOGIN_ENCRYPTION_KEY?: string;
  GOOGLE_OIDC_CLIENT_ID?: string;
  GOOGLE_OIDC_CLIENT_SECRET?: string;
  ENTRA_OIDC_CLIENT_ID?: string;
  ENTRA_OIDC_CLIENT_SECRET?: string;
  ENTRA_TENANT_ID?: string;
}
type Provider = 'google' | 'entra';
const sessionCookie = '__Host-relay_session';
const loginCookie = '__Host-relay_login';
const sessionSeconds = 8 * 60 * 60;

function origin(env: EnterpriseAuthEnvironment): string {
  try {
    const url = new URL(env.APP_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN || url.username || url.password) throw new Error();
    return url.origin;
  } catch { throw new EnterpriseHttpError(503, 'Enterprise sign-in is not configured.'); }
}

function configuration(env: EnterpriseAuthEnvironment, provider: Provider): OidcConfiguration {
  const relayOrigin = origin(env);
  if (env.ENTERPRISE_LOGIN_ENABLED !== 'true' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(env.LOGIN_ENCRYPTION_KEY ?? '')) {
    throw new EnterpriseHttpError(503, 'Enterprise sign-in is not configured.');
  }
  const config: OidcConfiguration = {
    provider, relayOrigin, redirectUri: `${relayOrigin}/api/v2/auth/${provider}/callback`,
    clientId: (provider === 'google' ? env.GOOGLE_OIDC_CLIENT_ID : env.ENTRA_OIDC_CLIENT_ID) ?? '',
    clientSecret: (provider === 'google' ? env.GOOGLE_OIDC_CLIENT_SECRET : env.ENTRA_OIDC_CLIENT_SECRET) ?? '',
    ...(provider === 'entra' ? { tenantId: env.ENTRA_TENANT_ID } : {}),
  };
  try { createEnterpriseOidcClient(config); }
  catch { throw new EnterpriseHttpError(503, 'Enterprise sign-in is not configured.'); }
  return config;
}

export function enterpriseLoginProviders(env: EnterpriseAuthEnvironment): Provider[] {
  return (['google', 'entra'] as const).filter(provider => {
    try { configuration(env, provider); return true; } catch { return false; }
  });
}

function cookieValue(request: Request, name: string): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function cookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function finish(response: Response, cookies: string[] = []): Response {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  for (const item of cookies) response.headers.append('Set-Cookie', item);
  return response;
}
async function emptySameOriginPost(request: Request, env: EnterpriseAuthEnvironment): Promise<void> {
  if (request.headers.get('origin') !== origin(env) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new EnterpriseHttpError(403, 'Use the authorized Relay workspace.');
  }
  const body = await boundedJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
    throw new EnterpriseHttpError(400, 'Send an empty JSON object.');
  }
}

async function sessionProfile(request: Request, db: EnterpriseDatabase): Promise<Response> {
  const token = cookieValue(request, sessionCookie);
  if (!token) throw new EnterpriseHttpError(401, 'Sign in to continue.');
  const now = new Date().toISOString();
  const rows = await db.prepare(`SELECT s.user_id AS userId, m.org_id AS organizationId, m.role, o.name
    FROM sessions s JOIN memberships m ON m.user_id = s.user_id JOIN organizations o ON o.id = m.org_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.created_at <= ? AND s.expires_at > ?
      AND m.status = 'active' AND o.status = 'active' ORDER BY m.org_id LIMIT 200`)
    .bind(await sha256(token), now, now).all<{ userId: string; organizationId: string; role: string; name: string }>();
  if (!rows.results.length) throw new EnterpriseHttpError(401, 'Sign in to an active workspace to continue.');
  return json({ userId: rows.results[0].userId,
    memberships: rows.results.map(({ organizationId, role, name }) => ({ organizationId, role, name })), limit: 200 });
}

/** Dependency injection is for unit fixtures only; Worker routes always use the verified OIDC adapter. */
export async function handleEnterpriseAuth(request: Request, env: EnterpriseAuthEnvironment,
  createClient: typeof createEnterpriseOidcClient = createEnterpriseOidcClient): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v2/auth/')) return null;
  let clearLogin = false;
  try {
    const route = /^\/api\/v2\/auth\/(google|entra)\/(start|callback)$/.exec(url.pathname);
    const session = url.pathname === '/api/v2/auth/session';
    const logout = url.pathname === '/api/v2/auth/logout';
    if (!route && !session && !logout) throw new EnterpriseHttpError(404, 'Route not found.');
    const method = session || route?.[2] === 'callback' ? 'GET' : 'POST';
    if (request.method !== method) return finish(new Response(null, { status: 405, headers: { Allow: method } }));
    if (!env.ENTERPRISE_DB) throw new EnterpriseHttpError(503, 'Enterprise storage is not configured.');
    if (url.origin !== origin(env)) throw new EnterpriseHttpError(403, 'Use the authorized Relay workspace.');
    if (url.search && route?.[2] !== 'callback') throw new EnterpriseHttpError(400, 'Unexpected query parameters.');
    if (session) return finish(await sessionProfile(request, env.ENTERPRISE_DB));
    if (logout) {
      await emptySameOriginPost(request, env);
      const token = cookieValue(request, sessionCookie);
      const browserToken = cookieValue(request, loginCookie);
      await endEnterpriseSession(env.ENTERPRISE_DB, token, browserToken, new Date().toISOString());
      return finish(new Response(null, { status: 204 }), [cookie(sessionCookie, '', 0), cookie(loginCookie, '', 0)]);
    }
    const provider = route![1] as Provider;
    const config = configuration(env, provider);
    const client = createClient(config);
    if (route![2] === 'start') {
      await emptySameOriginPost(request, env);
      const { authorizationUrl, transaction } = await client.begin();
      const browserToken = generateOpaqueToken();
      const now = new Date().toISOString();
      // A deliberate new attempt replaces an older browser-bound login attempt.
      await endEnterpriseSession(env.ENTERPRISE_DB, null, cookieValue(request, loginCookie), now);
      await cleanupExpiredLoginSessions(env.ENTERPRISE_DB, now);
      await saveLoginTransaction(env.ENTERPRISE_DB, env.LOGIN_ENCRYPTION_KEY!, provider, transaction, browserToken, now);
      return finish(json({ authorizationUrl }), [cookie(loginCookie, browserToken, 600)]);
    }
    clearLogin = true;
    const allowed = new Set(['state', 'code', 'iss', 'session_state', 'error', 'error_description', 'error_uri']);
    if (request.url.length > 8192 || Array.from(url.searchParams.keys()).some(key => !allowed.has(key)
      || url.searchParams.getAll(key).length !== 1)) throw new EnterpriseHttpError(400, 'Sign-in could not be completed. Start again.');
    const browserToken = cookieValue(request, loginCookie);
    const state = url.searchParams.get('state');
    if (!browserToken || !state) throw new EnterpriseHttpError(400, 'Sign-in could not be completed. Start again.');
    const transaction = await consumeLoginTransaction(env.ENTERPRISE_DB, env.LOGIN_ENCRYPTION_KEY!, provider,
      state, browserToken, new Date().toISOString());
    if (!transaction) throw new EnterpriseHttpError(400, 'Sign-in could not be completed. Start again.');
    let identity: { issuer: string; subject: string };
    try { identity = await client.exchange(request.url, transaction); }
    catch { throw new EnterpriseHttpError(400, 'Sign-in could not be completed. Start again.'); }
    const token = await finalizeVerifiedLoginSession(env.ENTERPRISE_DB,
      { identity, provider, state, browserToken, previousToken: cookieValue(request, sessionCookie) }, new Date().toISOString());
    if (!token) throw new EnterpriseHttpError(403, 'Sign-in was cancelled, expired, or has no active Relay workspace access.');
    // The UI can replace this fixed destination once its authenticated workspace is integrated.
    return finish(new Response(null, { status: 303, headers: { Location: `${config.relayOrigin}/api/v2/auth/session` } }),
      [cookie(sessionCookie, token, sessionSeconds), cookie(loginCookie, '', 0)]);
  } catch (error) {
    if (!(error instanceof EnterpriseHttpError)) throw error;
    return finish(json({ error: error.message }, error.status), clearLogin ? [cookie(loginCookie, '', 0)] : []);
  }
}
