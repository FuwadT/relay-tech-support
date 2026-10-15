import type { IntakeInput } from './contracts';
import { validateIntake } from './validation';

export type IntakeSubmission = { key: string; payload: IntakeInput };
export type StoredIntakeDraft = {
  version: 1;
  ownerId: string;
  form: IntakeInput;
  submission: IntakeSubmission | null;
};

const fields = ['title', 'description', 'deviceName', 'category', 'os', 'ownership', 'consent'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
}

function copyForm(value: unknown): IntakeInput {
  if (!record(value) || !exactKeys(value, fields)) throw new Error('Invalid saved intake fields.');
  for (const [name, limit] of [['title', 120], ['description', 2000], ['deviceName', 100],
    ['os', 50], ['ownership', 50]] as const) {
    if (typeof value[name] !== 'string' || value[name].length > limit) throw new Error('Invalid saved intake text.');
  }
  if (!['performance', 'network'].includes(value.category as string) || typeof value.consent !== 'boolean') {
    throw new Error('Invalid saved intake choices.');
  }
  return {
    title: value.title as string, description: value.description as string,
    deviceName: value.deviceName as string, category: value.category as IntakeInput['category'],
    os: value.os as string, ownership: value.ownership as string, consent: value.consent,
  };
}

export function intakeDraftKey(ownerId: string): string {
  return `relay:intake-draft:v1:${encodeURIComponent(ownerId)}`;
}

export function makeIntakeSubmission(form: IntakeInput, key?: string): IntakeSubmission {
  const payload = copyForm(form);
  validateIntake(payload);
  let attemptKey = key;
  if (attemptKey === undefined) {
    try {
      if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('UUID unavailable');
      attemptKey = globalThis.crypto.randomUUID();
    } catch {
      throw new Error('This browser cannot securely identify a save attempt. Please use a supported secure browser.');
    }
  }
  if (typeof attemptKey !== 'string' || !uuid.test(attemptKey)) throw new Error('The save attempt key must be a UUID.');
  // Keep the exact payload sent, including harmless surrounding whitespace.
  // A later editable form must never change an uncertain request's replay.
  return Object.freeze({ key: attemptKey.toLowerCase(), payload: Object.freeze(payload) });
}

export function parseIntakeDraft(raw: string | null, ownerId: string): StoredIntakeDraft | null {
  if (raw === null || raw.length > 24000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !exactKeys(value, ['version', 'ownerId', 'form', 'submission']) ||
      value.version !== 1 || value.ownerId !== ownerId) return null;
    const form = copyForm(value.form);
    let submission: IntakeSubmission | null = null;
    if (value.submission !== null) {
      if (!record(value.submission) || !exactKeys(value.submission, ['key', 'payload']) ||
        typeof value.submission.key !== 'string') return null;
      submission = makeIntakeSubmission(copyForm(value.submission.payload), value.submission.key);
    }
    return { version: 1, ownerId, form, submission };
  } catch { return null; }
}
