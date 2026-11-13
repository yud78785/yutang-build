#!/usr/bin/env node
// Copy pinned patch blobs from the Git object database, not a Windows text-mode worktree.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const UPSTREAM_COMMIT = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const blobBytes = (sha, cwd) => execFileSync('git', ['cat-file', 'blob', sha], { cwd, maxBuffer: 8 * 1024 * 1024 });

export async function applyPinnedStaticPatches(upstreamRoot) {
  const repoRoot = process.cwd();
  const upstream = path.resolve(upstreamRoot);
  const branchCommit = git(['rev-parse', 'HEAD'], repoRoot);
  const upstreamCommit = git(['rev-parse', 'HEAD'], upstream);
  if (upstreamCommit !== UPSTREAM_COMMIT) throw new Error('UPSTREAM_COMMIT_MISMATCH: ' + upstreamCommit);

  const manifestPath = 'tools/windows147-patched/manifest.json';
  const manifestSha = git(['rev-parse', 'HEAD:' + manifestPath], repoRoot);
  const manifestBytes = blobBytes(manifestSha, repoRoot);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.upstreamCommit !== UPSTREAM_COMMIT || !Array.isArray(manifest.sources) || manifest.sources.length !== 7) {
    throw new Error('STATIC_SECURITY_PATCH_MANIFEST_MISMATCH');
  }

  const files = [];
  for (const item of manifest.sources) {
    if (typeof item.path !== 'string' || typeof item.patchFile !== 'string' ||
        !/^[a-f0-9]{40}$/.test(item.originalGitBlobSha1 || '') ||
        !/^[a-f0-9]{40}$/.test(item.patchedGitBlobSha1 || '')) {
      throw new Error('STATIC_SECURITY_PATCH_ENTRY_INVALID');
    }
    const sourceBlob = git(['-C', upstream, 'hash-object', '--', item.path], repoRoot);
    if (sourceBlob !== item.originalGitBlobSha1) {
      throw new Error('UPSTREAM_SOURCE_BLOB_MISMATCH: ' + item.path + ' expected ' + item.originalGitBlobSha1 + ' got ' + sourceBlob);
    }
    const patchPath = 'tools/windows147-patched/' + item.patchFile;
    const patchBlob = git(['rev-parse', 'HEAD:' + patchPath], repoRoot);
    if (patchBlob !== item.patchedGitBlobSha1) {
      throw new Error('PATCH_FILE_COMMIT_BLOB_MISMATCH: ' + item.patchFile + ' expected ' + item.patchedGitBlobSha1 + ' got ' + patchBlob);
    }
    const bytes = blobBytes(patchBlob, repoRoot);
    const target = path.join(upstream, item.path);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PATCH_TARGET_NOT_REGULAR: ' + item.path);
    await fs.writeFile(target, bytes);
    const after = git(['-C', upstream, 'hash-object', '--', item.path], repoRoot);
    if (after !== item.patchedGitBlobSha1) {
      throw new Error('PATCHED_SOURCE_BLOB_MISMATCH: ' + item.path + ' expected ' + item.patchedGitBlobSha1 + ' got ' + after);
    }
    files.push({
      path: item.path,
      originalGitBlobSha1: sourceBlob,
      patchGitBlobSha1: patchBlob,
      patchedGitBlobSha1: after,
      bytes: bytes.length
    });
    console.log('PASS_STATIC_PATCH_BLOB ' + item.path + ' ' + after);
  }

  const receipt = {
    schema: 'yutang.windows147-static-patch-receipt.v1',
    status: 'PASS_PINNED_STATIC_PATCH_BLOBS',
    branchCommit,
    upstreamCommit,
    manifestGitBlobSha1: manifestSha,
    files,
    windowsTextModeWorktreeBypassed: true,
    release: false
  };
  await fs.writeFile(path.join(upstream, 'windows-security-147-static-patch-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('PASS_WINDOWS_147_STATIC_PATCH_APPLIER ' + JSON.stringify(receipt));
  return receipt;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node tools/apply_windows147_static_patches.mjs /absolute/upstream/source');
  applyPinnedStaticPatches(root).catch(error => {
    console.error('WINDOWS_147_STATIC_PATCH_FAIL_CLOSED: ' + String(error?.message || error));
    process.exitCode = 1;
  });
}
