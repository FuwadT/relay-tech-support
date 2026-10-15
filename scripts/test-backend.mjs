import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
const out = '.sites-runtime/backend-tests';
mkdirSync(out, {recursive: true});
writeFileSync(`${out}/package.json`, '{"type":"commonjs"}');
const tests = readdirSync('tests').filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`);
for (const args of [
  ['node_modules/typescript/bin/tsc', '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--esModuleInterop', '--skipLibCheck', ...tests],
  ['--test', ...tests.map(name => `${out}/${name.replace(/\.ts$/, '.js')}`)],
]) {
  const result = spawnSync(process.execPath, args, {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
