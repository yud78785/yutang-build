// Source-only, no-dependency, read-only diagnostic for the pinned 1.4.7
// LockyBee/dsh-douyin-agent dedicated Windows Edge host.
// It NEVER launches, navigates, clicks, connects to CDP websocket or edits files.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const PORT = 9227;
const VIDEO_ID = /^\d{10,30}$/;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const DEFAULT_TIMEOUT = 1200;

function receipt(status, reasonCode = null, extra = {}) {
  return {
    status, reasonCode,
    browserStartedByProbe: false,
    browserNavigatedByProbe: false,
    browserPageContentReadByProbe: false,
    commentsVerified: false,
    aiSummaryVerified: false,
    ...extra,
  };
}
export function parseDiagnosticArgs(argv = []) {
  if (!Array.isArray(argv)) return { ok: false, reasonCode: 'ARGUMENTS_INVALID' };
  if (argv.length === 0) return { ok: true, videoId: null };
  if (argv.length !== 2 || argv[0] !== '--video-id' || !VIDEO_ID.test(argv[1] || ''))
    return { ok: false, reasonCode: 'ARGUMENTS_INVALID' };
  return { ok: true, videoId: argv[1] };
}

export function localHostPaths(home) {
  // Mirrors the upstream resolveRuntimePaths() browser-specific constants,
  // NOT the optional memory/state directory or user's personal Edge profile.
  const base = path.win32.join(home, '.dsh', 'douyin-browser');
  return {
    stateFile: path.win32.join(base, 'control', 'browser.json'),
    dedicatedProfile: path.win32.join(base, 'cli-profile'),
  };
}

export function verifyHostRecord(record, dedicatedProfile, now = Date.now()) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      !Number.isSafeInteger(record.pid) || record.pid < 1 || record.port !== PORT ||
      typeof record.profile !== 'string' || !path.win32.isAbsolute(record.profile) ||
      path.win32.normalize(record.profile).toLowerCase() !== path.win32.normalize(dedicatedProfile).toLowerCase() ||
      typeof record.instanceId !== 'string' || !UUID.test(record.instanceId) ||
      !Number.isFinite(record.startedAt) || record.startedAt < 1 || record.startedAt > now + 30_000 ||
      record.ready !== true) return false;
  return true;
}

export function exactVideoRoute(value, id) {
  if (!VIDEO_ID.test(id || '') || typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.origin === 'https://www.douyin.com' && !u.username && !u.password && !u.hash &&
      u.pathname === `/video/${id}` && ['modal_id', 'aweme_id'].every(k => u.searchParams.getAll(k).every(v => v === id));
  } catch { return false; }
}

export function socketPortProbe(port = PORT) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

export function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

export async function windowsProcessBirth(pid, { env = process.env } = {}) {
  const systemRoot = env.SystemRoot || 'C:\\Windows';
  const shell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const { stdout } = await exec(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '$p=[System.Diagnostics.Process]::GetProcessById([int]$env:DOUYIN_PROBE_PID); ([DateTimeOffset]$p.StartTime.ToUniversalTime()).ToUnixTimeMilliseconds()'],
    { env: { ...env, DOUYIN_PROBE_PID: String(pid) }, windowsHide: true, timeout: 3000, maxBuffer: 256 });
    const number = Number(stdout.trim());
    return Number.isFinite(number) && number > 0 ? number : null;
  } catch { return null; }
}

async function safeLocalJson(url, { fetcher, maxChars }) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT), redirect: 'error' });
  if (!response?.ok) return null;
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > maxChars) return null;
  const body = await response.text();
  if (typeof body !== 'string' || body.length > maxChars) return null;
  return JSON.parse(body);
}

