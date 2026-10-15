import type { TelemetrySnapshot, ValidationResult } from './contracts';

const snapshotFields = ['schemaVersion', 'collectionId', 'platform', 'osVersion', 'architecture',
  'source', 'collectorVersion', 'collectedAt', 'sampleIntervalMs', 'cpuPercent', 'memoryTotalMb',
  'memoryUsedMb', 'diskTotalGb', 'diskFreeGb', 'dnsResolved', 'gatewayLatencyMs', 'processes',
  'eventExcerpts', 'errors'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(): never { throw new Error('Invalid telemetry snapshot.'); }

function object(input: unknown, fields: string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).length !== fields.length || fields.some(field =>
    !Object.hasOwn(descriptors, field) || !('value' in descriptors[field]))) return invalid();
  return input as Record<string, unknown>;
}

function choice<T extends string>(input: unknown, values: readonly T[]): T {
  if (typeof input !== 'string' || !values.includes(input as T)) return invalid();
  return input as T;
}

function text(input: unknown, limit: number): string {
  // Excerpts are plain text. This boundary does not certify their redaction or
  // make them trusted HTML, instructions, or executable collector output.
  if (typeof input !== 'string' || input.length < 1 || input.length > limit ||
    /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input) || !input.trim()) return invalid();
  return input;
}

function identifier(input: unknown): string {
  const result = text(input, 64);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) return invalid();
  return result;
}

function nullableNumber(input: unknown, max: number, min = 0): number | null {
  if (input === null) return null;
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) return invalid();
  return input;
}

function list(input: unknown, max: number): unknown[] {
  if (!Array.isArray(input) || input.length > max) return invalid();
  // Sparse arrays and custom keys cannot silently disappear on JSON serialization.
  if (Reflect.ownKeys(input).length !== input.length + 1) return invalid();
  const values: unknown[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (!descriptor || !('value' in descriptor)) return invalid();
    values.push(descriptor.value);
  }
  return values;
}

function utcDate(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input)) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return invalid();
  // Date.parse normalizes impossible calendar dates in some runtimes.
  if (date.toISOString().slice(0, 19) !== input.slice(0, 19)) return invalid();
  return input;
}

/** A pure, bounded import boundary; identity, redaction review and storage consent remain separate gates. */
export function validateTelemetrySnapshot(input: unknown): ValidationResult<TelemetrySnapshot> {
  try {
    const value = object(input, snapshotFields);
    if (value.schemaVersion !== 1 || typeof value.collectionId !== 'string' || !uuid.test(value.collectionId)) return invalid();
    const source = choice(value.source, ['collector', 'user-reported', 'synthetic'] as const);
    let collectorVersion: string | null = null;
    if (value.collectorVersion !== null) {
      collectorVersion = text(value.collectorVersion, 64);
      if (!/^[a-z0-9][a-z0-9._+-]*$/i.test(collectorVersion)) return invalid();
    }
    if (source === 'collector' && collectorVersion === null) return invalid();
    const memoryTotalMb = nullableNumber(value.memoryTotalMb, 16777216);
    const memoryUsedMb = nullableNumber(value.memoryUsedMb, 16777216);
    const diskTotalGb = nullableNumber(value.diskTotalGb, 16777216);
    const diskFreeGb = nullableNumber(value.diskFreeGb, 16777216);
    if (memoryTotalMb !== null && memoryUsedMb !== null && memoryUsedMb > memoryTotalMb) return invalid();
    if (diskTotalGb !== null && diskFreeGb !== null && diskFreeGb > diskTotalGb) return invalid();
    if (value.dnsResolved !== null && typeof value.dnsResolved !== 'boolean') return invalid();
    const processes = list(value.processes, 20).map(inputProcess => {
      const process = object(inputProcess, ['pid', 'name', 'cpuPercent', 'memoryMb']);
      const pid = nullableNumber(process.pid, 4294967295);
      if (pid === null || !Number.isInteger(pid)) return invalid();
      return { pid, name: text(process.name, 128), cpuPercent: nullableNumber(process.cpuPercent, 100),
        memoryMb: nullableNumber(process.memoryMb, 16777216) };
    });
    const eventExcerpts = list(value.eventExcerpts, 20).map(inputEvent => {
      const event = object(inputEvent, ['eventId', 'text']);
      return { eventId: identifier(event.eventId), text: text(event.text, 512) };
    });
    const errors = list(value.errors, 32).map(inputError => {
      const error = object(inputError, ['checkId', 'code']);
      return { checkId: identifier(error.checkId),
        code: choice(error.code, ['unavailable', 'permission_denied', 'timeout', 'unsupported'] as const) };
    });
    return { ok: true, value: {
      schemaVersion: 1, collectionId: value.collectionId.toLowerCase(),
      platform: choice(value.platform, ['windows', 'macos', 'ubuntu'] as const),
      osVersion: text(value.osVersion, 120), architecture: choice(value.architecture, ['x64', 'arm64'] as const),
      source, collectorVersion, collectedAt: utcDate(value.collectedAt),
      sampleIntervalMs: nullableNumber(value.sampleIntervalMs, 3600000, 1),
      cpuPercent: nullableNumber(value.cpuPercent, 100), memoryTotalMb, memoryUsedMb, diskTotalGb, diskFreeGb,
      dnsResolved: value.dnsResolved as boolean | null, gatewayLatencyMs: nullableNumber(value.gatewayLatencyMs, 3600000),
      processes, eventExcerpts, errors,
    } };
  } catch { return { ok: false, error: 'Invalid telemetry snapshot.' }; }
}
