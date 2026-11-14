import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  beginUpdateTransaction,
  recoverUpdateTransaction,
  resolveDesktopShortcutPath,
  setUpdateTransactionPhase
} from '../tools/windows147-update-patched/update-transaction.mjs';
import { commitShortcut } from '../tools/windows147-update-patched/update-launcher.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

test('优先使用 Electron 提供的 Desktop 已知文件夹', () => {
  const desktop = path.join(os.tmpdir(), 'YuTang Desktop');
  const calls = [];
  const shortcut = resolveDesktopShortcutPath({
    getPath(name) {
      calls.push(name);
      if (name === 'desktop') return desktop;
      throw new Error('home must not be requested');
    }
  });
  assert.equal(shortcut, path.join(desktop, '大肥鱼抖音助手.lnk'));
  assert.deepEqual(calls, ['desktop']);
});

test('干净 Windows 配置没有 Desktop 路径时回退到用户目录下的 Desktop', () => {
  const home = path.join(os.tmpdir(), 'YuTang Test Home');
  const calls = [];
  const shortcut = resolveDesktopShortcutPath({
    getPath(name) {
      calls.push(name);
      if (name === 'desktop') throw new Error("Failed to get 'desktop' path");
      if (name === 'home') return home;
      throw new Error('unexpected path key: ' + name);
    }
  });
  assert.equal(shortcut, path.join(home, 'Desktop', '大肥鱼抖音助手.lnk'));
  assert.deepEqual(calls, ['desktop', 'home']);
});

test('Desktop 与 home 都不可用时安全拒绝，不猜测快捷方式位置', () => {
  assert.throws(() => resolveDesktopShortcutPath({
    getPath(name) {
      if (name === 'desktop') throw new Error('desktop unavailable');
      if (name === 'home') return 'relative-home';
      throw new Error('unexpected path key: ' + name);
    }
  }), /DESKTOP_SHORTCUT_PATH_UNAVAILABLE/);
});

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
  const temporary = path.join(desktop, '.YuTang.lnk.' + nonce + '.tmp.lnk');
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
  return { updates, desktop, shortcut, staged, backup, temporary, target, nonce, transaction };
}

test('提交前验证旧入口与暂存入口哈希，再切换并保留旧入口备份', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  const committed = await commitShortcut(f.staged, f.shortcut, f.nonce, f.transaction);
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'new shortcut');
  assert.equal(await fs.readFile(committed.backup, 'utf8'), 'old shortcut');
  assert.equal(await fs.access(f.temporary).then(() => true, () => false), false);
  await committed.finalize();
  assert.equal(await fs.access(f.backup).then(() => true, () => false), false);
});

test('用户在事务准备后修改旧快捷方式时，提交拒绝覆盖并保留事务', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.writeFile(f.shortcut, 'user edited shortcut');
  await assert.rejects(
    commitShortcut(f.staged, f.shortcut, f.nonce, f.transaction),
    /UPDATE_CURRENT_SHORTCUT_CHANGED_BEFORE_COMMIT/
  );
  const recovered = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
  assert.equal(recovered.status, 'blocked');
  assert.equal(recovered.reason, 'CURRENT_SHORTCUT_CHANGED_BY_USER');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'user edited shortcut');
  assert.equal(await fs.access(f.backup).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(f.updates, 'update-transaction.json')).then(() => true, () => false), true);
});

test('暂存快捷方式在事务准备后被替换时，提交拒绝使用被改变的文件', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.writeFile(f.staged, 'tampered staged shortcut');
  await assert.rejects(
    commitShortcut(f.staged, f.shortcut, f.nonce, f.transaction),
    /UPDATE_STAGED_SHORTCUT_CHANGED_BEFORE_COMMIT/
  );
  const recovered = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
  assert.equal(recovered.status, 'old-shortcut-preserved');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
  assert.equal(await fs.readFile(f.staged, 'utf8'), 'tampered staged shortcut');
  assert.equal(await fs.access(f.backup).then(() => true, () => false), false);
});

test('更新助手在快捷方式替换前被强杀：旧入口保持且事务可清理', async t => {
  const f = await fixture(t);
  await fs.copyFile(f.staged, f.temporary);
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
  assert.equal(result.status, 'old-shortcut-preserved');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
  assert.equal(await fs.access(f.staged).then(() => true, () => false), false);
  assert.equal(await fs.access(f.temporary).then(() => true, () => false), false);
});

test('原快捷方式已复制备份但尚未原子替换时被强杀：保留旧入口并清理临时文件', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.copyFile(f.shortcut, f.backup);
  await fs.copyFile(f.staged, f.temporary);
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
  assert.equal(result.status, 'old-shortcut-preserved');
  assert.equal(await fs.readFile(f.shortcut, 'utf8'), 'old shortcut');
  assert.equal(await fs.access(f.backup).then(() => true, () => false), false);
  assert.equal(await fs.access(f.temporary).then(() => true, () => false), false);
  assert.equal(await fs.access(f.staged).then(() => true, () => false), false);
});

test('更新助手在旧快捷方式已备份但新入口尚未落位时被强杀：自动恢复旧入口', async t => {
  const f = await fixture(t);
  await setUpdateTransactionPhase(f.transaction, 'switching');
  await fs.rename(f.shortcut, f.backup);
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
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
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
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
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
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
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
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
  const result = await recoverUpdateTransaction(f.updates, { shortcut: f.shortcut });
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

