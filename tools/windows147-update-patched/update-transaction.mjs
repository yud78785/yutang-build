import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const VERSIONED_EXE = /^Dafeiyu-Douyin-API-\d+\.\d+\.\d+-win-x64\.exe$/;
const PHASES = ['prepared', 'switching', 'switched', 'committed'];

async function hashFile(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return sha256(await fs.readFile(file));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicReplaceJson(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, '.' + path.basename(file) + '.' + randomUUID() + '.tmp');
  try {
    await fs.writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function validateTransaction(value, transactionFile, expectedShortcut) {
  const updatesDirectory = path.resolve(path.dirname(transactionFile));
  const shortcut = path.resolve(expectedShortcut);
  if (value?.schema !== 'yutang.update-transaction.v1' ||
      !PHASES.includes(value.phase) ||
      !UUID.test(value.nonce || '') ||
      path.resolve(value.transactionFile || '') !== path.resolve(transactionFile) ||
      path.resolve(value.updatesDirectory || '') !== updatesDirectory ||
      path.resolve(value.shortcut || '') !== shortcut ||
      path.resolve(value.stagedShortcut || '') !== path.join(updatesDirectory, '.shortcut-' + value.nonce + '.lnk') ||\n      path.resolve(value.temporaryShortcut || '') !== path.join(path.dirname(shortcut), '.' + path.basename(shortcut) + '.' + value.nonce + '.tmp.lnk') ||
      path.resolve(value.backupShortcut || '') !== path.join(path.dirname(shortcut), '.' + path.basename(shortcut) + '.' + value.nonce + '.bak.lnk') ||
      !path.isAbsolute(value.targetExe || '') ||
      path.dirname(path.resolve(value.targetExe)) !== updatesDirectory ||
      !VERSIONED_EXE.test(path.basename(value.targetExe)) ||
      !HASH.test(value.oldShortcutSha256 || '') ||
      !HASH.test(value.newShortcutSha256 || '') ||
      !HASH.test(value.targetExeSha256 || '')) {
    throw new Error('UPDATE_TRANSACTION_SCHEMA_OR_PATH_INVALID');
  }
  return {
    ...value,
    transactionFile: path.resolve(transactionFile),
    updatesDirectory,
    shortcut,
    stagedShortcut: path.resolve(value.stagedShortcut),
    backupShortcut: path.resolve(value.backupShortcut),
    targetExe: path.resolve(value.targetExe)
  };
}

async function readTransaction(file, expectedShortcut) {
  let value;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) {
      throw new Error('UPDATE_TRANSACTION_FILE_INVALID');
    }
    value = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return validateTransaction(value, file, expectedShortcut);
}

export async function beginUpdateTransaction({
  updatesDirectory, shortcut, stagedShortcut, backupShortcut, targetExe, targetExeSha256, nonce
}) {
  if (![updatesDirectory, shortcut, stagedShortcut, backupShortcut, targetExe]
    .every(item => typeof item === 'string' && path.isAbsolute(item)) ||
      !UUID.test(nonce || '')) {
    throw new Error('UPDATE_TRANSACTION_PATHS_OR_NONCE_INVALID');
  }
  const directory = path.resolve(updatesDirectory);
  const expectedShortcut = path.resolve(shortcut);
  const expectedStaged = path.join(directory, '.shortcut-' + nonce + '.lnk');
  const expectedBackup = path.join(path.dirname(expectedShortcut), '.' + path.basename(expectedShortcut) + '.' + nonce + '.bak.lnk');\n  const expectedTemporary = path.join(path.dirname(expectedShortcut), '.' + path.basename(expectedShortcut) + '.' + nonce + '.tmp.lnk');
  const expectedTarget = path.resolve(targetExe);
  if (path.resolve(stagedShortcut) !== expectedStaged ||
      path.resolve(backupShortcut) !== expectedBackup ||
      path.dirname(expectedTarget) !== directory ||
      !VERSIONED_EXE.test(path.basename(expectedTarget)) ||
      !HASH.test(targetExeSha256 || '')) {
    throw new Error('UPDATE_TRANSACTION_ARGUMENTS_INVALID');
  }
  const [oldShortcutSha256, newShortcutSha256, actualTargetSha256] = await Promise.all([
    hashFile(expectedShortcut), hashFile(expectedStaged), hashFile(expectedTarget)
  ]);
  if (!oldShortcutSha256 || !newShortcutSha256 || actualTargetSha256 !== targetExeSha256) {
    throw new Error('UPDATE_TRANSACTION_PRECONDITION_FAILED');
  }
  const transactionFile = path.join(directory, 'update-transaction.json');
  const transaction = {
    schema: 'yutang.update-transaction.v1',
    phase: 'prepared',
    nonce,
    transactionFile,
    updatesDirectory: directory,
    shortcut: expectedShortcut,
    stagedShortcut: expectedStaged,
    backupShortcut: expectedBackup,
    targetExe: expectedTarget,
    oldShortcutSha256,
    newShortcutSha256,
    targetExeSha256,
    createdAt: new Date().toISOString()
  };
  let handle;
  try {
    handle = await fs.open(transactionFile, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(transaction) + '\n');
    await handle.sync();
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('UPDATE_TRANSACTION_ALREADY_ACTIVE');
    throw error;
  } finally {
    await handle?.close();
  }
  return transaction;
}

export async function setUpdateTransactionPhase(transaction, phase) {
  if (!transaction || !PHASES.includes(phase)) throw new Error('UPDATE_TRANSACTION_PHASE_INVALID');
  const current = await readTransaction(transaction.transactionFile, transaction.shortcut);
  if (!current || current.schema !== transaction.schema || current.nonce !== transaction.nonce) {
    throw new Error('UPDATE_TRANSACTION_MISSING_OR_CHANGED');
  }
  const currentIndex = PHASES.indexOf(current.phase);
  const nextIndex = PHASES.indexOf(phase);
  if (nextIndex !== currentIndex + 1) throw new Error('UPDATE_TRANSACTION_PHASE_TRANSITION_INVALID');
  await atomicReplaceJson(transaction.transactionFile, { ...current, phase });
}

export async function recoverUpdateTransaction(updatesDirectory, { shortcut } = {}) {
  if (typeof updatesDirectory !== 'string' || !path.isAbsolute(updatesDirectory) ||
      typeof shortcut !== 'string' || !path.isAbsolute(shortcut)) {
    return { status: 'blocked', reason: 'UPDATE_TRANSACTION_EXPECTED_PATHS_REQUIRED' };
  }
  const directory = path.resolve(updatesDirectory);
  const transactionFile = path.join(directory, 'update-transaction.json');
  let transaction;
  try {
    transaction = await readTransaction(transactionFile, shortcut);
  } catch (error) {
    return { status: 'blocked', reason: String(error?.message || error) };
  }
  if (!transaction) return { status: 'no-transaction' };

  const [currentHash, backupHash, stagedHash, targetHash, temporaryHash] = await Promise.all([
    hashFile(transaction.shortcut),
    hashFile(transaction.backupShortcut),
    hashFile(transaction.stagedShortcut),
    hashFile(transaction.targetExe)
  ]);
  if (targetHash !== transaction.targetExeSha256) {
    return { status: 'blocked', reason: 'UPDATE_TARGET_IDENTITY_CHANGED' };
  }

  if (transaction.phase === 'committed') {
    if (currentHash !== transaction.newShortcutSha256) {
      return { status: 'blocked', reason: 'COMMITTED_SHORTCUT_CHANGED' };
    }
    if (backupHash && backupHash !== transaction.oldShortcutSha256) {
      return { status: 'blocked', reason: 'BACKUP_IDENTITY_CHANGED' };
    }
    if (backupHash) await fs.rm(transaction.backupShortcut);
    if (stagedHash === transaction.newShortcutSha256) await fs.rm(transaction.stagedShortcut);
    await fs.rm(transactionFile);
    return { status: 'committed-cleanup' };
  }

  if (currentHash === transaction.oldShortcutSha256 && !backupHash) {
    if (stagedHash === transaction.newShortcutSha256) await fs.rm(transaction.stagedShortcut);
    await fs.rm(transactionFile);
    return { status: 'old-shortcut-preserved' };
  }
  if (backupHash !== transaction.oldShortcutSha256) {
    return { status: 'blocked', reason: 'OLD_SHORTCUT_BACKUP_MISSING_OR_CHANGED' };
  }
  if (currentHash && currentHash !== transaction.newShortcutSha256) {
    return { status: 'blocked', reason: 'CURRENT_SHORTCUT_CHANGED_BY_USER' };
  }
  if (currentHash === transaction.newShortcutSha256) await fs.rm(transaction.shortcut);
  await fs.rename(transaction.backupShortcut, transaction.shortcut);
  if (await hashFile(transaction.shortcut) !== transaction.oldShortcutSha256) {
    return { status: 'blocked', reason: 'RESTORED_SHORTCUT_HASH_MISMATCH' };
  }
  if (stagedHash === transaction.newShortcutSha256) await fs.rm(transaction.stagedShortcut);
  await fs.rm(transactionFile);
  return { status: 'rolled-back' };
}
