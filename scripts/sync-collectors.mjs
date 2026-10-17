#!/usr/bin/env node
/**
 * scripts/sync-collectors.mjs
 * Synchronizes collector scripts from lib/enterprise/collector-scripts.ts into public/collectors/.
 *
 * Usage:
 *   node scripts/sync-collectors.mjs         # Writes files if changed
 *   node scripts/sync-collectors.mjs --check # CI mode: fails if files are out of sync
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourcePath = path.join(rootDir, 'lib/enterprise/collector-scripts.ts');
const sourceContent = fs.readFileSync(sourcePath, 'utf8');

function extractConstant(name) {
  const regex = new RegExp(`export const ${name} = ("(?:[^"\\\\]|\\\\.)*");`);
  const match = sourceContent.match(regex);
  if (!match) {
    throw new Error(`Failed to extract constant ${name} from ${sourcePath}`);
  }
  return JSON.parse(match[1]);
}

const WINDOWS_COLLECTOR_SCRIPT = extractConstant('WINDOWS_COLLECTOR_SCRIPT');
const UBUNTU_COLLECTOR_SCRIPT = extractConstant('UBUNTU_COLLECTOR_SCRIPT');
const MACOS_COLLECTOR_SCRIPT = extractConstant('MACOS_COLLECTOR_SCRIPT');

const isCheckMode = process.argv.includes('--check');

const TARGETS = [
  { file: 'public/collectors/windows.ps1', content: WINDOWS_COLLECTOR_SCRIPT },
  { file: 'public/collectors/windows11.ps1', content: WINDOWS_COLLECTOR_SCRIPT },
  { file: 'public/collectors/ubuntu.sh', content: UBUNTU_COLLECTOR_SCRIPT },
  { file: 'public/collectors/macos.sh', content: MACOS_COLLECTOR_SCRIPT },
];

let hasDrift = false;

for (const target of TARGETS) {
  const fullPath = path.join(rootDir, target.file);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let existing = null;
  if (fs.existsSync(fullPath)) {
    existing = fs.readFileSync(fullPath, 'utf8');
  }

  if (existing !== target.content) {
    hasDrift = true;
    if (isCheckMode) {
      console.error(`[sync-collectors] DRIFT DETECTED in ${target.file}`);
    } else {
      fs.writeFileSync(fullPath, target.content, 'utf8');
      console.log(`[sync-collectors] Updated ${target.file}`);
    }
  } else {
    console.log(`[sync-collectors] In sync: ${target.file}`);
  }
}

if (isCheckMode && hasDrift) {
  console.error('[sync-collectors] Collector scripts are out of sync. Run `node scripts/sync-collectors.mjs` to update.');
  process.exit(1);
}

console.log('[sync-collectors] All collector scripts verified.');
