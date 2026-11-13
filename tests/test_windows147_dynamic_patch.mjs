import assert from 'node:assert/strict';
import {
  previewDynamicPatches,
  patchDesktopMain,
  patchPackagedVerifier
} from '../tools/patch_windows147_dynamic.mjs';

const plan=await previewDynamicPatches(process.argv[2]||'upstream');
assert.equal(plan.staticFiles.length,7);
assert.match(plan.patched['desktop/src/main.mjs'],/YuTangObserver-Isolated-Candidate/);
assert.match(plan.patched['desktop/src/main.mjs'],/ensureSharedLocation\(\{ resolve: pathsModule\.resolveRuntimePaths, env: \{\} \}\)/);
assert.match(plan.patched['desktop/scripts/verify-packaged-api.mjs'],/prepared Job Object helper SHA-256/);
assert.match(plan.patched['desktop/scripts/verify-packaged-api.mjs'],/home, '\.yutang-observer-isolated', 'memory'/);
assert.throws(()=>patchDesktopMain(plan.patched['desktop/src/main.mjs']),/DYNAMIC_PATCH_ANCHOR_MISMATCH/);
assert.throws(()=>patchPackagedVerifier(plan.patched['desktop/scripts/verify-packaged-api.mjs']),/DYNAMIC_PATCH_ANCHOR_MISMATCH/);
console.log('PASS 1.4.7 dynamic desktop userData and packaged Job Object verifier patch tests.');
