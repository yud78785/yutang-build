import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import {
  UpdateService,
  UPDATE_REPOSITORY,
  validateManifest,
  newerVersion,
  parseVersion
} from '../tools/windows147-update-patched/update-service.mjs';
import { runUpdateLauncher } from '../tools/windows147-update-patched/update-launcher.mjs';

const THUMBPRINT = 'A'.repeat(40);
const bytes = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2046, 27)]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

test('稳定更新版本使用规范 SemVer，测试版不会被误判为正式版', () => {
  assert.deepEqual(parseVersion('v1.4.5'), [1, 4, 5]);
  assert.equal(parseVersion('01.4.5'), null);
  assert.equal(parseVersion('1.04.5'), null);
  assert.equal(parseVersion('1.4.05'), null);
  assert.equal(parseVersion('1.4.5-beta.1'), null);
  assert.equal(newerVersion('1.4.5', '1.4.5-beta.1+local.001'), true);
  assert.equal(newerVersion('1.4.5', '1.4.5+local.001'), false);
  assert.equal(newerVersion('1.4.2-rc.1', '1.4.1'), false);
  assert.equal(newerVersion('1.4.4', '1.4.5-beta.1'), false);
  assert.equal(newerVersion('1.4.6', '1.4.5-beta.1'), true);
  for (const version of ['1.4.5-beta.1', '1.4.5-rc.0', '1.4.5-0', '1.4.5-alpha-beta.2+local.001']) {
    assert.doesNotThrow(() => new UpdateService({ version, directory: path.resolve(os.tmpdir()) }));
  }
  for (const version of ['1.4', '01.4.5-beta.1', '1.04.5-beta.1', '1.4.05-beta.1', '1.4.5-beta.01', '1.4.5-01', '1.4.5-beta..1', '1.4.5-beta.', '1.4.5-', '1.4.5+', '1.4.5+build..1', '1.4.5-beta_1', '1.4.5-beta.1\\n', ' 1.4.5-beta.1', '9007199254740992.4.5-beta.1']) {
    assert.throws(() => new UpdateService({ version, directory: path.resolve(os.tmpdir()) }), /版本或下载目录无效/);
    assert.equal(newerVersion('2.0.0', version), false);
  }
});

function makeManifest(overrides = {}) {
  return {
    schema: 'yutang.windows-update-manifest.v1',
    repository: UPDATE_REPOSITORY,
    tag: 'v1.4.8',
    version: '1.4.8',
    asset: {
      name: 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe',
      size: bytes.length,
      sha256
    },
    source: {
      upstreamCommit: 'a'.repeat(40),
      yutangPatchCommit: 'b'.repeat(40)
    },
    candidate: {
      workflowRunId: 43488935750,
      artifactId: 14068537542
    },
    authenticode: {
      thumbprint: THUMBPRINT,
      subject: 'CN=YuTang Publisher'
    },
    ...overrides
  };
}

function signedManifest(manifest) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const signature = sign(null, manifestBytes, privateKey).toString('base64');
  return { manifestBytes, signature };
}

async function fixture(t, {
  manifest = makeManifest(),
  signatureOverride,
  executableBytes = bytes,
  verifyAuthenticode = async (file, thumbprint) => {
    assert.equal(thumbprint, THUMBPRINT);
    await fs.access(file);
    return { status: 'Valid', thumbprint };
  },
  redirectManifest = false,
  delayResponses = false
} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-update-trust-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const signed = signedManifest(manifest);
  const signature = signatureOverride ?? signed.signature;
  const tag = 'v1.4.8';
  const manifestName = 'yutang-update-manifest.json';
  const signatureName = 'yutang-update-manifest.sig';
  const exeName = 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe';
  const releaseBase = 'https://github.com/' + UPDATE_REPOSITORY + '/releases/download/' + tag + '/';
  const manifestUrl = releaseBase + manifestName;
  const signatureUrl = releaseBase + signatureName;
  const exeUrl = releaseBase + exeName;
  const release = {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      { name: manifestName, size: signed.manifestBytes.length, browser_download_url: manifestUrl },
      { name: signatureName, size: Buffer.byteLength(signature), browser_download_url: signatureUrl },
      { name: exeName, size: manifest.asset.size, browser_download_url: exeUrl }
    ]
  };
  const calls = [];
  const fetchImpl = async (address, options = {}) => {
    calls.push({ address: String(address), options });
    if (delayResponses) await new Promise(resolve => setTimeout(resolve, 5));
    if (String(address).includes('/releases/latest')) return Response.json(release);
    if (address === manifestUrl) {
      if (redirectManifest) return new Response(null, { status: 302, headers: { location: 'https://evil.invalid/manifest' } });
      return new Response(signed.manifestBytes);
    }
    if (address === signatureUrl) return new Response(signature);
    if (address === exeUrl) return new Response(executableBytes);
    throw new Error('Unexpected update URL: ' + address);
  };
  const updater = new UpdateService({
    version: '1.4.7',
    directory,
    fetchImpl,
    manifestPublicKey: publicKeyPem,
    publisherThumbprint: THUMBPRINT,
    verifyAuthenticode: verifyAuthenticode
  });
  return { directory, updater, calls, release, signed, manifestUrl, signatureUrl, exeUrl };
}

