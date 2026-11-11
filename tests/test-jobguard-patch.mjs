import assert from 'node:assert/strict';
import { patchBrowserHost, patchCore } from '../tools/jobguard/patch-jobguard.mjs';

const host=[
  "import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';",
  "import path from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  "import { execFile } from 'node:child_process';",
  "import { promisify } from 'node:util';",
  "import { chromium } from './playwright-runtime.mjs';",
  "",
  "const execute = promisify(execFile);",
  "export async function runBrowserHost({ profile, controlDir, port, chromiumImpl = chromium, probeInstallation = probeEdgeInstallation, logger = console, processImpl = process } = {}) {",
  "  mkdirSync(controlDir, { recursive: true });",
  "  const stateFile = path.join(controlDir, 'browser.json'); let context, installation, focusFailed = false;",
  "  const writeState = (ready, extra = {}) => {};",
  "  try {",
  "    writeState(false);",
  "    try { installation = await probeInstallation(); } catch {}",
  "    context = await chromiumImpl.launchPersistentContext(profile, {});",
  "  }",
  "}"
].join('\n');
const core=[
  "    if (!owned) {",
  "      const output = openSync(path.join(CONTROL, 'browser-host.log'), 'a');",
  "      try {",
  "        const child = spawn(resolveNodeExecutable(), [path.join(ROOT, 'browser-host.mjs'), PROFILE, CONTROL, String(PORT)], {",
  "          detached: true, windowsHide: true, stdio: ['ignore', output, output],",
  "        });",
  "        hostPid = child.pid;",
  "        child.unref();",
  "      } finally { closeSync(output); }",
  "    }"
].join('\n');
const patchedHost=patchBrowserHost(host);
assert.match(patchedHost,/import \{ execFile, spawn \} from 'node:child_process';/);
assert.match(patchedHost,/async function attachWindowsJobGuard/);
assert.match(patchedHost,/YUTANG_REQUIRE_JOB_GUARD/);
assert.match(patchedHost,/jobguard\.exe/);
assert.ok(patchedHost.indexOf('attachWindowsJobGuard({ processImpl, logger })')<patchedHost.indexOf('chromiumImpl.launchPersistentContext'));
assert.match(patchCore(core),/YUTANG_REQUIRE_JOB_GUARD: '1'/);
assert.throws(()=>patchBrowserHost(host.replace("const execute = promisify(execFile);","const execute = promisify(other);")),/helper insertion anchor mismatch/);
assert.throws(()=>patchCore(core.replace("detached: true","detached: false")),/spawn anchor mismatch/);
console.log('PASS Job Object patch tests: exact anchors, guard required before Edge launch, Core passes the required flag, drift fails closed.');
