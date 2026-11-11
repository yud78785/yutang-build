#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

const [mode, upstreamRoot, profile, controlDir, portText] = process.argv.slice(2);
const port = Number(portText || (mode === 'direct' ? 9331 : 9227));
if (!['direct', 'host', 'spawn-host-detached-filtered', 'spawn-host-attached-filtered', 'spawn-host-detached-nohide-filtered'].includes(mode) || !path.isAbsolute(upstreamRoot || '') || !path.isAbsolute(profile || '') || !path.isAbsolute(controlDir || '') || !Number.isInteger(port)) {
  throw new Error('Invalid isolated probe arguments');
}
const root = path.resolve(upstreamRoot);
const { readFile, writeFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const hostSource = await readFile(path.join(root, 'browser-host.mjs'));
const hostSha256 = createHash('sha256').update(hostSource).digest('hex');
const expectedHostSha256 = '29e77cca0cb3c0bdf3750de3727ffde9e2e761a70d90f992eb24cd7bcbbb1a9d';
if (hostSha256 !== expectedHostSha256 || !hostSource.toString('utf8').includes('chromiumSandbox: true') || !hostSource.toString('utf8').includes('--enable-features=NetworkServiceSandbox')) throw new Error('Probe requires the exact renderer and Network Service sandbox-patched browser-host source.');
let instrumentedHost = hostSource.toString('utf8');
const stagePatches = [
  ["    writeState(false);\n    try { installation = await probeInstallation(); } catch {}\n    context = await chromiumImpl.launchPersistentContext(profile, {",
   "    console.error('PROBE_STAGE:before_edge_probe');\n    writeState(false);\n    console.error('PROBE_STAGE:state_false_written');\n    try { installation = await probeInstallation(); console.error('PROBE_STAGE:edge_probe_finished'); } catch { console.error('PROBE_STAGE:edge_probe_failed'); }\n    console.error('PROBE_STAGE:before_launch_persistent_context');\n    context = await chromiumImpl.launchPersistentContext(profile, {"],
  ["    const nativeFocus = await installNativeFocusReset(context, { onFailure:",
   "    console.error('PROBE_STAGE:after_launch_persistent_context');\n    console.error('PROBE_STAGE:before_focus_reset');\n    const nativeFocus = await installNativeFocusReset(context, { onFailure:"],
  ["    nativeFocus.assertHealthy();\n    writeState(true,",
   "    console.error('PROBE_STAGE:after_focus_reset');\n    nativeFocus.assertHealthy();\n    console.error('PROBE_STAGE:before_ready_state');\n    writeState(true,"],
  ["    logger.log('专用抖音 Edge 已启动。');",
   "    console.error('PROBE_STAGE:ready_state_written');\n    logger.log('专用抖音 Edge 已启动。');"],
  ["  } catch (error) {\n    try { await context?.close(); } catch {}",
   "  } catch (error) {\n    console.error('PROBE_STAGE:host_catch:' + String(error?.code || error?.name || 'Error'));\n    try { await context?.close(); } catch {}"]
];
for (const [before, after] of stagePatches) {
  if (instrumentedHost.split(before).length !== 2) throw new Error('Candidate host diagnostic patch anchor is not unique.');
  instrumentedHost = instrumentedHost.replace(before, after);
}
const probeHostPath = path.join(root, 'browser-host-probe.mjs');
await writeFile(probeHostPath, instrumentedHost);
const instrumentedHostSha256 = createHash('sha256').update(instrumentedHost).digest('hex');


const { chromium } = await import(pathToFileURL(path.join(root, 'playwright-runtime.mjs')).href);
const emit = (stage, detail = {}) => process.stdout.write('STAGE ' + JSON.stringify({ stage, ...detail, at: new Date().toISOString() }) + '\n');
const cleanError = value => String(value || '').replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
  .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
  .replace(/[A-Za-z]:[\\/][^\r\n"'<>]*/g, '[isolated-path]')
  .slice(0, 1200);

if (mode === 'direct') {
  let context;
  try {
    emit('direct-before-launch', { node: process.versions.node, port });
    context = await chromium.launchPersistentContext(profile, {
      channel: 'msedge',
      headless: false,
      viewport: null,
      chromiumSandbox: true,
      ignoreDefaultArgs: ['--mute-audio'],
      args: ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required', '--enable-features=NetworkServiceSandbox'],
      timeout: 30000,
    });
    emit('direct-after-launch', { pages: context.pages().length });
    let cdp = false, browser = null;
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(3000) });
      if (response.ok) { browser = await response.json(); cdp = /Edg|Chrome/.test(String(browser.Browser)); }
    } catch {}
    emit('direct-result', { launch: cdp ? 'PASS' : 'CDP_MISSING', cdp, browserVersion: String(browser?.Browser || '').slice(0, 100), node: process.versions.node });
  } catch (error) {
    emit('direct-result', { launch: 'FAIL', errorName: String(error?.name || 'Error'), errorCode: String(error?.code || ''), error: cleanError(error?.message), node: process.versions.node });
    process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
  }
} else if (mode === 'host') {
  const { runBrowserHost, sanitizeBrowserFailure } = await import(pathToFileURL(path.join(root, 'browser-host-probe.mjs')).href);
  const instrumentedChromium = {
    async launchPersistentContext(...args) {
      emit('host-before-launch', { node: process.versions.node, port, headless: args[1]?.headless, channel: args[1]?.channel });
      const context = await chromium.launchPersistentContext(...args);
      emit('host-after-launch', { pages: context.pages().length });
      return new Proxy(context, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (property === 'newCDPSession') {
            return async (...sessionArgs) => {
              emit('focus-before-cdp-session');
              const session = await value.apply(target, sessionArgs);
              emit('focus-after-cdp-session');
              return new Proxy(session, {
                get(sessionTarget, sessionProperty) {
                  const sessionValue = Reflect.get(sessionTarget, sessionProperty, sessionTarget);
                  if (sessionProperty === 'send') return async (...sendArgs) => {
                    emit('focus-before-cdp-send', { method: String(sendArgs[0] || '') });
                    const result = await sessionValue.apply(sessionTarget, sendArgs);
                    emit('focus-after-cdp-send', { method: String(sendArgs[0] || '') });
                    return result;
                  };
                  if (sessionProperty === 'detach') return async (...detachArgs) => {
                    emit('focus-before-cdp-detach');
                    const result = await sessionValue.apply(sessionTarget, detachArgs);
                    emit('focus-after-cdp-detach');
                    return result;
                  };
                  return typeof sessionValue === 'function' ? sessionValue.bind(sessionTarget) : sessionValue;
                },
              });
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
  const logger = {
    log: (...args) => emit('host-log', { message: String(args.join(' ')).slice(0, 300) }),
    error: (...args) => emit('host-error', { message: sanitizeBrowserFailure(args.join(' ')) }),
  };
  emit('host-entry', { node: process.versions.node, port, browserHostSha256: hostSha256, chromiumSandbox: true, networkServiceSandbox: true });
  try {
    const result = await runBrowserHost({ profile, controlDir, port, chromiumImpl: instrumentedChromium, logger });
    emit('host-result', { started: result.started === true, exitCode: result.exitCode ?? null, failureCode: result.failure?.code || null, failure: result.failure?.details || null });
    if (!result.started) process.exitCode = 1;
  } catch (error) {
    emit('host-threw', { errorName: String(error?.name || 'Error'), errorCode: String(error?.code || ''), error: cleanError(error?.message) });
    process.exitCode = 1;
  }
} else {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const home = path.resolve(profile, '..', '..', '..');
  const common = path.join(home, '.dsh', 'douyin-browser');
  const locationFile = path.join(common, 'runtime-location.json');
  const mediaRoot = path.join(common, 'media');
  const memoryDir = path.join(common, 'memory');
  const userData = path.join(common, 'user-data');
  const paths = {
    stateDir: path.join(common, 'state'),
    memoryDir,
    memoryDbPath: path.join(memoryDir, 'shared.sqlite'),
    mediaEnvFile: path.join(mediaRoot, '.env'),
    mediaSettingsFile: path.join(mediaRoot, 'settings.local.json'),
    mediaRuntimeRoot: mediaRoot,
    mediaModelsDir: path.join(mediaRoot, '.models'),
  };
  await Promise.all([
    mkdir(common, { recursive: true }),
    mkdir(path.dirname(locationFile), { recursive: true }),
    mkdir(controlDir, { recursive: true }),
    mkdir(profile, { recursive: true }),
    mkdir(paths.stateDir, { recursive: true }),
    mkdir(paths.memoryDir, { recursive: true }),
    mkdir(mediaRoot, { recursive: true }),
    mkdir(userData, { recursive: true }),
    mkdir(path.join(home, 'app-data'), { recursive: true }),
    mkdir(path.join(home, 'local-app-data'), { recursive: true }),
    mkdir(path.join(home, 'temp'), { recursive: true }),
  ]);
  await writeFile(locationFile, JSON.stringify({ version: 1, ...paths }, null, 2) + '\n', { flag: 'wx' });
  await writeFile(paths.mediaEnvFile, '', { flag: 'wx' });
  await writeFile(paths.mediaSettingsFile, JSON.stringify({ enabled: false, backend: 'local-whisper' }), { flag: 'wx' });
  const allowedEnv = /^(?:path|systemroot|windir|comspec|pathext|programfiles|programfiles\(x86\)|programdata|username|userdomain|public|allusersprofile|programw6432|os|processor_architecture|number_of_processors|homedrive|homepath|userprofile|appdata|localappdata|temp|tmp|systemdrive|home)$/i;
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnv.test(key)));
  Object.assign(childEnv, {
    DSH_HOME: path.join(home, '.dsh'),
    DOUYIN_DESKTOP_USER_DATA: userData,
    DOUYIN_RUNTIME_LOCATION_FILE: locationFile,
    DEEPSEEK_SHARED_MEMORY_DB: paths.memoryDbPath,
    DOUYIN_STATE_DIR: paths.stateDir,
    DOUYIN_MEDIA_ENV_FILE: paths.mediaEnvFile,
    DOUYIN_MEDIA_SETTINGS_FILE: paths.mediaSettingsFile,
    DOUYIN_MEDIA_RUNTIME_ROOT: paths.mediaRuntimeRoot,
    DOUYIN_MEDIA_MODELS_DIR: paths.mediaModelsDir,
    DOUYIN_NODE_EXECUTABLE: process.execPath,
    DOUYIN_DESKTOP_SMOKE: '1',
  });
  for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL']) delete childEnv[key];
  const { resolveRuntimePaths, resolveNodeExecutable } = await import(pathToFileURL(path.join(root, 'runtime-paths.mjs')).href);
  const runtimePaths = resolveRuntimePaths({ env: childEnv, home, sourceRoot: root });
  if (path.resolve(runtimePaths.browserProfileDir).toLowerCase() !== path.resolve(profile).toLowerCase()
      || path.resolve(runtimePaths.browserControlDir).toLowerCase() !== path.resolve(controlDir).toLowerCase()) {
    throw new Error('Candidate runtime path resolution differs from the isolated test paths.');
  }
  const node = resolveNodeExecutable({ env: childEnv, executable: process.execPath, versions: process.versions, sourceRoot: root });
  if (path.resolve(node).toLowerCase() !== path.resolve(process.execPath).toLowerCase()) throw new Error('Candidate Node executable resolution differs from Node 24.17.0.');
  const logFile = path.join(controlDir, 'browser-host.log');
  const output = openSync(logFile, 'a');
  let child;
  const detached = mode !== 'spawn-host-attached-filtered';
  const windowsHide = mode !== 'spawn-host-detached-nohide-filtered';
  try {
    child = spawn(node, [path.join(root, 'browser-host-probe.mjs'), runtimePaths.browserProfileDir, runtimePaths.browserControlDir, String(port)], {
      detached, windowsHide, stdio: ['ignore', output, output], env: childEnv, shell: false, cwd: root,
    });
  } finally { closeSync(output); }
  const hostPid = child.pid;
  child.unref();
  emit('spawn-host-child-started', {
    pid: hostPid, node: process.versions.node, port, browserHostSha256: hostSha256,
    chromiumSandbox: true, networkServiceSandbox: true, detached, windowsHide, envKeyCount: Object.keys(childEnv).length,
    userProfilePreserved: childEnv.USERPROFILE === process.env.USERPROFILE,
    appDataPreserved: childEnv.APPDATA === process.env.APPDATA,
    localAppDataPreserved: childEnv.LOCALAPPDATA === process.env.LOCALAPPDATA,
    tempPreserved: childEnv.TEMP === process.env.TEMP,
    homeDrivePreserved: childEnv.HOMEDRIVE === process.env.HOMEDRIVE,
    systemRootPreserved: childEnv.SystemRoot === process.env.SystemRoot,
  });
  const stateFile = path.join(runtimePaths.browserControlDir, 'browser.json');
  const deadline = Date.now() + 35000;
  let ready = false, cdp = false, browser = null, state = null;
  while (Date.now() < deadline) {
    try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch { state = null; }
    if (state?.pid && state.pid !== hostPid) {
      emit('spawn-host-state-pid-mismatch', { expectedPid: hostPid, actualPid: state.pid });
      break;
    }
    if (state?.launchFailure) {
      emit('spawn-host-failure', { code: String(state.launchFailure.code || ''), message: String(state.launchFailure.message || '').slice(0, 500) });
      break;
    }
    if (state?.ready === true) {
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
          browser = await response.json();
          cdp = /Edg|Chrome/.test(String(browser.Browser));
          if (cdp) { ready = true; break; }
        }
      } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  let hostLogTail = '';
  try { hostLogTail = (await readFile(logFile, 'utf8')).slice(-8000).replaceAll(home, '[isolated-home]').replaceAll(common, '[isolated-common]'); } catch {}
  emit('host-result', {
    started: ready, ready: state?.ready === true, cdp, pid: hostPid,
    browserVersion: String(browser?.Browser || '').slice(0, 100),
    failureCode: String(state?.launchFailure?.code || ''),
    failure: String(state?.launchFailure?.message || '').slice(0, 500),
    chromiumSandbox: true, detached, windowsHide, envKeyCount: Object.keys(childEnv).length, hostLogTail,
  });
  if (!ready) process.exitCode = 1;
}
