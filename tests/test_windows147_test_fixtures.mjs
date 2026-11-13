import assert from 'node:assert/strict';
import {
  patchApiProcessTest,
  patchPrepareApiRuntimeTest
} from '../tools/patch_windows147_test_fixtures.mjs';

const api = await (await import('node:fs/promises')).readFile('upstream/desktop/tests/api-process.test.mjs', 'utf8');
const prepare = await (await import('node:fs/promises')).readFile('upstream/desktop/tests/prepare-api-runtime.test.mjs', 'utf8');
assert.match(api, /YUTANG_JOBGUARD_PATH/);
assert.match(api, /Desktop Job Object helper must be running/);
assert.match(api, /Desktop Job Object helper must be released/);
assert.match(prepare, /已有旧记忆库保持原样，不自动导入新隔离目录/);
assert.match(prepare, /\.yutang-observer-isolated/);
assert.doesNotMatch(prepare, /expectedDir = path\.join\(f\.home, '\.dsh', 'douyin-browser', 'memory'\)/);
assert.throws(() => patchApiProcessTest(api), /TEST_FIXTURE_PATCH_ANCHOR_MISMATCH/);
assert.throws(() => patchPrepareApiRuntimeTest(prepare), /TEST_FIXTURE_PATCH_ANCHOR_MISMATCH/);
console.log('PASS Windows 1.4.7 test fixture patch: real Job Object helper hash and lifecycle assertions; isolated memory no-import regressions.');
