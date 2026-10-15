import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the real auth module with simulated platform dispatch. This does not
// verify that a hosted proxy strips forged platform headers; that is a release gate.
function auth(headers: Record<string, string> = {}) {
  const exports: Record<string, any> = {};
  const requestHeaders = new Headers(headers);
  const source = ts.transpileModule(readFileSync('app/chatgpt-auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    exports, URL,
    require(name: string) {
      if (name === 'next/headers') return {
        headers: async () => requestHeaders,
        cookies: async () => ({ get: (key: string) => {
          const value = requestHeaders.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${key}=`))?.slice(key.length + 1);
          return value === undefined ? undefined : { value };
        } }),
      };
      if (name === 'next/navigation') return { redirect: (path: string) => { throw new Error(`redirect:${path}`); } };
      throw new Error(`Add an explicit test adapter for ${name}`);
    },
  });
  return exports;
}

test('browser cookies and role headers cannot create a signed-in identity', async () => {
  const module = auth({ cookie: 'relay_user_id=victim; relay_email=support@relay.test; relay_role=admin', 'x-relay-role': 'admin' });
  assert.equal(await module.getChatGPTUser(), null);
});

test('forged role inputs cannot override the platform owner or grant support', async () => {
  for (const email of ['customer@example.invalid', 'support@relay.test', 'operator@relay.support']) {
    const user = await auth({
      'oai-authenticated-user-id': 'real-owner', 'oai-authenticated-user-email': email,
      cookie: 'relay_user_id=victim; relay_role=admin', 'x-relay-role': 'admin',
      'oai-authenticated-user-role': 'admin',
    }).getChatGPTUser();
    assert.equal(user.userId, 'real-owner');
    assert.ok(user.role === undefined || user.role === 'customer');
  }
});

test('partial platform identity remains signed out', async () => {
  const partials: Record<string, string>[] = [{ 'oai-authenticated-user-id': 'owner' }, { 'oai-authenticated-user-email': 'owner@example.invalid' }];
  for (const headers of partials) {
    assert.equal(await auth(headers).getChatGPTUser(), null);
  }
});

test('sign-in and sign-out return paths reject external and recursive redirects', () => {
  const module = auth();
  for (const path of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']) {
    assert.equal(module.chatGPTSignInPath(path), '/signin-with-chatgpt?return_to=%2F');
    assert.equal(module.chatGPTSignOutPath(path), '/signout-with-chatgpt?return_to=%2F');
  }
  assert.equal(module.chatGPTSignInPath('/cases?status=open#latest'), '/signin-with-chatgpt?return_to=%2Fcases%3Fstatus%3Dopen%23latest');
});
