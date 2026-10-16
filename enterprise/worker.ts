import type { D1Database } from '@cloudflare/workers-types';
import { boundedJson, EnterpriseHttpError, json, UUID, validateEnterpriseCase } from '../lib/enterprise/http';
import { createEnterpriseCase, listEnterpriseCases, readEnterpriseCase, resolveEnterprisePrincipal } from '../lib/enterprise/store';
import { enterpriseLoginProviders, handleEnterpriseAuth, type EnterpriseAuthEnvironment } from '../lib/enterprise/auth';

export interface EnterpriseEnvironment extends EnterpriseAuthEnvironment {
  ENTERPRISE_DB: D1Database;
  APP_ORIGIN: string;
}
export async function handleEnterpriseRequest(request: Request, env: EnterpriseEnvironment): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      const providers = enterpriseLoginProviders(env);
      return json({ service: 'relay-enterprise', stage: 'foundation', oidcEnabled: providers.length > 0,
        oidcProviders: providers, modelCallsEnabled: false, deviceExecutionEnabled: false });
    }
    const authResponse = await handleEnterpriseAuth(request, env);
    if (authResponse) return authResponse;
    const route = /^\/api\/v2\/organizations\/([0-9a-f-]+)\/cases(?:\/([0-9a-f-]+))?$/i.exec(url.pathname);
    if (!route || !UUID.test(route[1]) || (route[2] && !UUID.test(route[2]))) throw new EnterpriseHttpError(404, 'Route not found.');
    if (url.search) throw new EnterpriseHttpError(400, 'Unexpected query parameters.');
    if (!['GET', 'POST'].includes(request.method) || (request.method === 'POST' && route[2])) {
      return new Response(null, { status: 405, headers: { Allow: route[2] ? 'GET' : 'GET, POST', 'Cache-Control': 'no-store' } });
    }
    if (!env.ENTERPRISE_DB) throw new EnterpriseHttpError(503, 'Enterprise storage is not configured.');
    const now = new Date().toISOString();
    const principal = await resolveEnterprisePrincipal(env.ENTERPRISE_DB, request, route[1].toLowerCase(), now);
    if (request.method === 'GET') {
      if (route[2]) return json({ case: await readEnterpriseCase(env.ENTERPRISE_DB, principal, route[2].toLowerCase(), new Date().toISOString()) });
      return json({ cases: await listEnterpriseCases(env.ENTERPRISE_DB, principal, new Date().toISOString()), limit: 200 });
    }
    // No CORS grant. Origin must match deployment configuration, never Host or a supplied redirect.
    if (!env.APP_ORIGIN || new URL(env.APP_ORIGIN).origin !== env.APP_ORIGIN
      || url.origin !== env.APP_ORIGIN || request.headers.get('origin') !== env.APP_ORIGIN
      || request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new EnterpriseHttpError(403, 'Use the authorized Relay workspace.');
    }
    const key = request.headers.get('idempotency-key');
    if (!key || !UUID.test(key)) throw new EnterpriseHttpError(400, 'Provide a UUID Idempotency-Key.');
    const result = validateEnterpriseCase(await boundedJson(request));
    if (result.ok === false) throw new EnterpriseHttpError(400, result.error);
    const created = await createEnterpriseCase(env.ENTERPRISE_DB, principal, result.value, key, new Date().toISOString());
    return json(created, created.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof EnterpriseHttpError) return json({ error: error.message, requestId }, error.status);
    // Never include exception messages, SQL, credentials or case content in general logs.
    console.error(JSON.stringify({ event: 'enterprise_request_failed', requestId, category: 'unexpected_error' }));
    const authentication = new URL(request.url).pathname.startsWith('/api/v2/auth/');
    const response = json({ error: authentication ? 'Unable to complete authentication. Please try again.'
      : 'Unable to complete the request. Please retry with the same save key.', requestId }, 500);
    if (authentication) response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } finally {
    // workerd must release rejected mutation bodies as well as successful ones.
    // Bound work independently of a caller-supplied Content-Length.
    if (request.body && !request.bodyUsed) {
      const reader = request.body.getReader();
      let discarded = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          discarded += part.value.byteLength;
          if (discarded > 16_384) { await reader.cancel(); break; }
        }
      } catch { /* Disconnected rejected requests do not change the response. */ }
      finally { reader.releaseLock(); }
    }
  }
}
export default { fetch: handleEnterpriseRequest };
