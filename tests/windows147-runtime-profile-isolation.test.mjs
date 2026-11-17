import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRuntimePaths } from '../upstream/runtime-paths.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yutang-runtime-profile-isolation-'));
  t.after(() => {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('yutang-runtime-profile-isolation-')) {
      throw new Error('Runtime profile test cleanup escaped its temporary root.');
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const nativeHome = path.join(root, 'native-windows-user-profile');
  const runtimeRoot = path.join(root, 'isolated-runtime');
  const locationFile = path.join(runtimeRoot, 'runtime-location.json');
  const stateDir = path.join(runtimeRoot, 'state');
  const memoryDir = path.join(runtimeRoot, 'memory');
  const mediaRoot = path.join(runtimeRoot, 'media');
  const browserProfileDir = path.join(runtimeRoot, 'cli-profile');
  const browserControlDir = path.join(runtimeRoot, 'control');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(locationFile, JSON.stringify({
    version: 1,
    stateDir,
    memoryDir,
    memoryDbPath: path.join(memoryDir, 'shared.sqlite'),
    mediaEnvFile: path.join(mediaRoot, '.env'),
    mediaSettingsFile: path.join(mediaRoot, 'settings.local.json'),
    mediaRuntimeRoot: mediaRoot,
    mediaModelsDir: path.join(mediaRoot, '.models'),
  }));
  return { root, nativeHome, runtimeRoot, locationFile, stateDir, memoryDir, mediaRoot, browserProfileDir, browserControlDir };
}

test('YuTang browser profile and control directories can be isolated without replacing Windows USERPROFILE', t => {
  const f = fixture(t);
  const paths = resolveRuntimePaths({
    home: f.nativeHome,
    sourceRoot: path.join(f.root, 'source'),
    env: {
      DOUYIN_RUNTIME_LOCATION_FILE: f.locationFile,
      DOUYIN_BROWSER_PROFILE_DIR: f.browserProfileDir,
      DOUYIN_BROWSER_CONTROL_DIR: f.browserControlDir,
    },
  });
  assert.equal(paths.browserProfileDir, f.browserProfileDir);
  assert.equal(paths.browserControlDir, f.browserControlDir);
  assert.equal(paths.stateDir, f.stateDir);
  assert.equal(paths.memoryDbPath, path.join(f.memoryDir, 'shared.sqlite'));
  assert.equal(path.dirname(paths.browserProfileDir), f.runtimeRoot);
  assert.equal(path.dirname(paths.browserControlDir), f.runtimeRoot);
  assert.notEqual(paths.browserProfileDir, path.join(f.nativeHome, '.yutang-observer-isolated', 'cli-profile'));
  assert.notEqual(paths.browserControlDir, path.join(f.nativeHome, '.yutang-observer-isolated', 'control'));
});

test('browser profile and control defaults remain under the real home when no overrides are supplied', t => {
  const f = fixture(t);
  const paths = resolveRuntimePaths({
    home: f.nativeHome,
    sourceRoot: path.join(f.root, 'source'),
    env: { DOUYIN_RUNTIME_LOCATION_FILE: f.locationFile },
  });
  assert.equal(paths.browserProfileDir, path.join(f.nativeHome, '.yutang-observer-isolated', 'cli-profile'));
  assert.equal(paths.browserControlDir, path.join(f.nativeHome, '.yutang-observer-isolated', 'control'));
});
