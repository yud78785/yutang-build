import test from 'node:test';
import assert from 'node:assert/strict';
import { patchPackagedSmokeEnvironment } from '../tools/apply_windows147_update_trust_patch.mjs';

test('packaged smoke environment preserves native Windows profile and isolates YuTang app/browser directories', () => {
  const source = String.raw`const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:path|systemroot|windir|comspec|pathext|programfiles\(x86\)|programdata)$/i.test(key)));
Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: path.join(directory, 'app-data'), LOCALAPPDATA: path.join(directory, 'local-app-data'), TEMP: path.join(directory, 'temp'), TMP: path.join(directory, 'temp'), DSH_HOME: path.join(home, '.dsh'), DOUYIN_DESKTOP_USER_DATA: userData, DOUYIN_RUNTIME_LOCATION_FILE: locationFile, DOUYIN_DESKTOP_SMOKE: '1' });`;
  const patched = patchPackagedSmokeEnvironment(source);
  assert.ok(patched.includes('userprofile|homedrive|homepath|appdata|localappdata|temp|tmp|home'));
  assert.equal(patched.includes('USERPROFILE: home'), false);
  assert.equal(patched.includes("APPDATA: path.join(directory, 'app-data')"), false);
  assert.ok(patched.includes('DOUYIN_DESKTOP_USER_DATA: userData'));
  assert.ok(patched.includes('DOUYIN_RUNTIME_LOCATION_FILE: locationFile'));
  assert.ok(patched.includes("DOUYIN_BROWSER_PROFILE_DIR: path.join(directory, 'browser-profile')"));
  assert.ok(patched.includes("DOUYIN_BROWSER_CONTROL_DIR: path.join(directory, 'browser-control')"));
});
