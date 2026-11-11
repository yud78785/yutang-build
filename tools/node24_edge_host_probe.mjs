#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [mode, upstreamRoot, profile, controlDir, portText] = process.argv.slice(2);
const port = Number(portText || (mode === 'direct' ? 9331 : 9227));
if (!['direct', 'host'].includes(mode) || !path.isAbsolute(upstreamRoot || '') || !path.isAbsolute(profile || '') || !path.isAbsolute(controlDir || '') || !Number.isInteger(port)) {
  throw new Error('Invalid isolated probe arguments');
}
const root = path.resolve(upstreamRoot);
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
      ignoreDefaultArgs: ['--mute-audio'],
      args: ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required'],
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
} else {
  const { runBrowserHost, sanitizeBrowserFailure } = await import(pathToFileURL(path.join(root, 'browser-host.mjs')).href);
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
  emit('host-entry', { node: process.versions.node, port });
  try {
    const result = await runBrowserHost({ profile, controlDir, port, chromiumImpl: instrumentedChromium, logger });
    emit('host-result', { started: result.started === true, exitCode: result.exitCode ?? null, failureCode: result.failure?.code || null, failure: result.failure?.details || null });
    if (!result.started) process.exitCode = 1;
  } catch (error) {
    emit('host-threw', { errorName: String(error?.name || 'Error'), errorCode: String(error?.code || ''), error: cleanError(error?.message) });
    process.exitCode = 1;
  }
}
