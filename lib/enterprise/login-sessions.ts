import type { EnterpriseDatabase } from './store';
import { sha256 } from './http';
import { generateOpaqueToken } from './login-transactions';

type VerifiedLogin = {
  identity: { issuer: string; subject: string };
  provider: 'entra' | 'google';
  state: string;
  browserToken: string;
  previousToken: string | null;
};
const sessionMs = 8 * 60 * 60 * 1000;
// Terminal rows keep only revocation linkage, never recoverable nonce/PKCE material.
const erasedPayload = 'A'.repeat(32);
const erasedIv = 'A'.repeat(16);
const failure = () => new Error('Unable to process login session.');
const tokenPattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
function validToken(value: unknown): value is string { return typeof value === 'string' && tokenPattern.test(value); }
function timestamp(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw failure();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw failure();
  return time;
}
function validInput(input: VerifiedLogin): boolean {
  if (!input || typeof input !== 'object' || !['entra', 'google'].includes(input.provider) ||
    typeof input.state !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(input.state) || !validToken(input.browserToken) ||
    !input.identity || typeof input.identity.issuer !== 'string' || input.identity.issuer.length > 512 ||
    typeof input.identity.subject !== 'string' || !input.identity.subject.length || input.identity.subject.length > 255 ||
    /[\u0000-\u0020\u007f]/.test(input.identity.issuer) || /[\u0000-\u001f\u007f]/.test(input.identity.subject)) return false;
  try {
    const issuer = new URL(input.identity.issuer);
    return issuer.protocol === 'https:' && !issuer.username && !issuer.password && !issuer.port && !issuer.search && !issuer.hash;
  } catch { return false; }
}

/** Caller must first atomically consume the transaction and verify the OIDC response. */
export async function finalizeVerifiedLoginSession(db: EnterpriseDatabase, input: VerifiedLogin, now: string): Promise<string | null> {
  const current = timestamp(now);
  if (!validInput(input)) return null;
  const expires = new Date(current + sessionMs).toISOString();
  timestamp(expires);
  const stateHash = await sha256(input.state);
  const browserHash = await sha256(input.browserToken);
  const token = generateOpaqueToken();
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const statements = [
    db.prepare(`INSERT INTO sessions(id, token_hash, user_id, created_at, expires_at)
      SELECT ?, ?, e.user_id, ?, ? FROM external_identities e
      WHERE e.issuer = ? AND e.subject = ? AND EXISTS (
        SELECT 1 FROM memberships m JOIN organizations o ON o.id = m.org_id
        WHERE m.user_id = e.user_id AND m.status = 'active' AND o.status = 'active')
      AND EXISTS (SELECT 1 FROM login_transactions t
        WHERE t.state_hash = ? AND t.browser_hash = ? AND t.provider = ?
          AND t.cancelled_at IS NULL AND t.session_id IS NULL
          AND t.consumed_at IS NOT NULL AND t.consumed_at >= t.created_at AND t.consumed_at <= ?
          AND t.created_at <= ? AND t.expires_at > ?)`)
      .bind(id, tokenHash, now, expires, input.identity.issuer, input.identity.subject,
        stateHash, browserHash, input.provider, now, now, now),
    db.prepare(`UPDATE login_transactions SET session_id = ?, encrypted_payload = ?, iv = ?
      WHERE state_hash = ? AND browser_hash = ? AND provider = ? AND session_id IS NULL
        AND cancelled_at IS NULL AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)`)
      .bind(id, erasedPayload, erasedIv, stateHash, browserHash, input.provider, id),
  ];
  if (validToken(input.previousToken)) {
    statements.push(db.prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ?
      AND revoked_at IS NULL AND created_at <= ? AND EXISTS (
        SELECT 1 FROM login_transactions t JOIN sessions s ON s.id = t.session_id
        WHERE t.state_hash = ? AND t.session_id = ? AND s.token_hash = ?)`)
      .bind(now, await sha256(input.previousToken), now, stateHash, id, tokenHash));
  }
  // D1 batches are atomic. Logout cannot interleave between session insertion and linkage.
  await db.batch(statements);
  const issued = await db.prepare(`SELECT s.id FROM sessions s JOIN login_transactions t ON t.session_id = s.id
    WHERE s.id = ? AND s.token_hash = ? AND t.state_hash = ? AND t.cancelled_at IS NULL
      AND s.revoked_at IS NULL AND s.created_at <= ? AND s.expires_at > ?`)
    .bind(id, tokenHash, stateHash, now, now).first();
  return issued ? token : null;
}

/** Cancel pending and in-flight callbacks and revoke their sessions atomically. */
export async function endEnterpriseSession(db: EnterpriseDatabase, token: string | null,
  browserToken: string | null, now: string): Promise<void> {
  timestamp(now);
  const statements = [];
  if (validToken(browserToken)) {
    const browserHash = await sha256(browserToken);
    statements.push(
      db.prepare(`UPDATE login_transactions SET cancelled_at = ?, encrypted_payload = ?, iv = ?
        WHERE browser_hash = ? AND cancelled_at IS NULL AND created_at <= ?`).bind(now, erasedPayload, erasedIv, browserHash, now),
      db.prepare(`UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL AND created_at <= ?
        AND id IN (SELECT session_id FROM login_transactions
          WHERE browser_hash = ? AND cancelled_at IS NOT NULL AND session_id IS NOT NULL)`)
        .bind(now, now, browserHash),
    );
  }
  if (validToken(token)) statements.push(db.prepare(`UPDATE sessions SET revoked_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL AND created_at <= ?`).bind(now, await sha256(token), now));
  if (statements.length) await db.batch(statements);
}

/** Keep links while their sessions could still be used by an in-flight callback. */
export async function cleanupExpiredLoginSessions(db: EnterpriseDatabase, now: string, limit = 100): Promise<number> {
  timestamp(now);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw failure();
  const result = await db.prepare(`DELETE FROM login_transactions WHERE state_hash IN (
    SELECT t.state_hash FROM login_transactions t LEFT JOIN sessions s ON s.id = t.session_id
    WHERE t.expires_at <= ? AND (t.session_id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at <= ?)
    ORDER BY t.expires_at, t.state_hash LIMIT ?)
    RETURNING state_hash`).bind(now, now, limit).all();
  return result.results.length;
}
