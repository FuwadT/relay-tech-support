import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnterpriseOidcClient, type OidcConfiguration, type OidcTransaction } from '../lib/enterprise/oidc-client';

const tenant = '533d3ac8-550d-4d08-836e-c84a393337b3';
const googleIssuer = 'https://accounts.google.com';
const entraIssuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
const keys = crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const otherKeys = crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const encode = (input: string | Uint8Array) => Buffer.from(input).toString('base64url');

function config(provider: 'entra' | 'google' = 'google'): OidcConfiguration {
  return { provider, tenantId: provider === 'entra' ? tenant : undefined, clientId: 'synthetic-client',
    clientSecret: 'synthetic-secret', relayOrigin: 'https://relay.example', redirectUri: 'https://relay.example/auth/callback' };
}

async function fixture(provider: 'entra' | 'google' = 'google', claimOverrides: Record<string, unknown> = {},
  behavior: { wrongSignature?: boolean; metadata?: Record<string, unknown>; missingIdToken?: boolean;
    redirect?: boolean; hanging?: boolean; oversized?: boolean; algorithm?: string } = {}) {
  const issuer = provider === 'entra' ? entraIssuer : googleIssuer;
  const tokenUrl = provider === 'entra' ? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` : 'https://oauth2.googleapis.com/token';
  const jwksUrl = provider === 'entra' ? `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys` : 'https://www.googleapis.com/oauth2/v3/certs';
  const authorizeUrl = provider === 'entra' ? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` : 'https://accounts.google.com/o/oauth2/v2/auth';
  const publicKey = await crypto.subtle.exportKey('jwk', (await keys).publicKey);
  let transaction: OidcTransaction;
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, init });
    assert.equal(init?.redirect, 'error');
    if (behavior.hanging) return new Promise<Response>(() => {});
    if (behavior.redirect) return new Response(null, { status: 302, headers: { Location: 'https://evil.example/steal' } });
    if (behavior.oversized) return Response.json({ content: 'x'.repeat(262145) });
    if (url === `${issuer}/.well-known/openid-configuration`) {
      return Response.json({ issuer, authorization_endpoint: authorizeUrl, token_endpoint: tokenUrl,
        jwks_uri: jwksUrl, response_types_supported: ['code'], subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'], ...behavior.metadata });
    }
    if (url === jwksUrl) return Response.json({ keys: [{ ...publicKey, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
    assert.equal(url, tokenUrl, 'Only pinned provider endpoints may be fetched');
    const params = new URLSearchParams(init?.body as string);
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('client_id'), 'synthetic-client');
    assert.equal(params.get('code_verifier'), transaction.codeVerifier);
    assert.equal(params.get('redirect_uri'), config(provider).redirectUri);
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: issuer, aud: 'synthetic-client', sub: 'synthetic-subject', iat: now,
      exp: now + 3600, nonce: transaction.nonce, ...claimOverrides };
    const payload = `${encode(JSON.stringify({ alg: behavior.algorithm ?? 'RS256', kid: 'fixture-key' }))}.${encode(JSON.stringify(claims))}`;
    const privateKey = (await (behavior.wrongSignature ? otherKeys : keys)).privateKey;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(payload));
    return Response.json({ access_token: 'synthetic-access-token', token_type: 'Bearer', expires_in: 3600,
      refresh_token: 'synthetic-refresh-token', ...(behavior.missingIdToken ? {} : { id_token: `${payload}.${encode(new Uint8Array(signature))}` }) });
  };
  const client = createEnterpriseOidcClient(config(provider), { fetch: transport, timeoutMs: 1000 });
  const begin = await client.begin();
  transaction = begin.transaction;
  const callback = new URL(config(provider).redirectUri);
  callback.search = new URLSearchParams({ code: 'synthetic-code', state: transaction.state }).toString();
  return { client, transaction, callback: callback.href, requests, authorizationUrl: begin.authorizationUrl };
}

test('OIDC uses PKCE S256, random state/nonce and returns only signed issuer/subject for both providers', async () => {
  for (const provider of ['google', 'entra'] as const) {
    const f = await fixture(provider);
    const authorization = new URL(f.authorizationUrl);
    assert.equal(authorization.searchParams.get('scope'), 'openid');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorization.searchParams.get('state'), f.transaction.state);
    assert.equal(authorization.searchParams.get('nonce'), f.transaction.nonce);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(f.transaction.codeVerifier));
    assert.equal(authorization.searchParams.get('code_challenge'), encode(new Uint8Array(hash)));
    assert.deepEqual(await f.client.exchange(f.callback, f.transaction), {
      issuer: provider === 'google' ? googleIssuer : entraIssuer, subject: 'synthetic-subject',
    });
    assert.equal(f.requests.length, 3, 'Discovery, token and signature JWKS must all be exercised');
    const second = await f.client.begin();
    assert.notEqual(second.transaction.state, f.transaction.state);
    assert.notEqual(second.transaction.nonce, f.transaction.nonce);
    assert.notEqual(second.transaction.codeVerifier, f.transaction.codeVerifier);
  }
});

