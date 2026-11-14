import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { beginUpdateTransaction, recoverUpdateTransaction, runNativeShortcutOperation, setUpdateTransactionPhase, verifyNativeShortcutHelper } from './update-transaction.mjs';

export const UPDATE_PUBLISHER_THUMBPRINT = '';

function normalizedThumbprint(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

export function verifyAuthenticodeSignature(file, expectedThumbprint, {
  platform = process.platform,
  env = process.env,
  execFileSyncImpl = execFileSync
} = {}) {
  const expected = normalizedThumbprint(expectedThumbprint);
  if (platform !== 'win32') throw new Error('AUTHENTICODE_WINDOWS_REQUIRED');
  if (!/^[A-F0-9]{40}$/.test(expected)) throw new Error('AUTHENTICODE_PUBLISHER_NOT_CONFIGURED');
  if (!path.isAbsolute(file)) throw new Error('AUTHENTICODE_FILE_PATH_INVALID');
  const script = "$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:YUTANG_SIGNED_EXE; " +
    "[pscustomobject]@{status=[string]$s.Status; thumbprint=[string]$s.SignerCertificate.Thumbprint} | ConvertTo-Json -Compress";
  const stdout = execFileSyncImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    env: { ...env, YUTANG_SIGNED_EXE: file },
    maxBuffer: 4096
  });
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error('AUTHENTICODE_RESULT_INVALID'); }
  if (result.status !== 'Valid' || normalizedThumbprint(result.thumbprint) !== expected) {
    throw new Error('AUTHENTICODE_PUBLISHER_VERIFICATION_FAILED');
  }
  return { status: result.status, thumbprint: normalizedThumbprint(result.thumbprint) };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export async function waitForOldProcessExit(pid, timeoutMs = 30000, delayImpl = delay) {
  const deadline = Date.now() + timeoutMs;
  while (alive(pid) && Date.now() < deadline) await delayImpl(200);
  if (alive(pid)) throw new Error('旧版仍在退出，未启动新版。');
}

async function waitForChildHealth(child, { healthFile, nonce, version, sha256, timeoutMs, pollMs, delayImpl }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('新版在健康确认前退出。');
    try {
      const stat = await fs.lstat(healthFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('新版健康回执文件无效。');
      const value = JSON.parse(await fs.readFile(healthFile, 'utf8'));
      if (value.ready !== true || value.nonce !== nonce || value.pid !== child.pid ||
          value.version !== version || value.sha256 !== sha256 ||
          !Number.isSafeInteger(value.backendPid) || value.backendPid < 1) {
        throw new Error('新版健康回执与候选身份不一致。');
      }
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await delayImpl(pollMs);
  }
  throw new Error('新版未在限定时间内完成 UI 与 API 健康确认。');
}

async function waitForStableChild(child, milliseconds, pollMs, delayImpl) {
  const check = () => {
    if (child.signalCode !== null || (child.exitCode !== null && child.exitCode !== 0)) {
      throw new Error('新版在快捷方式提交后的稳定观察期内异常退出。');
    }
    return child.exitCode === 0 && child.signalCode === null;
  };
  if (check()) return;
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    await delayImpl(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    if (check()) return;
  }
  check();
}

async function stopChild(child, delayImpl = delay) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill('SIGTERM'); } catch {}
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delayImpl(100);
  if (child.exitCode === null && child.signalCode === null) {
    try { child.kill('SIGKILL'); } catch {}
    const hardDeadline = Date.now() + 3000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < hardDeadline) await delayImpl(100);
  }
}

