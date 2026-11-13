import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');

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

async function atomicWriteJson(file, value) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, '.' + path.basename(file) + '.' + randomUUID() + '.tmp');
  try {
    await fs.writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readTransaction(file) {
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
  if (value?.schema !== 'yutang.update-transaction.v1' ||
      !['prepared', 'switching', 'switched', 'committed'].includes(value.phase) ||
      ![value.updatesDirectory, value.shortcut, value.stagedShortcut, value.backupShortcut, value.targetExe]
        .every(item => typeof item === 'string' && path.isAbsolute(item)) ||
      path.resolve(path.dirname(value.transactionFile || file)) !== path.resolve(value.updatesDirectory) ||
      path.resolve(path.dirname(value.stagedShortcut)) !== path.resolve(value.updatesDirectory) ||
      !/^[a-f0-9]{64}$/.test(value.oldShortcutSha256 || '') ||
      !/^[a-f0-9]{64}$/.test(value.newShortcutSha256 || '') ||
      !/^[a-f0-9]{64}$/.test(value.targetExeSha256 || '')) {
    throw new Error('UPDATE_TRANSACTION_SCHEMA_INVALID');
  }
  for (const key of ['shortcut', 'stagedShortcut', 'backupShortcut']) {
    if (path.resolve(value[key]) === path.resolve(file)) throw new Error('UPDATE_TRANSACTION_PATH_COLLISION');
  }
  return value;
}

export async function beginUpdateTransaction({
  updatesDirectory, shortcut, stagedShortcut, backupShortcut, targetExe, targetExeSha256
}) {
  if (![updatesDirectory, shortcut, stagedShortcut, backupShortcut, targetExe].every(item => typeof item === 'string' && path.isAbsolute(item))) {
    throw new Error('UPDATE_TRANSACTION_PATHS_MUST_BE_ABSOLUTE');
  }
  const directory = path.resolve(updatesDirectory);
  const paths = [shortcut, stagedShortcut, backupShortcut, targetExe].map(item => path.resolve(item));
  if (
      path.resolve(path.dirname(stagedShortcut)) !== directory ||
      path.resolve(path.dirname(backupShortcut)) !== path.resolve(path.dirname(shortcut)) ||
      !/^[a-f0-9]{64}$/.test(targetExeSha256 || '')) {
    throw new Error('UPDATE_TRANSACTION_ARGUMENTS_INVALID');
  }
  const [oldShortcutSha256, newShortcutSha256, actualTargetSha256] = await Promise.all([
    hashFile(paths[0]), hashFile(paths[1]), hashFile(paths[3])
  ]);
  if (!oldShortcutSha256 || !newShortcutSha256 || actualTargetSha256 !== targetExeSha256) {
    throw new Error('UPDATE_TRANSACTION_PRECONDITION_FAILED');
  }
  const transactionFile = path.join(directory, 'update-transaction.json');
  try {
    await fs.lstat(transactionFile);
    throw new Error('UPDATE_TRANSACTION_ALREADY_ACTIVE');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const transaction = {
    schema: 'yutang.update-transaction.v1',
    phase: 'prepared',
    transactionFile,
    updatesDirectory: directory,
    shortcut: paths[0],
    stagedShortcut: paths[1],
    backupShortcut: paths[2],
    targetExe: paths[3],
    oldShortcutSha256,
    newShortcutSha256,
    targetExeSha256,
    createdAt: new Date().toISOString()
  };
  await atomicWriteJson(transactionFile, transaction);
  return transaction;
}

export async function setUpdateTransactionPhase(transaction, phase) {
  if (!transaction || !['prepared', 'switching', 'switched', 'committed'].includes(phase)) {
    throw new Error('UPDATE_TRANSACTION_PHASE_INVALID');
  }
  const current = await readTransaction(transaction.transactionFile);
  if (!current || current.schema !== transaction.schema) throw new Error('UPDATE_TRANSACTION_MISSING');
  await atomicWriteJson(transaction.transactionFile, { ...current, phase });
}

export async function recoverUpdateTransaction(updatesDirectory) {
  const directory = path.resolve(updatesDirectory);
  const transactionFile = path.join(directory, 'update-transaction.json');
  const transaction = await readTransaction(transactionFile);
  if (!transaction) return { status: 'no-transaction' };
  if (path.resolve(transaction.updatesDirectory) !== directory) {
    return { status: 'blocked', reason: 'UPDATE_TRANSACTION_DIRECTORY_MISMATCH' };
  }
  const [currentHash, backupHash, stagedHash, targetHash] = await Promise.all([
    hashFile(transaction.shortcut), hashFile(transaction.backupShortcut),
    hashFile(transaction.stagedShortcut), hashFile(transaction.targetExe)
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
