import type { OidcTransaction } from './oidc-client';
import type { EnterpriseDatabase } from './store';
import { sha256 } from './http';

type Provider = 'entra' | 'google';
type LoginRow = {
  stateHash: string; provider: Provider; browserHash: string; createdAt: string;
  expiresAt: string; iv: string; encryptedPayload: string;
};
const ttlMs = 10 * 60 * 1000;
const encoder = new TextEncoder();
const failure = () => new Error('Unable to process login transaction.');
const opaque = /^[A-Za-z0-9_-]{43}$/;
const oidcRandom = /^[A-Za-z0-9_-]{32,256}$/;

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw failure();
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (encode(bytes) !== value) throw failure();
  return bytes;
}
function timestamp(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw failure();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw failure();
  return time;
}
function validProvider(provider: Provider): boolean { return provider === 'google' || provider === 'entra'; }
function validBrowser(token: string): boolean {
  try { return typeof token === 'string' && opaque.test(token) && decode(token).length === 32; }
  catch { return false; }
}
function validateTransaction(transaction: OidcTransaction): void {
  if (!transaction || typeof transaction !== 'object' ||
    Object.keys(transaction).sort().join(',') !== 'codeVerifier,nonce,redirectUri,state' ||
    typeof transaction.state !== 'string' || !oidcRandom.test(transaction.state) ||
    typeof transaction.nonce !== 'string' || !oidcRandom.test(transaction.nonce) ||
    typeof transaction.codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(transaction.codeVerifier) ||
    typeof transaction.redirectUri !== 'string' || transaction.redirectUri.length > 2048) throw failure();
  const redirect = new URL(transaction.redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.port || redirect.hash || redirect.search ||
    redirect.href !== transaction.redirectUri) throw failure();
}
async function key(value: string): Promise<CryptoKey> {
  if (typeof value !== 'string' || !opaque.test(value)) throw failure();
  const bytes = decode(value);
  if (bytes.length !== 32) throw failure();
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function additionalData(row: Pick<LoginRow, 'provider' | 'stateHash' | 'browserHash' | 'createdAt' | 'expiresAt'>): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(['relay.login.v1', row.provider, row.stateHash, row.browserHash, row.createdAt, row.expiresAt]));
}

/** Cryptographically random opaque browser/session token; it carries no identity. */
export function generateOpaqueToken(): string { return encode(crypto.getRandomValues(new Uint8Array(32))); }

/** Only server-created OIDC transactions are accepted. No raw state or browser token is stored. */
export async function saveLoginTransaction(db: EnterpriseDatabase, encryptionKey: string, provider: Provider,
  transaction: OidcTransaction, browserToken: string, now: string): Promise<void> {
  try {
    const created = timestamp(now);
    if (!validProvider(provider) || !validBrowser(browserToken)) throw failure();
    validateTransaction(transaction);
    const encryption = await key(encryptionKey);
    const row = { provider, stateHash: await sha256(transaction.state), browserHash: await sha256(browserToken),
      createdAt: now, expiresAt: new Date(created + ttlMs).toISOString() };
    timestamp(row.expiresAt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = encoder.encode(JSON.stringify({ nonce: transaction.nonce, codeVerifier: transaction.codeVerifier, redirectUri: transaction.redirectUri }));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(row), tagLength: 128 }, encryption, payload);
    await db.prepare(`INSERT INTO login_transactions
      (state_hash, provider, browser_hash, created_at, expires_at, iv, encrypted_payload, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
      .bind(row.stateHash, provider, row.browserHash, now, row.expiresAt, encode(iv), encode(new Uint8Array(ciphertext))).run();
  } catch { throw failure(); }
}

/** One atomic claim precedes decryption/exchange. A failed decrypt permanently burns this attempt. */
export async function consumeLoginTransaction(db: EnterpriseDatabase, encryptionKey: string, provider: Provider,
  state: string, browserToken: string, now: string): Promise<OidcTransaction | null> {
  // Configuration errors must not burn a valid transaction.
  const encryption = await key(encryptionKey);
  let current: number;
  try {
    current = timestamp(now);
    if (!validProvider(provider) || typeof state !== 'string' || !oidcRandom.test(state) || !validBrowser(browserToken)) return null;
  } catch { return null; }
  const stateHash = await sha256(state);
  const browserHash = await sha256(browserToken);
  const row = await db.prepare(`UPDATE login_transactions SET consumed_at = ?
    WHERE state_hash = ? AND provider = ? AND browser_hash = ? AND consumed_at IS NULL
      AND created_at <= ? AND expires_at > ?
    RETURNING state_hash AS stateHash, provider, browser_hash AS browserHash, created_at AS createdAt,
      expires_at AS expiresAt, iv, encrypted_payload AS encryptedPayload`)
    .bind(now, stateHash, provider, browserHash, now, now).first<LoginRow>();
  if (!row) return null;
  try {
    const created = timestamp(row.createdAt);
    const expires = timestamp(row.expiresAt);
    if (row.stateHash !== stateHash || row.browserHash !== browserHash || row.provider !== provider ||
      created > current || expires <= current || expires <= created || expires - created > ttlMs ||
      typeof row.iv !== 'string' || row.iv.length !== 16 || typeof row.encryptedPayload !== 'string' ||
      row.encryptedPayload.length < 32 || row.encryptedPayload.length > 4096) return null;
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(row.iv), additionalData: additionalData(row), tagLength: 128 }, encryption, decode(row.encryptedPayload));
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).sort().join(',') !== 'codeVerifier,nonce,redirectUri') return null;
    const transaction = { ...payload, state } as OidcTransaction;
    validateTransaction(transaction);
    return transaction;
  } catch { return null; }
}

/** Bounded cleanup includes consumed tombstones only after expiry; callers may run it periodically. */
export async function cleanupExpiredLoginTransactions(db: EnterpriseDatabase, now: string, limit = 100): Promise<number> {
  timestamp(now);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw failure();
  const result = await db.prepare(`DELETE FROM login_transactions WHERE state_hash IN
    (SELECT state_hash FROM login_transactions WHERE expires_at <= ? ORDER BY expires_at, state_hash LIMIT ?)
    RETURNING state_hash`).bind(now, limit).all();
  return result.results.length;
}

/** Explicit logout invalidates pending attempts for this opaque browser binding. */
export async function invalidateBrowserLoginTransactions(db: EnterpriseDatabase, browserToken: string, now: string): Promise<void> {
  timestamp(now);
  if (!validBrowser(browserToken)) return;
  await db.prepare(`UPDATE login_transactions SET consumed_at = ?
    WHERE browser_hash = ? AND consumed_at IS NULL AND created_at <= ? AND expires_at > ?`)
    .bind(now, await sha256(browserToken), now, now).run();
}