test('未配置 YuTang 清单公钥或 Authenticode 发布者指纹时 fail closed，且不访问上游', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-update-closed-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const updater = new UpdateService({
    version: '1.4.7',
    directory,
    fetchImpl: async () => { calls++; throw new Error('must not fetch'); },
    manifestPublicKey: '',
    publisherThumbprint: ''
  });
  const state = await updater.check();
  assert.equal(state.status, 'untrusted-release-channel');
  assert.equal(calls, 0);
});

test('只接受 YuTang 仓库中由独立 Ed25519 清单签名且发布者指纹匹配的版本', async t => {
  const f = await fixture(t);
  const state = await f.updater.check();
  assert.equal(state.status, 'available');
  assert.equal(state.repository, 'yud78785/yutang-build');
  assert.equal(state.latestVersion, '1.4.8');
  assert.equal(state.publisherThumbprint, THUMBPRINT);
  assert.equal(state.sourceCommit, 'b'.repeat(40));
  assert.equal(f.calls.some(item => item.address.includes('LockyBee/dsh-douyin-agent')), false);
});

test('有效清单下载后再次核验 SHA256 和 Authenticode，verifiedExecutable 再次复核', async t => {
  let signatureChecks = 0;
  const f = await fixture(t, {
    verifyAuthenticode: async (file, thumbprint) => {
      signatureChecks++;
      assert.equal(thumbprint, THUMBPRINT);
      assert.deepEqual(await fs.readFile(file), bytes);
      return { status: 'Valid', thumbprint };
    }
  });
  assert.equal((await f.updater.check()).status, 'available');
  const downloaded = await f.updater.download();
  assert.equal(downloaded.status, 'downloaded');
  assert.equal(downloaded.executable, undefined);
  assert.equal(signatureChecks, 1);
  const verified = await f.updater.verifiedExecutable();
  assert.equal(verified.sha256, sha256);
  assert.equal(verified.version, '1.4.8');
  assert.equal(verified.publisherThumbprint, THUMBPRINT);
  assert.deepEqual(await fs.readFile(verified.file), bytes);
  assert.equal(signatureChecks, 2);
});

