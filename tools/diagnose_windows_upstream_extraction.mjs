import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

if (process.platform !== 'win32') throw new Error('This diagnostic must run on Windows.');
const desktop = path.resolve('upstream', 'desktop');
const manifest = JSON.parse(await fs.readFile(path.join(desktop, 'UPSTREAM.json'), 'utf8'));
const acquireModule = path.join(desktop, 'scripts', 'acquire-upstream.mjs');
const { hashSourceTree } = await import(pathToFileURL(acquireModule).href);

function run(executable, args) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error('Cannot start ' + executable + ': ' + result.error.message);
  if (result.status !== 0) {
    throw new Error(executable + ' exited ' + result.status + ': ' + String(result.stderr || '').slice(-3000));
  }
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function materializeLinks(root) {
  for (const link of manifest.materializedSymlinks) {
    const destination = path.resolve(root, link.path);
    const target = path.resolve(path.dirname(destination), link.target);
    if (!inside(root, destination) || !inside(root, target)) {
      throw new Error('A materialized link escapes the extraction root.');
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(target, destination, { recursive: true, errorOnExist: true, force: false });
  }
}

async function collectRows(root) {
  const rows = [];
  async function visit(directory, relative = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error('An unmaterialized symlink remains: ' + name);
      if (entry.isDirectory()) await visit(filename, name);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(filename);
        rows.push([name, bytes.length, createHash('sha256').update(bytes).digest('hex')]);
      } else throw new Error('Unsupported filesystem entry: ' + name);
    }
  }
  await visit(root);
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return rows;
}

function compareRows(leftRows, rightRows) {
  const left = new Map(leftRows.map(row => [row[0], row[1] + ':' + row[2]]));
  const right = new Map(rightRows.map(row => [row[0], row[1] + ':' + row[2]]));
  const missing = [];
  const extra = [];
  const changed = [];
  for (const [name, value] of left) {
    if (!right.has(name)) missing.push(name);
    else if (right.get(name) !== value) changed.push(name);
  }
  for (const name of right.keys()) if (!left.has(name)) extra.push(name);
  return {
    missingFromRightCount: missing.length,
    extraInRightCount: extra.length,
    changedContentCount: changed.length,
    missingFromRight: missing.slice(0, 40),
    extraInRight: extra.slice(0, 40),
    changedContent: changed.slice(0, 40),
  };
}

const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const systemTar = path.join(systemRoot, 'System32', 'tar.exe');
const curl = path.join(systemRoot, 'System32', 'curl.exe');
const gitTarCandidates = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'tar.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'usr', 'bin', 'tar.exe'),
];
try {
  const gitPaths = run('where.exe', ['git.exe']).stdout.split(/\r?\n/u).filter(Boolean);
  for (const gitPath of gitPaths) {
    gitTarCandidates.push(path.resolve(path.dirname(gitPath), '..', 'usr', 'bin', 'tar.exe'));
  }
} catch {}
let gitTar = null;
for (const candidate of gitTarCandidates) {
  try { await fs.access(candidate); gitTar = candidate; break; } catch {}
}
await fs.access(systemTar);
await fs.access(curl);

