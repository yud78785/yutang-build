#!/usr/bin/env node
// Patch only the 1.4.7 Windows regression fixtures after the real Job Object helper is built.
// Original upstream test blobs are pinned; tests are strengthened, never skipped.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const UPSTREAM_COMMIT = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const EXPECTED = Object.freeze({
  'desktop/tests/api-process.test.mjs': 'a01780f2a1b9cab09033f1951f24e4b79f3fd21e',
  'desktop/tests/prepare-api-runtime.test.mjs': 'de91301f76cafabffeab1e090ec911fd433547ab'
});
const sha256 = value => createHash('sha256').update(value).digest('hex');
const gitBlobSha1 = value => createHash('sha1').update(Buffer.from('blob ' + value.length + '\0')).update(value).digest('hex');

function once(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error('TEST_FIXTURE_PATCH_ANCHOR_MISMATCH: ' + label);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchApiProcessTest(source) {
  source = once(source,
    "import path from 'node:path';\nimport { fileURLToPath } from 'node:url';",
    "import path from 'node:path';\nimport { createHash } from 'node:crypto';\nimport { fileURLToPath } from 'node:url';",
    'api-process test hash import');

  source = once(source,
    "  await fs.copyFile(fileURLToPath(new URL('../src/api-worker.mjs', import.meta.url)), path.join(runtime, 'api-worker.mjs'));\n",
    "  await fs.copyFile(fileURLToPath(new URL('../src/api-worker.mjs', import.meta.url)), path.join(runtime, 'api-worker.mjs'));\n" +
    "  if (process.platform === 'win32') {\n" +
    "    const guardSource = process.env.YUTANG_JOBGUARD_PATH;\n" +
    "    if (typeof guardSource !== 'string' || !path.isAbsolute(guardSource)) throw new Error('Windows Job Object fixture requires the compiled helper path.');\n" +
    "    const guardStat = await fs.lstat(guardSource);\n" +
    "    if (!guardStat.isFile() || guardStat.isSymbolicLink()) throw new Error('Windows Job Object fixture helper must be a regular file.');\n" +
    "    const guardBytes = await fs.readFile(guardSource);\n" +
    "    const guardSha = createHash('sha256').update(guardBytes).digest('hex');\n" +
    "    if (!/^[a-f0-9]{64}$/.test(process.env.YUTANG_JOBGUARD_SHA256 || '') || guardSha !== process.env.YUTANG_JOBGUARD_SHA256) throw new Error('Windows Job Object fixture helper SHA-256 mismatch.');\n" +
    "    await fs.writeFile(path.join(runtime, 'jobguard.exe'), guardBytes, { flag: 'wx' });\n" +
    "  }\n",
    'copy and verify real Job Object helper into API runtime fixture');

  source = once(source,
    "  const started = await f.backend.start({}); assert.equal(started.pid, f.backend.child.pid);\n",
    "  const started = await f.backend.start({}); assert.equal(started.pid, f.backend.child.pid);\n" +
    "  if (process.platform === 'win32') {\n" +
    "    assert.ok(f.backend.desktopGuard && Number.isSafeInteger(f.backend.desktopGuard.pid), 'Desktop Job Object helper must be running after backend start.');\n" +
    "    assert.equal(f.backend.desktopGuard.exitCode, null, 'Desktop Job Object helper must remain alive while the API worker is running.');\n" +
    "  }\n",
    'assert desktop Job Object helper is active');

  source = once(source,
    "  assert.equal(f.backend.exitCode, 0); assert.equal(f.backend.pending.size, 0); assert.equal(f.backend.secrets.size, 0);\n",
    "  assert.equal(f.backend.exitCode, 0); assert.equal(f.backend.pending.size, 0); assert.equal(f.backend.secrets.size, 0);\n" +
    "  assert.equal(f.backend.desktopGuard, null, 'Desktop Job Object helper must be released after normal backend shutdown.');\n" +
    "  if (process.platform === 'win32') assert.ok(f.backend.desktopGuardExitCode !== null || f.backend.desktopGuardSignal !== null, 'Desktop Job Object helper process exit must be confirmed before fixture cleanup.');\n",
    'assert desktop helper released on normal stop');

  source = once(source,
    "  await assert.rejects(f.backend.start({}, { htmlFile: outside }), /资源目录内/);\n",
    "  await assert.rejects(f.backend.start({}, { htmlFile: outside }), /资源目录内/);\n" +
    "  assert.equal(f.backend.desktopGuard, null, 'Desktop Job Object helper must be released after a rejected backend start.');\n" +
    "  if (process.platform === 'win32') assert.ok(f.backend.desktopGuardExitCode !== null || f.backend.desktopGuardSignal !== null, 'Desktop Job Object helper process exit must be confirmed after rejected start.');\n",
    'assert desktop helper released after rejected start');

  return source;
}

export function patchPrepareApiRuntimeTest(source) {
  source = once(source,
    "test('登记已有视频记忆的原位置，只补目录及精确数据库路径，不复制或改写原库', async t => {\n" +
    "  const f = await fixture(t), stateDir = path.join(f.sourceRoot, 'state');\n" +
    "  const original = { version: 1, stateDir, mediaSettingsFile: path.join(f.root, 'existing-audio-settings.json') };\n" +
    "  await fs.writeFile(f.file, JSON.stringify(original));\n" +
    "  const first = await f.run(); const registered = JSON.parse(await fs.readFile(f.file, 'utf8'));\n" +
    "  assert.deepEqual(registered, { ...original, memoryDir: path.dirname(f.legacyMemoryDbPath), memoryDbPath: f.legacyMemoryDbPath });\n" +
    "  assert.equal(first.paths.memoryDbPath, f.legacyMemoryDbPath); assert.equal(first.env.DEEPSEEK_SHARED_MEMORY_DB, f.legacyMemoryDbPath); assert.equal(first.env.DOUYIN_STATE_DIR, stateDir);\n" +
    "  const plugin = f.resolve({ home: f.home, env: f.env }); assert.equal(plugin.memoryDbPath, first.paths.memoryDbPath);\n" +
    "  assert.equal(await f.hash(f.legacyMemoryDbPath), f.originalHash);\n" +
    "  const db = new DatabaseSync(f.legacyMemoryDbPath, { readOnly: true });\n" +
    "  try { assert.equal(db.prepare('SELECT note FROM verification').get().note, '原有刷视频记忆'); } finally { db.close(); }\n" +
    "  await assert.rejects(fs.access(path.join(f.home, '.dsh', 'douyin-browser', 'memory')), { code: 'ENOENT' });\n" +
    "  const beforeSecond = await fs.readFile(f.file, 'utf8'); await f.run(); assert.equal(await fs.readFile(f.file, 'utf8'), beforeSecond);\n" +
    "  assert.equal(await f.hash(f.legacyMemoryDbPath), f.originalHash);\n" +
    "});",
    "test('已有旧记忆库保持原样，不自动导入新隔离目录', async t => {\n" +
    "  const f = await fixture(t), stateDir = path.join(f.sourceRoot, 'state');\n" +
    "  const original = { version: 1, stateDir, mediaSettingsFile: path.join(f.root, 'existing-audio-settings.json') };\n" +
    "  await fs.writeFile(f.file, JSON.stringify(original));\n" +
    "  const first = await f.run(); const registered = JSON.parse(await fs.readFile(f.file, 'utf8'));\n" +
    "  const expectedMemoryDir = path.join(f.home, '.yutang-observer-isolated', 'memory');\n" +
    "  const expectedMemoryDb = path.join(expectedMemoryDir, 'shared.sqlite');\n" +
    "  assert.deepEqual(registered, { ...original, memoryDir: expectedMemoryDir, memoryDbPath: expectedMemoryDb });\n" +
    "  assert.equal(first.paths.memoryDbPath, expectedMemoryDb); assert.equal(first.env.DEEPSEEK_SHARED_MEMORY_DB, expectedMemoryDb); assert.equal(first.env.DOUYIN_STATE_DIR, stateDir);\n" +
    "  const plugin = f.resolve({ home: f.home, env: f.env }); assert.equal(plugin.memoryDbPath, expectedMemoryDb);\n" +
    "  assert.equal(await f.hash(f.legacyMemoryDbPath), f.originalHash);\n" +
    "  const legacyDb = new DatabaseSync(f.legacyMemoryDbPath, { readOnly: true });\n" +
    "  try { assert.equal(legacyDb.prepare('SELECT note FROM verification').get().note, '原有刷视频记忆'); } finally { legacyDb.close(); }\n" +
    "  await assert.rejects(fs.access(path.join(f.home, '.dsh')), { code: 'ENOENT' });\n" +
    "  await assert.rejects(fs.access(expectedMemoryDb), { code: 'ENOENT' });\n" +
    "  const beforeSecond = await fs.readFile(f.file, 'utf8'); await f.run(); assert.equal(await fs.readFile(f.file, 'utf8'), beforeSecond);\n" +
    "  assert.equal(await f.hash(f.legacyMemoryDbPath), f.originalHash);\n" +
    "});",
    'replace legacy-memory import expectation with explicit isolated no-import regression');

  source = once(source,
    "  const expectedDir = path.join(f.home, '.dsh', 'douyin-browser', 'memory'), expectedDb = path.join(expectedDir, 'shared.sqlite');\n" +
    "  const location = path.join(f.home, '.dsh', 'douyin-browser', 'runtime-location.json');",
    "  const expectedDir = path.join(f.home, '.yutang-observer-isolated', 'memory'), expectedDb = path.join(expectedDir, 'shared.sqlite');\n" +
    "  const location = path.join(f.home, '.yutang-observer-isolated', 'runtime-location.json');",
    'new-machine isolated memory and location defaults');

  return source;
}

export async function applyTestFixturePatches(root) {
  const base = path.resolve(root);
  const upstreamCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: base, encoding: 'utf8' }).trim();
  if (upstreamCommit !== UPSTREAM_COMMIT) throw new Error('UPSTREAM_COMMIT_MISMATCH: ' + upstreamCommit);
  const results = {};
  for (const [relative, expectedBlob] of Object.entries(EXPECTED)) {
    const filename = path.join(base, relative);
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('TEST_FIXTURE_SOURCE_NOT_REGULAR: ' + relative);
    const original = await fs.readFile(filename);
    const actualBlob = gitBlobSha1(original);
    if (actualBlob !== expectedBlob) throw new Error('TEST_FIXTURE_SOURCE_BLOB_MISMATCH: ' + relative + ' expected ' + expectedBlob + ' got ' + actualBlob);
    const source = original.toString('utf8');
    const patched = relative.endsWith('api-process.test.mjs')
      ? patchApiProcessTest(source)
      : patchPrepareApiRuntimeTest(source);
    const output = Buffer.from(patched, 'utf8');
    if (sha256(output) === sha256(original)) throw new Error('TEST_FIXTURE_PATCH_DID_NOT_CHANGE_SOURCE: ' + relative);
    await fs.writeFile(filename, output, { flag: 'w' });
    results[relative] = { originalGitBlobSha1: actualBlob, patchedSha256: sha256(output) };
  }
  const helperPath = process.env.YUTANG_JOBGUARD_PATH;
  const helperSha = process.env.YUTANG_JOBGUARD_SHA256;
  if (process.platform === 'win32') {
    if (typeof helperPath !== 'string' || !path.isAbsolute(helperPath) || !/^[a-f0-9]{64}$/.test(helperSha || '')) {
      throw new Error('WINDOWS_JOBGUARD_BUILD_RECEIPT_MISSING');
    }
    const bytes = await fs.readFile(helperPath);
    if (sha256(bytes) !== helperSha) throw new Error('WINDOWS_JOBGUARD_BUILD_SHA256_MISMATCH');
  }
  const receipt = {
    schema: 'yutang.windows147-test-fixture-patch.v1',
    status: 'PASS_PATCHED_WINDOWS_TEST_FIXTURES',
    upstreamCommit,
    testSources: results,
    jobGuardSha256: helperSha || null,
    realCompiledJobGuardRequiredOnWindows: true,
    desktopGuardActiveAsserted: true,
    desktopGuardReleasedAsserted: true,
    legacyMemoryImportDisabled: true,
    oldMemoryDatabaseReadOnlyPreserved: true,
    patchIntroducedSkippedTests: false,
    liveModelCalled: false,
    realMessageSent: false,
    release: false
  };
  await fs.writeFile(path.join(base, 'windows-security-147-test-fixture-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('PASS_WINDOWS_147_TEST_FIXTURE_PATCH ' + JSON.stringify(receipt));
  return receipt;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node tools/patch_windows147_test_fixtures.mjs /absolute/upstream/source');
  applyTestFixturePatches(root).catch(error => {
    console.error('WINDOWS_147_TEST_FIXTURE_PATCH_FAIL_CLOSED: ' + String(error?.message || error));
    process.exitCode = 1;
  });
}
