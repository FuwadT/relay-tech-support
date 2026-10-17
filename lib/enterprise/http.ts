import type { EnterpriseCaseInput, ValidationResult } from './contracts';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class EnterpriseHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function json(value: unknown, status = 200, customHeaders: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...customHeaders,
  } });
}
export async function boundedJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) {
    throw new EnterpriseHttpError(415, 'Send application/json.');
  }
  const maximum = maxBytes;
  if (Number(request.headers.get('content-length')) > maximum) throw new EnterpriseHttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new EnterpriseHttpError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new EnterpriseHttpError(413, 'Request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new EnterpriseHttpError(400, 'Provide valid JSON.'); }
}
export function validateEnterpriseCase(input: unknown): ValidationResult<EnterpriseCaseInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Provide case details.' };
  const value = input as Record<string, unknown>;
  const allowed = ['title', 'description', 'platform', 'deviceAuthorization', 'storageConsent'];
  if (Object.keys(value).some(key => !allowed.includes(key))) return { ok: false, error: 'Unexpected case fields.' };
  if (typeof value.title !== 'string' || value.title.trim().length < 3 || value.title.trim().length > 120
    || typeof value.description !== 'string' || value.description.trim().length < 10 || value.description.trim().length > 4000) {
    return { ok: false, error: 'Title must be 3–120 characters and description 10–4,000 characters.' };
  }
  if (/[\u0000-\u001f\u007f]/u.test(value.title)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.description)) {
    return { ok: false, error: 'Remove unsupported control characters from case details.' };
  }
  if (typeof value.platform !== 'string' || !['windows', 'macos', 'ubuntu'].includes(value.platform)) return { ok: false, error: 'Select a supported device platform.' };
  if (value.deviceAuthorization !== true || value.storageConsent !== true) {
    return { ok: false, error: 'Confirm device authorization and storage consent.' };
  }
  return { ok: true, value: {
    title: value.title.trim(), description: value.description.trim(), platform: value.platform as EnterpriseCaseInput['platform'],
    deviceAuthorization: true, storageConsent: true,
  } };
}
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