test('伪造或损坏的清单签名被拒绝', async t => {
  const f = await fixture(t, { signatureOverride: Buffer.alloc(64, 7).toString('base64') });
  const state = await f.updater.check();
  assert.equal(state.status, 'error');
  assert.equal(f.updater.candidate, undefined);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('签名有效但仓库、版本或补丁来源身份不匹配时拒绝', async t => {
  const wrongRepo = await fixture(t, { manifest: makeManifest({ repository: 'attacker/other' }) });
  assert.equal((await wrongRepo.updater.check()).status, 'error');
  const wrongSource = await fixture(t, { manifest: makeManifest({ source: { upstreamCommit: 'a'.repeat(40), yutangPatchCommit: 'not-a-commit' } }) });
  assert.equal((await wrongSource.updater.check()).status, 'error');
  const wrongTag = await fixture(t, { manifest: makeManifest({ tag: 'v1.4.9', version: '1.4.9' }) });
  assert.equal((await wrongTag.updater.check()).status, 'error');
});

test('清单中的 Authenticode 指纹必须等于客户端固定发布者指纹', async t => {
  const manifest = makeManifest({ authenticode: { thumbprint: 'C'.repeat(40), subject: 'CN=Other Publisher' } });
  const f = await fixture(t, { manifest });
  assert.equal((await f.updater.check()).status, 'error');
});

test('EXE 内容与已签名清单摘要不符时不留下部分文件', async t => {
  const f = await fixture(t, { executableBytes: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2046, 9)]) });
  assert.equal((await f.updater.check()).status, 'available');
  assert.equal((await f.updater.download()).status, 'error');
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('Authenticode 核验失败时不重命名或运行文件', async t => {
  const f = await fixture(t, { verifyAuthenticode: async () => { throw new Error('bad signer'); } });
  assert.equal((await f.updater.check()).status, 'available');
  assert.equal((await f.updater.download()).status, 'error');
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('GitHub Release 资产跳转到不允许的主机时拒绝', async t => {
  const f = await fixture(t, { redirectManifest: true });
  assert.equal((await f.updater.check()).status, 'error');
});

test('同一时间重复检查和下载只执行一次', async t => {
  const f = await fixture(t, { delayResponses: true });
  const checks = await Promise.all([f.updater.check(), f.updater.check()]);
  assert.equal(checks[0].status, 'available');
  assert.equal(checks[1].status, 'available');
  const downloads = await Promise.all([f.updater.download(), f.updater.download()]);
  assert.equal(downloads[0].status, 'downloaded');
  assert.equal(downloads[1].status, 'downloaded');
  assert.equal(f.calls.filter(item => item.address === f.exeUrl).length, 1);
});

test('下载后本地 EXE 被改变时二次校验拒绝启动', async t => {
  const f = await fixture(t);
  await f.updater.check();
  assert.equal((await f.updater.download()).status, 'downloaded');
  const verified = await f.updater.verifiedExecutable();
  await fs.writeFile(verified.file, 'tampered');
  await assert.rejects(f.updater.verifiedExecutable(), /已改变/);
});

function fakeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.unrefCalled = false;
  child.kill = signal => {
    child.signalCode = signal;
    child.exitCode = 1;
    child.emit('exit', 1, signal);
    return true;
  };
  child.unref = () => { child.unrefCalled = true; };
  return child;
}

test('更新启动器等待新版 UI/API 健康回执后才切换桌面快捷方式', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-launcher-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'updates'), desktop = path.join(root, 'desktop');
  await fs.mkdir(updates, { recursive: true });
  await fs.mkdir(desktop, { recursive: true });
  const file = path.join(updates, 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
  const healthFile = path.join(updates, '.health-test.json');
  const stagedShortcut = path.join(updates, '.staged-test.lnk');
  const shortcut = path.join(desktop, '大肥鱼抖音助手.lnk');
  await fs.writeFile(file, bytes);
  await fs.writeFile(stagedShortcut, 'new shortcut');
  await fs.writeFile(shortcut, 'old shortcut');
  const nonce = '12345678-1234-4234-8234-123456789abc';
  const child = fakeChild(5555);
  const result = await runUpdateLauncher({
    pid: 4444,
    file,
    sha256,
    publisherThumbprint: THUMBPRINT,
    version: '1.4.8',
    nonce,
    healthFile,
    stagedShortcut,
    shortcut,
    expectedPublisherThumbprint: THUMBPRINT,
    verifyAuthenticodeImpl: async () => ({ status: 'Valid', thumbprint: THUMBPRINT }),
    waitForOldProcessExitImpl: async () => {},
    spawnImpl: () => {
      setImmediate(async () => {
        await fs.writeFile(healthFile, JSON.stringify({
          ready: true, nonce, pid: child.pid, version: '1.4.8', sha256, backendPid: 9000
        }));
        child.emit('spawn');
      });
      return child;
    },
    delayImpl: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    healthTimeoutMs: 1000,
    stabilityMs: 0,
    pollMs: 1
  });
  assert.equal(result.status, 'healthy-update-started');
  assert.equal(child.unrefCalled, true);
  assert.equal(await fs.readFile(shortcut, 'utf8'), 'new shortcut');
  assert.equal(await fs.readFile(stagedShortcut).then(() => true, () => false), false);
  assert.equal(await fs.readFile(healthFile).then(() => true, () => false), false);
  const desktopFiles = await fs.readdir(desktop);
  assert.deepEqual(desktopFiles, ['大肥鱼抖音助手.lnk']);
});

test('新版未写健康回执时，旧快捷方式保留且新版进程被终止', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-launcher-fail-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'updates'), desktop = path.join(root, 'desktop');
  await fs.mkdir(updates, { recursive: true });
  await fs.mkdir(desktop, { recursive: true });
  const file = path.join(updates, 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
  const healthFile = path.join(updates, '.health-fail.json');
  const stagedShortcut = path.join(updates, '.staged-fail.lnk');
  const shortcut = path.join(desktop, '大肥鱼抖音助手.lnk');
  await fs.writeFile(file, bytes);
  await fs.writeFile(stagedShortcut, 'new shortcut');
  await fs.writeFile(shortcut, 'old shortcut');
  const child = fakeChild(5556);
  await assert.rejects(runUpdateLauncher({
    pid: 4444,
    file,
    sha256,
    publisherThumbprint: THUMBPRINT,
    version: '1.4.8',
    nonce: '12345678-1234-4234-8234-123456789abd',
    healthFile,
    stagedShortcut,
    shortcut,
    expectedPublisherThumbprint: THUMBPRINT,
    verifyAuthenticodeImpl: async () => ({ status: 'Valid', thumbprint: THUMBPRINT }),
    waitForOldProcessExitImpl: async () => {},
    spawnImpl: () => {
      setImmediate(() => child.emit('spawn'));
      return child;
    },
    delayImpl: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    healthTimeoutMs: 20,
    stabilityMs: 0,
    pollMs: 5
  }), /健康确认/);
  assert.equal(await fs.readFile(shortcut, 'utf8'), 'old shortcut');
  assert.equal(child.exitCode, 1);
  assert.equal(await fs.readFile(stagedShortcut).then(() => true, () => false), false);
});

