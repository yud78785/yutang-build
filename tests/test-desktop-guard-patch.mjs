import assert from 'node:assert/strict';
import { patchApiProcess } from '../tools/jobguard/patch-desktop-guard.mjs';

const fixture=[
  "import { spawn } from 'node:child_process';",
  "import path from 'node:path';",
  "class ApiProcess {",
  "  constructor() { this.pending = new Map(); this.secrets = new Set(); this.stderr = ''; }",
  "  async start() {",
  "    this.child = spawn('node', [], {});",
  "    try {",
  "      const result = await this.request('start', { options: {} });",
  "    } catch (error) {}",
  "  }",
  "  configure(config) { return this.request('configure', { config }); }",
  "  async stopOnce() {",
  "    this.secrets.clear();",
  "  }",
  "}"
].join('\n');

const patched=patchApiProcess(fixture);
assert.match(patched,/async attachDesktopJobGuard\(\)/);
assert.match(patched,/--target-pid/);
assert.match(patched,/READY /);
assert.match(patched,/guard\.once\('exit'/);
assert.match(patched,/this\.child\.kill\('SIGKILL'\)/);
assert.ok(patched.indexOf('await this.attachDesktopJobGuard()')<
  patched.indexOf("const result = await this.request('start'"));
assert.throws(()=>patchApiProcess(patched),/anchor mismatch/);
assert.throws(()=>patchApiProcess(fixture.replace('const result = await this.request', 'const result = await this.other')),
  /guard-before-worker-start pinned anchor mismatch/);
assert.throws(()=>patchApiProcess(fixture.replace("this.secrets.clear();", "this.secrets.delete('secret');")),
  /guard shutdown pinned anchor mismatch/);
assert.throws(()=>patchApiProcess(fixture.replace("import path from 'node:path';", "import path from 'node:fs';")),
  /guard fs import pinned anchor mismatch/);
console.log('PASS desktop worker Job Object patch: pinned anchors, target PID handshake, guarded order, drift rejection.');
