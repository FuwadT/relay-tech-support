import type { D1Database } from '@cloudflare/workers-types';
import type { EnterpriseCase, EnterpriseCaseInput, EnterprisePrincipal } from './contracts';
import { EnterpriseHttpError, sha256 } from './http';

export type EnterpriseDatabase = Pick<D1Database, 'prepare' | 'batch'>;
// All parameters are bound; only fixed SQL fragments are composed here.
const active = `s.revoked_at IS NULL AND s.created_at <= ? AND s.expires_at > ?
  AND m.status = 'active' AND o.status = 'active'`;
const joins = `JOIN memberships m ON m.org_id = c.org_id AND m.user_id = s.user_id
  JOIN organizations o ON o.id = m.org_id`;
const fields = `c.id, c.org_id AS organizationId, c.requester_id AS requesterId,
  c.title, c.description, c.platform, c.status, c.created_at AS createdAt, c.updated_at AS updatedAt`;

/** Cookie contents are opaque random tokens, never JSON identity/roles. */
export async function resolveEnterprisePrincipal(db: EnterpriseDatabase, request: Request, organizationId: string, now: string): Promise<EnterprisePrincipal> {
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim());
  const sessionCookies = cookies.filter(part => part.startsWith('__Host-relay_session='));
  if (sessionCookies.length !== 1) throw new EnterpriseHttpError(401, 'Sign in to continue.');
  const token = sessionCookies[0].slice('__Host-relay_session='.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new EnterpriseHttpError(401, 'Sign in to continue.');
  const hash = await sha256(token);
  const session = await db.prepare(`SELECT s.id AS sessionId, s.user_id AS userId FROM sessions s
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.created_at <= ? AND s.expires_at > ?`)
    .bind(hash, now, now).first<{ sessionId: string; userId: string }>();
  if (!session) throw new EnterpriseHttpError(401, 'Sign in to continue.');
  const membership = await db.prepare(`SELECT m.role FROM memberships m JOIN organizations o ON o.id = m.org_id
    WHERE m.org_id = ? AND m.user_id = ? AND m.status = 'active' AND o.status = 'active'`)
    .bind(organizationId, session.userId).first<{ role: EnterprisePrincipal['role'] }>();
  if (!membership) throw new EnterpriseHttpError(404, 'Workspace not found.');
  return { ...session, organizationId, role: membership.role };
}

export async function listEnterpriseCases(db: EnterpriseDatabase, principal: EnterprisePrincipal, now: string): Promise<EnterpriseCase[]> {
  const result = await db.prepare(`SELECT ${fields} FROM enterprise_cases c
    JOIN sessions s ON s.id = ? ${joins}
    WHERE c.org_id = ? AND ${active}
    AND (m.role IN ('technician', 'administrator') OR c.requester_id = s.user_id)
    ORDER BY c.updated_at DESC, c.id DESC LIMIT 200`)
    .bind(principal.sessionId, principal.organizationId, now, now).all<EnterpriseCase>();
  return result.results;
}
export async function readEnterpriseCase(db: EnterpriseDatabase, principal: EnterprisePrincipal, caseId: string, now: string): Promise<EnterpriseCase> {
  const record = await db.prepare(`SELECT ${fields} FROM enterprise_cases c
    JOIN sessions s ON s.id = ? ${joins}
    WHERE c.id = ? AND c.org_id = ? AND ${active}
    AND (m.role IN ('technician', 'administrator') OR c.requester_id = s.user_id)`)
    .bind(principal.sessionId, caseId, principal.organizationId, now, now).first<EnterpriseCase>();
  if (!record) throw new EnterpriseHttpError(404, 'Case not found.');
  return record;
}

export async function createEnterpriseCase(db: EnterpriseDatabase, principal: EnterprisePrincipal, input: EnterpriseCaseInput, key: string, now: string): Promise<{ case: EnterpriseCase; replayed: boolean }> {
  const caseId = crypto.randomUUID();
  const keyHash = await sha256(key.toLowerCase());
  const payloadHash = await sha256(JSON.stringify(input));
  // D1 batch is transactional. Each write checks active session/membership in
  // the transaction so revocation between initial auth and mutation fails closed.
  const auth = `EXISTS (SELECT 1 FROM sessions s JOIN memberships m ON m.user_id = s.user_id
    JOIN organizations o ON o.id = m.org_id WHERE s.id = ? AND s.user_id = ? AND m.org_id = ? AND ${active})`;
  const guard = [principal.sessionId, principal.userId, principal.organizationId, now, now];
  await db.batch([
    db.prepare(`INSERT INTO enterprise_create_requests(org_id,requester_id,key_hash,payload_hash,case_id,created_at)
      SELECT ?,?,?,?,?,? WHERE ${auth}
      ON CONFLICT(org_id,requester_id,key_hash) DO NOTHING`)
      .bind(principal.organizationId, principal.userId, keyHash, payloadHash, caseId, now, ...guard),
    db.prepare(`INSERT INTO enterprise_cases(id,org_id,requester_id,title,description,platform,status,device_authorized_at,consent_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'open',?,?,?,? FROM enterprise_create_requests r
      WHERE r.org_id = ? AND r.requester_id = ? AND r.key_hash = ? AND r.case_id = ? AND ${auth}`)
      .bind(caseId, principal.organizationId, principal.userId, input.title, input.description, input.platform, now, now, now, now,
        principal.organizationId, principal.userId, keyHash, caseId, ...guard),
    db.prepare(`INSERT INTO audit_events(id,org_id,actor_id,action,case_id,created_at)
      SELECT ?,?,?,'case.created',?,? FROM enterprise_cases c WHERE c.id = ? AND c.org_id = ? AND ${auth}`)
      .bind(crypto.randomUUID(), principal.organizationId, principal.userId, caseId, now, caseId, principal.organizationId, ...guard),
  ]);
  const reservation = await db.prepare(`SELECT r.payload_hash AS payloadHash, r.case_id AS caseId
    FROM enterprise_create_requests r WHERE r.org_id = ? AND r.requester_id = ? AND r.key_hash = ? AND ${auth}`)
    .bind(principal.organizationId, principal.userId, keyHash, ...guard).first<{ payloadHash: string; caseId: string }>();
  if (!reservation) throw new EnterpriseHttpError(403, 'Workspace access changed. Sign in again.');
  if (reservation.payloadHash !== payloadHash) throw new EnterpriseHttpError(409, 'This save key belongs to different case details.');
  try {
    const record = await readEnterpriseCase(db, principal, reservation.caseId, now);
    return { case: record, replayed: reservation.caseId !== caseId };
  } catch (error) {
    if (error instanceof EnterpriseHttpError && error.status === 404) throw new EnterpriseHttpError(410, 'The original case is unavailable. It will not be recreated.');
    throw error;
  }
}