test('新版在快捷方式切换后的稳定观察期内崩溃时，恢复旧快捷方式', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-launcher-post-switch-crash-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'updates'), desktop = path.join(root, 'desktop');
  await fs.mkdir(updates, { recursive: true });
  await fs.mkdir(desktop, { recursive: true });
  const file = path.join(updates, 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
  const healthFile = path.join(updates, '.health-post-switch-crash.json');
  const stagedShortcut = path.join(updates, '.staged-post-switch-crash.lnk');
  const shortcut = path.join(desktop, '大肥鱼抖音助手.lnk');
  await fs.writeFile(file, bytes);
  await fs.writeFile(stagedShortcut, 'new shortcut');
  await fs.writeFile(shortcut, 'old shortcut');
  const nonce = '12345678-1234-4234-8234-123456789abf';
  const child = fakeChild(5557);
  let switchedBeforeCrash = false;
  await assert.rejects(runUpdateLauncher({
    pid: 4444,
    file,
    sha256,
    publisherThumbprint: THUMBPRINT,
    version: '1.4.8',
    nonce,
    healthFile,
    stagedShortcut,
    shortcut,
    expectedPublisherThumbprint: THUMBPRINT,
    verifyAuthenticodeImpl: async () => ({ status: 'Valid', thumbprint: THUMBPRINT }),
    waitForOldProcessExitImpl: async () => {},
    spawnImpl: () => {
      setImmediate(async () => {
        await fs.writeFile(healthFile, JSON.stringify({
          ready: true, nonce, pid: child.pid, version: '1.4.8', sha256, backendPid: 9001
        }));
        child.emit('spawn');
      });
      return child;
    },
    delayImpl: async milliseconds => {
      assert.equal(await fs.readFile(shortcut, 'utf8'), 'new shortcut');
      switchedBeforeCrash = true;
      child.exitCode = 1;
      child.signalCode = null;
      child.emit('exit', 1, null);
      await new Promise(resolve => setTimeout(resolve, milliseconds));
    },
    healthTimeoutMs: 1000,
    stabilityMs: 50,
    pollMs: 5
  }), /稳定观察期内异常退出/);
  assert.equal(switchedBeforeCrash, true);
  assert.equal(await fs.readFile(shortcut, 'utf8'), 'old shortcut');
  assert.deepEqual(await fs.readdir(desktop), ['大肥鱼抖音助手.lnk']);
  assert.equal(await fs.readFile(stagedShortcut).then(() => true, () => false), false);
  assert.equal(await fs.readFile(healthFile).then(() => true, () => false), false);
});

