import type { D1Database } from '@cloudflare/workers-types';
import { boundedJson, EnterpriseHttpError, json, UUID, validateEnterpriseCase } from '../lib/enterprise/http';
import { createEnterpriseCase, listEnterpriseCases, readEnterpriseCase, resolveEnterprisePrincipal } from '../lib/enterprise/store';
import { getCollectorScript } from '../lib/enterprise/collector-scripts';
import { validateTelemetrySnapshot } from '../lib/enterprise/telemetry-validation';
import { executeDeductiveTriage } from '../lib/enterprise/ai-provider-adapter';
import type {
  DevicePlatform,
  EnterpriseTriageStage,
  EvidenceFinding,
  ModelProvider,
  TelemetrySnapshot,
  TriageHypothesis,
} from '../lib/enterprise/contracts';

export interface EnterpriseEnvironment {
  ENTERPRISE_DB: D1Database;
  APP_ORIGIN: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
}
export async function handleEnterpriseRequest(request: Request, env: EnterpriseEnvironment): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ service: 'relay-enterprise', stage: 'foundation', oidcEnabled: false, modelCallsEnabled: false, deviceExecutionEnabled: false });
    }

    // Collector Script Download Route (Mirrored in enterprise worker)
    const collectorMatch = /^\/api\/collectors\/([a-zA-Z0-9_-]+)(?:\.(?:ps1|sh))?$/i.exec(url.pathname);
    if (collectorMatch) {
      if (request.method !== 'GET') {
        return new Response(null, { status: 405, headers: { Allow: 'GET' } });
      }
      const platformParam = collectorMatch[1].toLowerCase();
      const script = getCollectorScript(platformParam);
      if (!script) {
        return new Response('Collector script not found. Supported platforms: windows11, ubuntu, macos', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      const rawCaseId = url.searchParams.get('caseId') || '';
      const rawCallbackUrl = url.searchParams.get('callbackUrl') || '';
      const safeCaseId = rawCaseId.replace(/[^a-zA-Z0-9_-]/g, '');
      let safeCallbackUrl = '';
      if (rawCallbackUrl) {
        try {
          const parsedCb = new URL(rawCallbackUrl);
          if (parsedCb.protocol === 'http:' || parsedCb.protocol === 'https:') {
            safeCallbackUrl = parsedCb.toString().replace(/["`$\\]/g, '');
          }
        } catch {}
      }

      let content = script.content;
      if (safeCallbackUrl || safeCaseId) {
        if (script.platform === 'windows') {
          const inject = `$env:RELAY_CASE_ID = "${safeCaseId}"\n$env:RELAY_CALLBACK_URL = "${safeCallbackUrl}"\n`;
          content = inject + content;
        } else {
          const inject = `export RELAY_CASE_ID="${safeCaseId}"\nexport RELAY_CALLBACK_URL="${safeCallbackUrl}"\n`;
          content = content.replace(/^#!\/usr\/bin\/env bash\n/, `#!/usr/bin/env bash\n${inject}`);
        }
      }

      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': script.contentType,
          'Content-Disposition': `attachment; filename="${script.filename}"`,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Direct Telemetry Callback Ingestion Route (Mirrored in enterprise worker)
    const telemetryMatch = /^\/api\/cases\/([0-9a-f-]+)\/telemetry$/i.exec(url.pathname);
    if (telemetryMatch) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }
      if (request.method === 'POST') {
        const caseId = telemetryMatch[1];
        const raw = await boundedJson(request);
        const parsed = validateTelemetrySnapshot(raw);
        if (parsed.ok === false) {
          return json({ ok: false, error: parsed.error }, 400);
        }
        return json({ ok: true, caseId, telemetry: parsed.value }, 200);
      }
      return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    }

    // Dedicated AI Triage Route
    if (url.pathname === '/api/ai/triage') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }
      if (request.method === 'POST') {
        const body = (await boundedJson(request)) as {
          userMessage?: unknown;
          stage?: EnterpriseTriageStage;
          conversationHistory?: Array<{ sender: 'user' | 'assistant'; text: string }>;
          platform?: DevicePlatform;
          snapshot?: TelemetrySnapshot | null;
          findings?: EvidenceFinding[];
          hypotheses?: TriageHypothesis[];
          providerConfig?: {
            provider?: ModelProvider;
            apiKey?: string;
            model?: string;
          };
        };
        if (!body?.userMessage || typeof body.userMessage !== 'string') {
          return json({ ok: false, error: 'userMessage is required.' }, 400);
        }
        const provider = body.providerConfig?.provider || 'gemini';
        const apiKey =
          body.providerConfig?.apiKey?.trim() ||
          (provider === 'gemini'
            ? env.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '')
            : env.OPENAI_API_KEY || (typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : '')) ||
          '';

        const result = await executeDeductiveTriage(
          {
            stage: body.stage || 'deductive_questioning',
            userMessage: body.userMessage,
            conversationHistory: body.conversationHistory || [],
            platform: body.platform || 'windows',
            snapshot: body.snapshot || null,
            findings: body.findings || [],
            hypotheses: body.hypotheses || [],
          },
          {
            provider,
            apiKey,
            model: body.providerConfig?.model || (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'),
            modelAllowlist: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gpt-4o', 'gpt-4o-mini'],
            enabled: true,
            timeoutMs: 15000,
          }
        );
        return json({ ok: true, data: result }, 200);
      }
      return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    }
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
    return json({ error: 'Unable to complete the request. Please retry with the same save key.', requestId }, 500);
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
const enterpriseWorker = { fetch: handleEnterpriseRequest };
export default enterpriseWorker;
