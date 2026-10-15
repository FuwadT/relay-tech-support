import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readExecutionProfile } from './execution-profile.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
if (readExecutionProfile() === 'managed-linux') {
  process.exit(run('bash', ['scripts/install-pnpm.sh']));
}
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expected = manifest.packageManager.replace(/^pnpm@/, '');
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Run pnpm run install:ci using the package.json pinned pnpm version.');
const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== expected || !/pnpm/i.test(cli)) {
  throw new Error(`Installation requires pnpm ${expected}; use pnpm run install:ci.`);
}
process.exit(run(process.execPath, [cli, 'install', '--frozen-lockfile']));