if (manifest.archive.url !== 'https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/' + manifest.commit) {
  throw new Error('Archive URL does not match the pinned repository and commit.');
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-upstream-extract-diagnostic-'));
const archive = path.join(tempRoot, 'pinned-source.tar.gz');
const expectedChinesePath = 'snapshots/web/present/workspace.expected/说明.txt';
const results = [];
const rowSets = new Map();

try {
  run(curl, [
    '--disable', '--fail', '--silent', '--show-error', '--location',
    '--max-redirs', '3', '--proto', '=https', '--proto-redir', '=https',
    '--connect-timeout', '20', '--max-time', '180',
    '--max-filesize', String(100 * 1024 * 1024),
    '--output', archive, manifest.archive.url,
  ]);
  const archiveStat = await fs.stat(archive);
  const archiveHash = await sha256(archive);
  if (archiveStat.size !== manifest.archive.bytes || archiveHash !== manifest.archive.sha256) {
    throw new Error('Pinned source archive size or SHA-256 mismatch.');
  }

  const prefix = manifest.archive.rootDirectory + '/';
  const entries = run(systemTar, ['-tzf', archive]).stdout.split(/\r?\n/u).filter(Boolean);
  if (entries.length !== manifest.archive.entries) throw new Error('Pinned archive entry count mismatch.');
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || entry.includes('\\') || entry.includes(':') ||
        entry.slice(prefix.length).split('/').some(part => part === '..' || part === '.')) {
      throw new Error('Unsafe or unexpected archive path: ' + entry);
    }
  }
  const allowedLinks = new Map(manifest.materializedSymlinks.map(link => [link.path, link.target]));
  const verbose = run(systemTar, ['-tvzf', archive]).stdout.split(/\r?\n/u).filter(Boolean);
  let linkCount = 0;
  for (const row of verbose) {
    if (row.startsWith('-') || row.startsWith('d')) continue;
    const marker = ' ' + prefix;
    const position = row.indexOf(marker);
    const link = position < 0 ? [] : row.slice(position + marker.length).split(' -> ');
    if (!row.startsWith('l') || link.length !== 2 || allowedLinks.get(link[0]) !== link[1]) {
      throw new Error('Archive contains an unknown link or special entry.');
    }
    linkCount += 1;
  }
  if (linkCount !== allowedLinks.size) throw new Error('Archive symlink manifest count mismatch.');

  const methods = [
    { name: 'windows-system-bsdtar-default', executable: systemTar, prefixArgs: [] },
    { name: 'windows-system-bsdtar-explicit-utf8', executable: systemTar, prefixArgs: ['--options', 'hdrcharset=UTF-8'] },
  ];
  if (gitTar) methods.push({ name: 'git-for-windows-tar', executable: gitTar, prefixArgs: [] });
  else results.push({ name: 'git-for-windows-tar', status: 'UNAVAILABLE' });

  for (const method of methods) {
    const root = path.join(tempRoot, method.name);
    try {
      await fs.mkdir(root, { recursive: true });
      const excludes = manifest.materializedSymlinks.map(link => '--exclude=' + prefix + link.path);
      run(method.executable, [
        ...method.prefixArgs, '-xzf', archive, '--strip-components=1', '-C', root, ...excludes,
      ]);
      await materializeLinks(root);
      const rows = await collectRows(root);
      const actual = await hashSourceTree(root);
      const computedHash = createHash('sha256').update(rows.map(row => JSON.stringify(row) + '\n').join('')).digest('hex');
      if (actual.files !== rows.length || actual.sha256 !== computedHash) {
        throw new Error('Independent row digest disagrees with the product tree hash function.');
      }
      rowSets.set(method.name, rows);
      results.push({
        name: method.name,
        status: 'EXTRACTED',
        tarVersion: run(method.executable, ['--version']).stdout.trim().split(/\r?\n/u)[0],
        files: actual.files,
        sha256: actual.sha256,
        matchesPinnedTree: actual.files === manifest.sourceTree.files && actual.sha256 === manifest.sourceTree.sha256,
        exactChinesePathPresent: rows.some(row => row[0] === expectedChinesePath),
        nonAsciiPaths: rows.map(row => row[0]).filter(name => /[^\x00-\x7f]/u.test(name)).slice(0, 20),
      });
    } catch (error) {
      results.push({ name: method.name, status: 'ERROR', error: String(error.message || error).slice(0, 3000) });
    }
  }

  const names = [...rowSets.keys()];
  const comparisons = [];
  for (let i = 1; i < names.length; i += 1) {
    comparisons.push({
      left: names[0],
      right: names[i],
      diff: compareRows(rowSets.get(names[0]), rowSets.get(names[i])),
    });
  }
  const matchFound = results.some(result => result.matchesPinnedTree === true);
  const output = {
    schema: 'yutang.windows-upstream-extraction-diagnostic.v1',
    status: 'DIAGNOSTIC_COMPLETE_NOT_BUILD_OR_EXE_ACCEPTANCE',
    os: process.env.ImageOS || null,
    osVersion: process.env.ImageVersion || null,
    pinnedCommit: manifest.commit,
    archive: { bytes: archiveStat.size, sha256: archiveHash, expectedSha256: manifest.archive.sha256 },
    expectedTree: manifest.sourceTree,
    expectedChinesePath,
    matchFound,
    results,
    comparisons,
    boundaries: {
      upstreamCodeExecuted: false,
      modelApiCalled: false,
      windowsExeBuilt: false,
      userPcUsed: false,
      release: false,
    },
  };
  await fs.mkdir('diagnostics', { recursive: true });
  await fs.writeFile('diagnostics/windows-upstream-extraction.json', JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(output, null, 2));
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
