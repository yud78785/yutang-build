import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

if (process.platform !== 'win32') throw new Error('Windows-runner-only acceptance tool.');
const upstream = path.resolve('upstream', 'desktop');
const modulePath = path.join(upstream, 'scripts', 'acquire-upstream.mjs');
const { acquireUpstream, hashSourceTree } = await import(pathToFileURL(modulePath).href);
const manifest = JSON.parse(await fs.readFile(path.join(upstream, 'UPSTREAM.json'), 'utf8'));

assert.equal(manifest.commit, 'fb2c4b9e698e30edb738bca4cf0618587db7d203');
assert.equal(manifest.archive.sha256, '60038295d9ea8849dc50a9d77dfcbed6c14397f0d54fadb035f768841415a3bd');
assert.equal(manifest.sourceTree.files, 10205);
assert.equal(manifest.sourceTree.sha256, 'e524acda7d3331567fa7db85ed5057ec571a1d73b5811f2ea46f5bdc8d8572f6');

const outcome = await acquireUpstream({ verifyOnly: true });
assert.equal(outcome.verified, true);
assert.equal(outcome.downloaded, false);
const root = path.resolve(outcome.source);
const expectedRoot = path.resolve(upstream, '.cache', 'upstream', manifest.commit);
assert.equal(root, expectedRoot);
const tree = await hashSourceTree(root);
assert.equal(tree.files, 10205);
assert.equal(tree.sha256, manifest.sourceTree.sha256);

const dir = path.join(root, 'snapshots', 'web', 'present', 'workspace.expected');
const canonical = path.join(dir, '说明.txt');
const incorrectlyDecoded = path.join(dir, 'F»¦µÿÄ.txt');
const data = await fs.readFile(canonical);
const gitBlobSha1 = createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
const fileSha256 = createHash('sha256').update(data).digest('hex');
assert.equal(data.length, 15);
assert.equal(gitBlobSha1, 'e0f8e3262354fe6d5b5fa046c8c180b58653870b');
await assert.rejects(fs.stat(incorrectlyDecoded), { code: 'ENOENT' });

const receipt = {
  schema: 'yutang.windows-upstream-pinned-tree.v1',
  status: 'PASS_WINDOWS_EXACT_PINNED_SOURCE_TREE_NOT_EXE',
  os: process.env.ImageOS || 'Windows',
  osVersion: process.env.ImageVersion || null,
  experimentHead: process.env.GITHUB_SHA || null,
  pinnedUpstreamProductCommit: '9c49833078f4b4d18b9211ef86d024e7f2e15739',
  pinnedHarnessCommit: manifest.commit,
  archiveSha256: manifest.archive.sha256,
  sourceTree: { files: tree.files, sha256: tree.sha256 },
  canonicalFile: { path: 'snapshots/web/present/workspace.expected/说明.txt', length: data.length, gitBlobSha1, sha256: fileSha256 },
  originalFileBytesUnmodified: true,
  shaTreeRelaxed: false,
  sourceVerificationBypassed: false,
  windowsEXEBuilt: false,
  windowsEXESmokePerformed: false,
  realModelCalled: false,
  personalPCUsed: false,
  release: false,
};
await fs.mkdir('diagnostics', { recursive: true });
await fs.writeFile('diagnostics/windows-upstream-tree-receipt.json', JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log('WINDOWS_PINNED_SOURCE_TREE_ACCEPTED ' + JSON.stringify(receipt));