export async function diagnoseExistingDouyinEdge({ argv = [], platform = process.platform,
  home = os.homedir(), readState = file => fs.readFileSync(file, 'utf8'),
  isAlive = processIsAlive, birthTime = windowsProcessBirth, portProbe = socketPortProbe,
  fetcher = globalThis.fetch, now = Date.now() } = {}) {
  const args = parseDiagnosticArgs(argv);
  if (!args.ok) return receipt('blocked', args.reasonCode);
  if (platform !== 'win32') return receipt('blocked', 'WINDOWS_REQUIRED');
  if (typeof home !== 'string' || !path.win32.isAbsolute(home)) return receipt('blocked', 'HOME_PATH_UNVERIFIED');
  const { stateFile, dedicatedProfile } = localHostPaths(home);
  let record;
  try {
    const source = readState(stateFile);
    if (typeof source !== 'string' || source.length > 4096) throw Error('invalid record');
    record = JSON.parse(source);
  } catch {
    const portOccupied = await portProbe(PORT).catch(() => false);
    return receipt('blocked', portOccupied ? 'PORT_OCCUPIED_OWNER_UNVERIFIED' : 'DEDICATED_BROWSER_NOT_RUNNING');
  }
  if (!verifyHostRecord(record, dedicatedProfile, now))
    return receipt('blocked', 'DEDICATED_OWNER_RECORD_UNVERIFIED');
  if (!isAlive(record.pid)) return receipt('blocked', 'DEDICATED_HOST_PROCESS_NOT_RUNNING');
  const birth = await birthTime(record.pid).catch(() => null);
  if (!Number.isFinite(birth)) return receipt('blocked', 'HOST_PROCESS_BIRTH_UNVERIFIED');
  if (birth > record.startedAt + 100 || record.startedAt - birth > 120_000)
    return receipt('blocked', 'HOST_PROCESS_IDENTITY_MISMATCH');
  let version;
  try {
    version = await safeLocalJson(`http://127.0.0.1:${PORT}/json/version`, { fetcher, maxChars: 4096 });
  } catch { return receipt('blocked', 'DEDICATED_CDP_ENDPOINT_UNREACHABLE'); }
  if (!version || typeof version.Browser !== 'string' || !/(?:Edg|Chrome)\//.test(version.Browser))
    return receipt('blocked', 'DEDICATED_CDP_VERSION_UNVERIFIED');
  if (args.videoId === null)
    return receipt('edge_host_ready', null, { dedicatedHostIdentityVerified: true, cdpEndpointReachable: true,
      targetVideoTabMetadataSeen: false, targetTabOwnershipVerified: false });
  let tabs;
  try {
    tabs = await safeLocalJson(`http://127.0.0.1:${PORT}/json/list`, { fetcher, maxChars: 131072 });
  } catch { return receipt('blocked', 'CDP_TARGET_LIST_UNAVAILABLE'); }
  if (!Array.isArray(tabs) || tabs.length > 100 || tabs.some(x => !x || typeof x !== 'object'))
    return receipt('blocked', 'CDP_TARGET_LIST_UNVERIFIED');
  const count = tabs.filter(x => x.type === 'page' && exactVideoRoute(x.url, args.videoId)).length;
  if (count !== 1) return receipt('blocked', count === 0 ? 'TARGET_VIDEO_TAB_NOT_FOUND' : 'TARGET_VIDEO_TAB_AMBIGUOUS',
    { dedicatedHostIdentityVerified: true, cdpEndpointReachable: true, targetVideoTabCount: count });
  return receipt('target_video_metadata_seen', null, {
    dedicatedHostIdentityVerified: true, cdpEndpointReachable: true,
    targetVideoTabCount: 1, targetVideoTabMetadataSeen: true,
    // The CDP list cannot verify upstream `window.name` ownership or any DOM.
    targetTabOwnershipVerified: false,
    videoId: args.videoId,
  });
}

const entry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entry) {
  void diagnoseExistingDouyinEdge({ argv: process.argv.slice(2) }).then(value => {
    process.stdout.write(JSON.stringify(value) + '\n', () => { process.exit(value.status === 'blocked' ? 2 : 0); });
  }, () => process.stdout.write(JSON.stringify(receipt('blocked', 'DIAGNOSTIC_UNEXPECTED_FAILURE')) + '\n', () => process.exit(2)));
}
