import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  beginUpdateTransaction,
  recoverUpdateTransaction,
  setUpdateTransactionPhase
} from '../tools/windows147-update-patched/update-transaction.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-update-transaction-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const updates = path.join(root, 'updates');
  const desktop = path.join(root, 'desktop');
  await fs.mkdir(updates);
  await fs.mkdir(desktop);
  const shortcut = path.join(desktop, 'YuTang.lnk');
  const nonce = '12345678-1234-4234-8234-123456789abc';
  const staged = path.join(updates, '.shortcut-' + nonce + '.lnk');
  const backup = path.join(desktop, '.YuTang.lnk.' + nonce + '.bak.lnk');
  const target = path.join(updates, 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
  await fs.writeFile(shortcut, 'old shortcut');
  await fs.writeFile(staged, 'new shortcut');
  await fs.writeFile(target, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2046, 1)]));
  const transaction = await beginUpdateTransaction({
    updatesDirectory: updates,
    shortcut,
    stagedShortcut: staged,
    backupShortcut: backup,
    targetExe: target,
    targetExeSha256: hash(await fs.readFile(target)),
    nonce
  });
  return { updates, shortcut, staged, backup, target, nonce, transaction };
}

test('更新助手在快捷方式替换前被强杀：旧入口保持且事务可清理', async t => {
  const f = await fixture(t);
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
  assert.equal(result.status, 'old-shortcut-preserved');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
  assert.equal(await fs.access(f.staged).then(() => true, () => false), false);
});

test('更新助手在旧快捷方式已备份但新入口尚未落位时被强杀：自动恢复旧入口', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.rename(f.shortcut, f.backup);
  const result = await recoverUpdateTransaction(f.updates);
  assert.equal(result.status, 'rolled-back');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
  assert.equal(await fs.access(f.backup).then(() => true, () => false), false);
});

test('更新助手在新入口切换后被强杀：自动回滚旧入口', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.rename(f.shortcut, f.backup);
  await fs.rename(f.staged, f.shortcut);
  await setUpdateTransactionPhase(f.transaction, 'switched');
  const result = await recoverUpdateTransaction(f.updates);
  assert.equal(result.status, 'rolled-back');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
});

test('提交记录已持久化但备份清理前被强杀：下次启动只完成清理', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.rename(f.shortcut, f.backup);
  await fs.rename(f.staged, f.shortcut);
  await setUpdateTransactionPhase(f.transaction, 'switched');
  await setUpdateTransactionPhase(f.transaction, 'committed');
  const result = await recoverUpdateTransaction(f.updates);
  assert.equal(result.status, 'committed-cleanup');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'new shortcut');
  assert.equal(await fs.access(f.backup).then(() => true, () => false), false);
});

test('快捷方式被用户改动时不覆盖、不删除备份，明确阻塞', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.rename(f.shortcut, f.backup);
  await fs.rename(f.staged, f.shortcut);
  await fs.writeFile(f.shortcut, 'user edited shortcut');
  const result = await recoverUpdateTransaction(f.updates);
  assert.equal(result.status, 'blocked');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'user edited shortcut');
  assert.equal(await fs.readFile(f.backup, 'utf8'), 'old shortcut');
});

test('目标 EXE 身份变化时不执行快捷方式恢复', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.rename(f.shortcut, f.backup);
  await fs.rename(f.staged, f.shortcut);
  await fs.writeFile(f.target, 'tampered target');
  const result = await recoverUpdateTransaction(f.updates);
  assert.equal(result.status, 'blocked');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'new shortcut');
  assert.equal(await fs.readFile(f.backup, 'utf8'), 'old shortcut');
});

test('恢复事务必须绑定到预期桌面快捷方式，拒绝 journal 路径注入', async t => {
  const f = await fixture(t);
  const protectedFile = path.join(f.desktop, 'important-user-file.txt');
  await fs.writeFile(protectedFile, 'do not touch');
  const journal = path.join(f.updates, 'update-transaction.json');
  const record = JSON.parse(await fs.readFile(journal, 'utf8'));
  record.shortcut = protectedFile;
  record.backupShortcut = path.join(f.desktop, '.important-user-file.txt.' + f.nonce + '.bak.lnk');
  await fs.writeFile(journal, JSON.stringify(record));
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
  assert.equal(result.status, 'blocked');
  assert.equal(await fs.readFile(protectedFile, 'utf8'), 'do not touch');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
  assert.equal(await fs.access(journal).then(() => true, () => false), true);
});

test('缺少预期快捷方式路径时 fail closed', async t => {
  const f = await fixture(t);
  const result = await recoverUpdateTransaction(f.updates);
  assert.equal(result.status, 'blocked');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
});