test('新版在稳定观察期内正常退出时保留新版快捷方式', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-launcher-post-switch-normal-exit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'updates'), desktop = path.join(root, 'desktop');
  await fs.mkdir(updates, { recursive: true });
  await fs.mkdir(desktop, { recursive: true });
  const file = path.join(updates, 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
  const healthFile = path.join(updates, '.health-post-switch-normal.json');
  const stagedShortcut = path.join(updates, '.staged-post-switch-normal.lnk');
  const shortcut = path.join(desktop, '大肥鱼抖音助手.lnk');
  await fs.writeFile(file, bytes);
  await fs.writeFile(stagedShortcut, 'new shortcut');
  await fs.writeFile(shortcut, 'old shortcut');
  const nonce = '12345678-1234-4234-8234-123456789ac0';
  const child = fakeChild(5558);
  let switchedBeforeExit = false;
  const result = await runUpdateLauncher({
    pid: 4444,
    file,
    sha256,
    publisherThumbprint: THUMBPRINT,
    version: '1.4.8',
    nonce,
    healthFile,
    stagedShortcut,
    shortcut,
    expectedPublisherThumbprint: THUMBPRINT,
    verifyAuthenticodeImpl: async () => ({ status: 'Valid', thumbprint: THUMBPRINT }),
    waitForOldProcessExitImpl: async () => {},
    spawnImpl: () => {
      setImmediate(async () => {
        await fs.writeFile(healthFile, JSON.stringify({
          ready: true, nonce, pid: child.pid, version: '1.4.8', sha256, backendPid: 9002
        }));
        child.emit('spawn');
      });
      return child;
    },
    delayImpl: async milliseconds => {
      assert.equal(await fs.readFile(shortcut, 'utf8'), 'new shortcut');
      switchedBeforeExit = true;
      child.exitCode = 0;
      child.signalCode = null;
      child.emit('exit', 0, null);
      await new Promise(resolve => setTimeout(resolve, milliseconds));
    },
    healthTimeoutMs: 1000,
    stabilityMs: 50,
    pollMs: 5
  });
  assert.equal(result.status, 'healthy-update-started');
  assert.equal(switchedBeforeExit, true);
  assert.equal(await fs.readFile(shortcut, 'utf8'), 'new shortcut');
  assert.deepEqual(await fs.readdir(desktop), ['大肥鱼抖音助手.lnk']);
  assert.equal(await fs.readFile(stagedShortcut).then(() => true, () => false), false);
  assert.equal(await fs.readFile(healthFile).then(() => true, () => false), false);
});

test('发布者签名不通过时，更新启动器不会创建新版进程或切换快捷方式', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-launcher-signer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'updates'), desktop = path.join(root, 'desktop');
  await fs.mkdir(updates, { recursive: true });
  await fs.mkdir(desktop, { recursive: true });
  const file = path.join(updates, 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
  const stagedShortcut = path.join(updates, '.staged.lnk');
  const healthFile = path.join(updates, '.health.json');
  const shortcut = path.join(desktop, '大肥鱼抖音助手.lnk');
  await fs.writeFile(file, bytes);
  await fs.writeFile(stagedShortcut, 'new shortcut');
  await fs.writeFile(shortcut, 'old shortcut');
  let spawnCount = 0;
  await assert.rejects(runUpdateLauncher({
    pid: 4444,
    file,
    sha256,
    publisherThumbprint: THUMBPRINT,
    version: '1.4.8',
    nonce: '12345678-1234-4234-8234-123456789abe',
    healthFile,
    stagedShortcut,
    shortcut,
    expectedPublisherThumbprint: THUMBPRINT,
    verifyAuthenticodeImpl: async () => { throw new Error('wrong publisher'); },
    waitForOldProcessExitImpl: async () => {},
    spawnImpl: () => { spawnCount++; throw new Error('must not spawn'); }
  }), /wrong publisher/);
  assert.equal(spawnCount, 0);
  assert.equal(await fs.readFile(shortcut, 'utf8'), 'old shortcut');
});