test('OIDC rejects wrong audience, issuer, nonce, expired token and invalid subject', async () => {
  for (const claims of [{ aud: 'attacker-client' }, { iss: 'https://evil.example' }, { nonce: 'wrong-nonce' },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { sub: '' }, { sub: 'x'.repeat(256) },
    { iat: Math.floor(Date.now() / 1000) + 3600 }, { exp: 'never' }, { exp: null }, { aud: [] },
    { aud: ['synthetic-client', 'other-client'], azp: 'other-client' }]) {
    const f = await fixture('google', claims);
    await assert.rejects(f.client.exchange(f.callback, f.transaction), { message: 'OIDC authentication failed.' });
  }
});

test('OIDC explicitly rejects invalid signatures and absent ID tokens', async () => {
  for (const behavior of [{ wrongSignature: true }, { missingIdToken: true }, { algorithm: 'HS256' }, { algorithm: 'none' }]) {
    const f = await fixture('google', {}, behavior);
    await assert.rejects(f.client.exchange(f.callback, f.transaction), { message: 'OIDC authentication failed.' });
    if (behavior.wrongSignature) assert.ok(f.requests.some(r => r.url.includes('/certs')));
  }
});

test('OIDC rejects mismatched/duplicate state and unapproved callback locations before token exchange', async () => {
  const f = await fixture();
  for (const callback of [f.callback.replace(f.transaction.state, 'wrong-state'), `${f.callback}&state=duplicate`,
    `${f.callback}&iss=https%3A%2F%2Fevil.example`, `${f.callback}&code=duplicate`,
    f.callback.replace('relay.example', 'evil.example'), `${f.callback}#fragment`,
    f.callback.replace('/auth/callback', '/other')]) {
    await assert.rejects(f.client.exchange(callback, f.transaction), { message: 'OIDC authentication failed.' });
  }
  assert.equal(f.requests.length, 1, 'Invalid callbacks must not exchange a code');
  await assert.rejects(f.client.exchange(f.callback, { ...f.transaction, redirectUri: 'https://evil.example/callback' }));
  await assert.rejects(f.client.exchange(f.callback, { ...f.transaction, codeVerifier: 'short' }));
});

test('OIDC configuration requires a tenant-specific Entra issuer and an exact HTTPS Relay redirect', () => {
  for (const override of [{ provider: 'unknown' }, { relayOrigin: 'http://relay.example' },
    { redirectUri: 'https://evil.example/auth/callback' }, { redirectUri: 'https://relay.example/auth/callback?next=evil' },
    { redirectUri: 'https://relay.example/auth/callback#fragment' }, { redirectUri: 'https://user:secret@relay.example/auth/callback' },
    { clientId: '' }, { clientSecret: '' }, { relayOrigin: 'https://relay.example/path' }]) {
    assert.throws(() => createEnterpriseOidcClient({ ...config(), ...override } as OidcConfiguration), { message: 'OIDC authentication failed.' });
  }
  for (const tenantId of ['common', 'organizations', 'consumers', 'evil.example', tenant + '/other']) {
    assert.throws(() => createEnterpriseOidcClient({ ...config('entra'), tenantId }), { message: 'OIDC authentication failed.' });
  }
});

test('OIDC discovery cannot supply unapproved endpoints or cause redirect-following', async () => {
  for (const metadata of [{ issuer: 'https://evil.example' }, { token_endpoint: 'https://evil.example/token' },
    { jwks_uri: 'http://www.googleapis.com/keys' }, { authorization_endpoint: 'https://accounts.google.com.evil.example/auth' },
    { token_endpoint: 'https://oauth2.googleapis.com:444/token' }]) {
    await assert.rejects(fixture('google', {}, { metadata }), { message: 'OIDC authentication failed.' });
  }
  await assert.rejects(fixture('google', {}, { redirect: true }), { message: 'OIDC authentication failed.' });
  await assert.rejects(fixture('google', {}, { oversized: true }), { message: 'OIDC authentication failed.' });
});

test('OIDC network timeout is bounded and errors never expose provider content', async () => {
  const client = createEnterpriseOidcClient(config(), { timeoutMs: 50,
    fetch: async () => new Promise<Response>(() => {}) });
  await assert.rejects(client.begin(), { message: 'OIDC authentication failed.' });
  const providerError = createEnterpriseOidcClient(config(), { fetch: async () => {
    throw new Error('client-secret synthetic-sensitive-provider-content');
  } });
  await assert.rejects(providerError.begin(), { message: 'OIDC authentication failed.' });
});