async function hashRegularFile(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return createHash('sha256').update(await fs.readFile(file)).digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function commitShortcut(stagedShortcut, shortcut, nonce, transaction, nativeHelper = {}) {
  const expectedOld = transaction?.oldShortcutSha256;
  const expectedNew = transaction?.newShortcutSha256;
  if (!path.isAbsolute(stagedShortcut || '') || !path.isAbsolute(shortcut || '') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce || '') ||
      !/^[a-f0-9]{64}$/.test(expectedOld || '') || !/^[a-f0-9]{64}$/.test(expectedNew || '')) {
    throw new Error('UPDATE_SHORTCUT_COMMIT_ARGUMENTS_INVALID');
  }
  const [stagedBefore, currentBefore] = await Promise.all([
    hashRegularFile(stagedShortcut),
    hashRegularFile(shortcut)
  ]);
  if (stagedBefore !== expectedNew) throw new Error('UPDATE_STAGED_SHORTCUT_CHANGED_BEFORE_COMMIT');
  if (currentBefore !== expectedOld) throw new Error('UPDATE_CURRENT_SHORTCUT_CHANGED_BEFORE_COMMIT');

  const directory = path.dirname(shortcut);
  const temporary = path.join(directory, '.' + path.basename(shortcut) + '.' + nonce + '.tmp.lnk');
  const backup = path.join(directory, '.' + path.basename(shortcut) + '.' + nonce + '.bak.lnk');
  try {
    await fs.copyFile(stagedShortcut, temporary, fsConstants.COPYFILE_EXCL);
    if (await hashRegularFile(temporary) !== expectedNew) {
      throw new Error('UPDATE_STAGED_SHORTCUT_COPY_HASH_MISMATCH');
    }
    if (process.platform === 'win32') {
      await runNativeShortcutOperation('--shortcut-commit', {
        shortcut,
        backup,
        temporary,
        'old-sha256': expectedOld,
        'new-sha256': expectedNew
      }, nativeHelper);
    } else {
      // Non-Windows path is retained only for portable unit tests.
      await fs.copyFile(shortcut, backup, fsConstants.COPYFILE_EXCL);
      if (await hashRegularFile(backup) !== expectedOld) {
        throw new Error('UPDATE_SHORTCUT_BACKUP_HASH_MISMATCH');
      }
      if (await hashRegularFile(shortcut) !== expectedOld) {
        throw new Error('UPDATE_CURRENT_SHORTCUT_CHANGED_DURING_COMMIT');
      }
      if (await hashRegularFile(stagedShortcut) !== expectedNew) {
        throw new Error('UPDATE_STAGED_SHORTCUT_CHANGED_DURING_COMMIT');
      }
      await fs.rename(temporary, shortcut);
      if (await hashRegularFile(shortcut) !== expectedNew) {
        throw new Error('UPDATE_SHORTCUT_COMMIT_HASH_MISMATCH');
      }
    }
  } catch (error) {
    // On Windows, preserve all transaction evidence for handle-based recovery.
    if (process.platform !== 'win32') await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return {
    backup,
    finalize: async function () {
      if (process.platform === 'win32') {
        await runNativeShortcutOperation('--shortcut-delete', { path: backup, sha256: expectedOld }, nativeHelper);
      } else {
        await fs.rm(backup, { force: true });
      }
    }
  };
}
export async function runUpdateLauncher({
  pid,
  file,
  sha256,
  publisherThumbprint,
  version,
  nonce,
  healthFile,
  stagedShortcut,
  expectedStagedShortcutSha256,
  shortcut,
  nativeHelperPath = process.env.YUTANG_JOBGUARD_PATH,
  nativeHelperSha256 = process.env.YUTANG_JOBGUARD_SHA256,
  expectedPublisherThumbprint = UPDATE_PUBLISHER_THUMBPRINT,
  verifyAuthenticodeImpl = verifyAuthenticodeSignature,
  waitForOldProcessExitImpl = waitForOldProcessExit,
  spawnImpl = spawn,
  delayImpl = delay,
  healthTimeoutMs = 60000,
  stabilityMs = 30000,
  pollMs = 200
} = {}) {
  if (!Number.isSafeInteger(pid) || pid < 1 || !path.isAbsolute(file || '') ||
      !/^Dafeiyu-Douyin-API-\d+\.\d+\.\d+-win-x64\.exe$/.test(path.basename(file)) ||
      !/^[a-f0-9]{64}$/.test(sha256 || '') || !/^\d+\.\d+\.\d+$/.test(version || '') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce || '') ||
      !path.isAbsolute(healthFile || '') || !path.isAbsolute(stagedShortcut || '') ||
      !/^[a-f0-9]{64}$/.test(expectedStagedShortcutSha256 || '') ||
      !path.isAbsolute(shortcut || '') || path.extname(stagedShortcut).toLowerCase() !== '.lnk' ||
      path.extname(shortcut).toLowerCase() !== '.lnk') throw new Error('更新启动参数无效');
  const expected = normalizedThumbprint(expectedPublisherThumbprint);
  const supplied = normalizedThumbprint(publisherThumbprint);
  if (!/^[A-F0-9]{40}$/.test(expected) || supplied !== expected) throw new Error('更新发布者身份未配置或不匹配');
  const nativeHelper = { nativeHelperPath, nativeHelperSha256 };
  const stagedShortcutSha256 = await hashRegularFile(stagedShortcut);
  if (!stagedShortcutSha256) throw new Error('UPDATE_STAGED_SHORTCUT_MISSING_OR_INVALID');
  if (stagedShortcutSha256 !== expectedStagedShortcutSha256) {
    throw new Error('UPDATE_STAGED_SHORTCUT_IDENTITY_MISMATCH');
  }
  if (process.platform === 'win32') await verifyNativeShortcutHelper(nativeHelperPath, nativeHelperSha256);
  const updatesDirectory = path.resolve(path.dirname(file));
  if (path.resolve(path.dirname(healthFile)) !== updatesDirectory ||
      path.resolve(path.dirname(stagedShortcut)) !== updatesDirectory) throw new Error('更新暂存路径不在受控目录');

  let child = null;
  let rollbackShortcut = null;
  let transaction = null;
  try {
    await waitForOldProcessExitImpl(pid, 30000, delayImpl);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1024) throw new Error('更新文件不是有效普通文件');
    const bytes = await fs.readFile(file);
    if (bytes.subarray(0, 2).toString('ascii') !== 'MZ' ||
        createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('更新文件 SHA256 核对失败');
    await verifyAuthenticodeImpl(file, expected);

    child = spawnImpl(file, [], {
      cwd: path.dirname(file),
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
      shell: false,
      env: {
        ...process.env,
        YUTANG_UPDATE_HEALTH_FILE: healthFile,
        YUTANG_UPDATE_HEALTH_NONCE: nonce,
        YUTANG_UPDATE_EXPECTED_SHA256: sha256
      }
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) throw new Error('新版进程未返回有效 PID');

    const health = await waitForChildHealth(child, {
      healthFile, nonce, version, sha256, timeoutMs: healthTimeoutMs, pollMs, delayImpl
    });
    const backupShortcut = path.join(path.dirname(shortcut), '.' + path.basename(shortcut) + '.' + nonce + '.bak.lnk');
    transaction = await beginUpdateTransaction({
      updatesDirectory, shortcut, stagedShortcut, backupShortcut, targetExe: file,
      targetExeSha256: sha256, expectedStagedShortcutSha256, nonce
    });
    await setUpdateTransactionPhase(transaction, 'switching');
    rollbackShortcut = await commitShortcut(stagedShortcut, shortcut, nonce, transaction, nativeHelper);
    await setUpdateTransactionPhase(transaction, 'switched');
    // Keep the old shortcut backup until the new process survives the post-switch observation window.
    await waitForStableChild(child, stabilityMs, pollMs, delayImpl);
    await setUpdateTransactionPhase(transaction, 'committed');
    await rollbackShortcut.finalize();
    rollbackShortcut = null;
    await fs.rm(transaction.transactionFile, { force: true });
    child.unref();
    await fs.rm(healthFile, { force: true }).catch(() => {});
    if (process.platform === 'win32') {
      try { await runNativeShortcutOperation('--shortcut-delete', { path: stagedShortcut, sha256: transaction.newShortcutSha256 }, nativeHelper); }
      catch (error) { console.warn('UPDATE_STAGED_SHORTCUT_PRESERVED', String(error?.message || error).slice(0, 240)); }
    } else {
      await fs.rm(stagedShortcut, { force: true }).catch(() => {});
    }
    return { status: 'healthy-update-started', pid: child.pid, version, sha256, health };
  } catch (error) {
    let recoveryError = null;
    if (transaction) {
      try {
        const recovered = await recoverUpdateTransaction(updatesDirectory, { shortcut, ...nativeHelper });
        if (!['rolled-back', 'old-shortcut-preserved', 'committed-cleanup'].includes(recovered.status)) {
          recoveryError = new Error(recovered.reason || 'UPDATE_TRANSACTION_RECOVERY_INCOMPLETE');
        }
      } catch (failure) {
        recoveryError = failure;
      }
    }
    await stopChild(child, delayImpl);
    if (!recoveryError) {
      await fs.rm(healthFile, { force: true }).catch(() => {});
      if (process.platform !== 'win32') {
        await fs.rm(stagedShortcut, { force: true }).catch(() => {});
      } else if (!transaction && stagedShortcutSha256) {
        try {
          await runNativeShortcutOperation('--shortcut-delete', { path: stagedShortcut, sha256: stagedShortcutSha256 }, nativeHelper);
        } catch (cleanupError) {
          console.warn('UPDATE_STAGED_SHORTCUT_PRESERVED', String(cleanupError?.message || cleanupError).slice(0, 240));
        }
      }
      if (transaction) await fs.rm(transaction.transactionFile, { force: true }).catch(() => {});
    }
    if (recoveryError) {
      throw new AggregateError([error, recoveryError],
        '新版更新失败，桌面快捷方式状态需要人工核对；请保留更新事务文件；如存在备份，请勿删除：' + (transaction?.backupShortcut || '更新事务备份文件'));
    }
    throw error;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const [pidText, file, sha256, publisherThumbprint, version, nonce, healthFile, stagedShortcut, expectedStagedShortcutSha256, shortcut, nativeHelperPath, nativeHelperSha256] = process.argv.slice(2);
  runUpdateLauncher({
    pid: Number(pidText), file, sha256, publisherThumbprint, version, nonce, healthFile,
    stagedShortcut, expectedStagedShortcutSha256, shortcut, nativeHelperPath, nativeHelperSha256
  }).then(() => {
    process.stdout.write('YU TANG UPDATE HEALTH CHECK PASSED\n');
  }).catch(error => {
    console.error('YU TANG UPDATE FAILED:', String(error?.message || error).slice(0, 500));
    process.exitCode = 1;
  });
}
