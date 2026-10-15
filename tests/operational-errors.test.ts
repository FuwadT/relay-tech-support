import test from 'node:test';
import assert from 'node:assert/strict';
import { apiError, type CaseOperation } from '../lib/case-store';
import { InputError } from '../lib/validation';

test('failure logs identify safe operation and category while excluding hostile error content', async () => {
  const original = console.error;
  const logs: string[] = [];
  console.error = value => logs.push(String(value));
  try {
    const cases = [
      ['create_case', new TypeError('private SQL parameters')],
      ['read_case', new RangeError('private email@example.invalid')],
      ['update_case', new SyntaxError('private case notes')],
      ['delete_case', new Error('private database path')],
    ] as const;
    for (const [operation, error] of cases) {
      const response = apiError(error, operation);
      const body = await response.json() as { requestId: string; error: string };
      const log = JSON.parse(logs.at(-1)!);
      assert.equal(response.status, 500);
      assert.equal(log.operation, operation);
      assert.equal(log.requestId, body.requestId);
      assert.deepEqual(Object.keys(log).sort(), ['event', 'failureType', 'operation', 'requestId']);
      assert.doesNotMatch(JSON.stringify(log) + JSON.stringify(body), /private|parameters|email@example|case notes|database path/);
    }
    assert.deepEqual(logs.map(value => JSON.parse(value).failureType), ['type_error', 'range_error', 'syntax_error', 'unexpected_error']);
    apiError({ name: 'private error name', message: 'private notes' }, 'private operation' as CaseOperation);
    assert.equal(JSON.parse(logs.at(-1)!).operation, 'unknown');
    assert.equal(JSON.parse(logs.at(-1)!).failureType, 'unexpected_error');
    assert.doesNotMatch(logs.at(-1)!, /private/);
    const count = logs.length;
    assert.equal(apiError(new InputError('Invalid intake.'), 'create_case').status, 400);
    assert.equal(logs.length, count, 'Expected validation errors should not produce server failure events');
  } finally {
    console.error = original;
  }
});
