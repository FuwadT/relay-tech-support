import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const scopes = new Set(['integration','contracts','platform','interface','diagnostics','dependencies','verification']);
const [command, scope, owner] = process.argv.slice(2);
if (!['status','claim','release'].includes(command) || (command !== 'status' && (!scopes.has(scope) || !/^[a-z][a-z0-9-]{0,39}$/.test(owner ?? '')))) {
  console.error('Usage: node scripts/coordination.mjs status | claim|release <scope> <agent>');
  process.exit(2);
}
const common = execFileSync('git', ['rev-parse','--path-format=absolute','--git-common-dir'], {encoding:'utf8'}).trim();
const directory = resolve(common, 'relay-agent-locks');
mkdirSync(directory, {recursive:true});
if (command === 'status') {
  for (const entry of readdirSync(directory)) {
    try { console.log(readFileSync(join(directory,entry,'owner.json'),'utf8')); }
    catch { console.log(`${entry}: initialization pending; do not remove`); }
  }
} else {
  const lock = join(directory,scope);
  if (command === 'claim') {
    try { mkdirSync(lock); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      console.error(`Scope ${scope} is already claimed. Read status and coordinate with its owner.`);
      process.exit(1);
    }
    writeFileSync(join(lock,'owner.json'), JSON.stringify({scope,owner,checkout:process.cwd(),claimedAt:new Date().toISOString()},null,2));
    console.log(`Claimed ${scope} for ${owner}`);
  } else {
    const metadata = JSON.parse(readFileSync(join(lock,'owner.json'),'utf8'));
    if (metadata.owner !== owner) { console.error('Only the recorded owner may release this scope.'); process.exit(1); }
    // The validated scope resolves strictly below the repository-owned lock directory.
    rmSync(lock, {recursive:true});
    console.log(`Released ${scope} for ${owner}`);
  }
}
