#!/usr/bin/env node
// Candidate-only fail-closed state isolation. Requires exactly the reviewed upstream Git blobs.
// Does not inspect, copy, delete, or migrate any existing user profile, memory, or credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const expected = new Map([
  ['runtime-paths.mjs', '9613e700115e989dee3af6578044ca52eaf51781'],
  ['prepare-api-runtime.mjs', '0b989270a90240eb1d7793430be95f671fd9fbf3'],
  ['main.mjs', '5296770bcb87e6a60c96cbb2959f615ff4192e5e'],
]);
const isolatedRoot = '.yutang-observer-isolated';
const gitBlob = bytes => createHash('sha1')
  .update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function exactlyOnce(source, before, after, description) {
  if (source.split(before).length !== 2) throw Error(description + ': expected exact original text once');
  if (before === after) throw Error(description + ': no-op replacement forbidden');
  return source.replace(before, after);
}
export function patchRuntimePaths(source) {
  source = exactlyOnce(source,
    "export const LEGACY_SHARED_MEMORY_DB_PATH = 'D:/codex分局/大肥鱼/memory/shared.sqlite';",
    "export const LEGACY_SHARED_MEMORY_DB_PATH = null;",
    'legacy memory default');
  source = exactlyOnce(source,
    "path.join(home, '.dsh', 'douyin-browser', 'runtime-location.json')",
    "path.join(home, '.yutang-observer-isolated', 'runtime-location.json')",
    'location default');
  source = exactlyOnce(source,
    "  else if (path.isAbsolute(legacyMemoryDbPath) && fs.existsSync(legacyMemoryDbPath)) {\n" +
    "    if (!fs.statSync(legacyMemoryDbPath).isFile()) throw new Error('已有共享记忆路径不是文件；未创建另一套数据库。');\n" +
    "    memoryDbPath = path.normalize(legacyMemoryDbPath);\n" +
    "  } else memoryDbPath = path.join(home, '.dsh', 'douyin-browser', 'memory', 'shared.sqlite');",
    "  else memoryDbPath = path.join(home, '.yutang-observer-isolated', 'memory', 'shared.sqlite');",
    'no implicit legacy memory import');
  source = exactlyOnce(source,
    "browserProfileDir: path.join(home, '.dsh', 'douyin-browser', 'cli-profile'),",
    "browserProfileDir: path.join(home, '.yutang-observer-isolated', 'cli-profile'),",
    'dedicated Edge profile');
  source = exactlyOnce(source,
    "browserControlDir: path.join(home, '.dsh', 'douyin-browser', 'control'),",
    "browserControlDir: path.join(home, '.yutang-observer-isolated', 'control'),",
    'dedicated browser ownership/lock folder');
  if (source.includes("path.join(home, '.dsh'") || source.includes("D:/codex分局/大肥鱼"))
    throw Error('Legacy root remains in runtime path defaults');
  return source;
}
export function patchPrepareApiRuntime(source) {
  source = exactlyOnce(source,
    "path.join(home, '.dsh', 'douyin-browser', 'runtime-location.json')",
    "path.join(home, '.yutang-observer-isolated', 'runtime-location.json')",
    'desktop location record');
  source = exactlyOnce(source,
    "const common = path.join(home, '.dsh', 'douyin-browser');",
    "const common = path.join(home, '.yutang-observer-isolated');",
    'desktop state/media root');
  if (source.includes("path.join(home, '.dsh'")) throw Error('Legacy desktop state root remains');
  return source;
}
export function patchDesktopMain(source) {
  source = exactlyOnce(source,
    "app.setPath('userData', override || path.join(app.getPath('appData'), 'DafeiyuDouyinAPI'));",
    "app.setPath('userData', override || path.join(app.getPath('appData'), 'YuTangObserver-Isolated-Candidate'));",
    'never inherit legacy Electron API settings');
  source = exactlyOnce(source,
    "const shared = await ensureSharedLocation({ resolve: pathsModule.resolveRuntimePaths });",
    "const shared = await ensureSharedLocation({ resolve: pathsModule.resolveRuntimePaths, env: {} });",
    'never inherit old environment-selected shared memory');
  if (source.includes("'DafeiyuDouyinAPI'")) throw Error('Legacy app settings root remains');
  return source;
}
const implementations = [patchRuntimePaths, patchPrepareApiRuntime, patchDesktopMain];
const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args.some(item => !path.isAbsolute(path.resolve(item)))) {
    console.error('Usage: node tools/patch-isolated-candidate-state.mjs /absolute/runtime-paths.mjs /absolute/prepare-api-runtime.mjs /absolute/main.mjs');
    process.exitCode = 2;
  } else {
    try {
      const staged = [];
      for (let i = 0; i < 3; i++) {
        const filename = path.resolve(args[i]);
        const name = path.basename(filename);
        const expectedName = [...expected.keys()][i];
        if (name !== expectedName) throw Error('Unexpected target file name or order');
        const stat = await fs.lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Refusing link or non-regular source');
        const bytes = await fs.readFile(filename);
        if (gitBlob(bytes) !== expected.get(expectedName)) throw Error('Pinned Git blob mismatch for ' + name);
        const patched = implementations[i](bytes.toString('utf8'));
        const updated = Buffer.from(patched, 'utf8');
        if (sha256(bytes) === sha256(updated)) throw Error('Unexpected unchanged file');
        staged.push({ filename, updated, sha256: sha256(updated) });
      }
      for (const item of staged) {
        const temp = item.filename + '.yutang-isolated-' + process.pid + '.tmp';
        try {
          await fs.writeFile(temp, item.updated, { flag: 'wx' });
          await fs.rename(temp, item.filename);
        } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
        console.log('PATCHED_ISOLATED_CANDIDATE_STATE ' + path.basename(item.filename) + ' sha256=' + item.sha256);
      }
      console.log('ISOLATION_DEFAULTS: new candidate uses a separate Edge profile/control, memory and Electron API settings; no legacy migration.');
    } catch (error) {
      console.error('FAIL_CLOSED_CANDIDATE_ISOLATION: ' + String(error?.message || error));
      process.exitCode = 1;
    }
  }
}