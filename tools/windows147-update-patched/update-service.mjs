import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createPublicKey, verify as verifySignature, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const UPDATE_REPOSITORY = 'yud78785/yutang-build';
export const UPDATE_MANIFEST_PUBLIC_KEY = '';
export const UPDATE_PUBLISHER_THUMBPRINT = '';
export const UPDATE_MANIFEST_NAME = 'yutang-update-manifest.json';
export const UPDATE_SIGNATURE_NAME = 'yutang-update-manifest.sig';
const API = 'https://api.github.com/repos/' + UPDATE_REPOSITORY + '/releases/latest';
const MAX_EXE_BYTES = 500 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 4096;

export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  if (!match || match.slice(1).some(item => !Number.isSafeInteger(Number(item)))) return null;
  return match.slice(1).map(Number);
}

function parseAppVersion(value) {
  if (typeof value !== 'string') return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match || match[0] !== value || match.slice(1, 4).some(item => !Number.isSafeInteger(Number(item))) ||
      match[4]?.split('.').some(item => /^\d+$/.test(item) && item.length > 1 && item.startsWith('0'))) return null;
  return { parts: match.slice(1, 4).map(Number), prerelease: match[4] || null };
}

export function newerVersion(next, current) {
  const a = parseVersion(next), b = parseAppVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b.parts[i]) return a[i] > b.parts[i];
  }
  return b.prerelease !== null;
}

function normalizedThumbprint(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

export function githubAsset(value, tag, name) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').map(decodeURIComponent);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname === 'github.com' &&
      !url.port && !url.search && !url.hash && parts.length === 7 &&
      parts[1] === 'yud78785' && parts[2] === 'yutang-build' &&
      parts[3] === 'releases' && parts[4] === 'download' &&
      parts[5] === tag && parts[6] === name;
  } catch {
    return false;
  }
}

export async function readBounded(response, limit, label) {
  if (!response?.ok || !response.body) throw new Error(label + '_DOWNLOAD_FAILED');
  const chunks = [];
  let length = 0;
  for await (const value of response.body) {
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > limit) throw new Error(label + '_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

export function verifySignedManifest(bytes, signatureText, publicKey = UPDATE_MANIFEST_PUBLIC_KEY) {
  if (!publicKey) throw new Error('UPDATE_MANIFEST_PUBLIC_KEY_NOT_CONFIGURED');
  const encoded = Buffer.from(String(signatureText || '').trim(), 'base64');
  if (encoded.length !== 64) throw new Error('UPDATE_MANIFEST_SIGNATURE_FORMAT_INVALID');
  let key;
  try {
    key = createPublicKey(publicKey);
  } catch {
    throw new Error('UPDATE_MANIFEST_PUBLIC_KEY_INVALID');
  }
  if (!verifySignature(null, Buffer.from(bytes), key, encoded)) throw new Error('UPDATE_MANIFEST_SIGNATURE_INVALID');
  return true;
}

export function validateManifest(manifest, { tag, publisherThumbprint, repository = UPDATE_REPOSITORY } = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('UPDATE_MANIFEST_INVALID');
  if (manifest.schema !== 'yutang.windows-update-manifest.v1' || manifest.repository !== repository ||
      manifest.tag !== tag || manifest.version !== String(tag || '').replace(/^v/, '')) throw new Error('UPDATE_MANIFEST_IDENTITY_MISMATCH');
  if (!parseVersion(manifest.version)) throw new Error('UPDATE_MANIFEST_VERSION_INVALID');
  const expectedName = 'Dafeiyu-Douyin-API-' + manifest.version + '-win-x64.exe';
  if (!manifest.asset || manifest.asset.name !== expectedName ||
      !Number.isSafeInteger(manifest.asset.size) || manifest.asset.size < 1024 || manifest.asset.size > MAX_EXE_BYTES ||
      !/^[a-f0-9]{64}$/.test(String(manifest.asset.sha256 || ''))) throw new Error('UPDATE_MANIFEST_ASSET_INVALID');
  if (!manifest.source || !/^[a-f0-9]{40}$/.test(String(manifest.source.upstreamCommit || '')) ||
      !/^[a-f0-9]{40}$/.test(String(manifest.source.yutangPatchCommit || ''))) throw new Error('UPDATE_MANIFEST_SOURCE_INVALID');
  if (!manifest.candidate || !Number.isSafeInteger(manifest.candidate.workflowRunId) || manifest.candidate.workflowRunId < 1 ||
      !Number.isSafeInteger(manifest.candidate.artifactId) || manifest.candidate.artifactId < 1) throw new Error('UPDATE_MANIFEST_CANDIDATE_INVALID');
  const expected = normalizedThumbprint(publisherThumbprint);
  const actual = normalizedThumbprint(manifest.authenticode?.thumbprint);
  if (!/^[A-F0-9]{40}$/.test(expected) || actual !== expected ||
      typeof manifest.authenticode?.subject !== 'string' || !manifest.authenticode.subject.trim()) {
    throw new Error('UPDATE_MANIFEST_PUBLISHER_MISMATCH');
  }
  return {
    schema: manifest.schema,
    repository: manifest.repository,
    tag: manifest.tag,
    version: manifest.version,
    asset: { name: manifest.asset.name, size: manifest.asset.size, sha256: manifest.asset.sha256 },
    source: { upstreamCommit: manifest.source.upstreamCommit, yutangPatchCommit: manifest.source.yutangPatchCommit },
    candidate: { workflowRunId: manifest.candidate.workflowRunId, artifactId: manifest.candidate.artifactId },
    authenticode: { thumbprint: actual, subject: manifest.authenticode.subject.trim() }
  };
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
    "[pscustomobject]@{status=[string]$s.Status; thumbprint=[string]$s.SignerCertificate.Thumbprint; subject=[string]$s.SignerCertificate.Subject} | ConvertTo-Json -Compress";
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
  return { status: result.status, thumbprint: normalizedThumbprint(result.thumbprint), subject: String(result.subject || '') };
}

export class UpdateService {
  constructor({
    version,
    directory,
    fetchImpl = fetch,
    manifestPublicKey = UPDATE_MANIFEST_PUBLIC_KEY,
    publisherThumbprint = UPDATE_PUBLISHER_THUMBPRINT,
    verifyAuthenticode = verifyAuthenticodeSignature
  } = {}) {
    if (!parseAppVersion(version) || !path.isAbsolute(directory)) throw new Error('更新版本或下载目录无效。');
    Object.assign(this, { version, directory: path.resolve(directory), fetchImpl, manifestPublicKey, publisherThumbprint, verifyAuthenticode });
    this.last = { currentVersion: version, status: 'unchecked' };
  }

  state() {
    const { executable, ...safe } = this.last;
    return { ...safe, repository: UPDATE_REPOSITORY };
  }

  check() {
    if (this.checking) return this.checking;
    this.checking = this.performCheck().catch(() => {
      this.last = { currentVersion: this.version, status: 'error', message: '更新检查失败或发布信任核验未通过；没有运行任何下载文件。' };
      return this.state();
    }).finally(() => { this.checking = null; });
    return this.checking;
  }

  async response(value) {
    let current = value;
    for (let attempt = 0; attempt < 6; attempt++) {
      const parsed = new URL(current);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
          !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)) {
        throw new Error('更新下载地址未通过核对');
      }
      const response = await this.fetchImpl(current, {
        headers: { 'user-agent': 'YuTang-Verified-Updater' },
        redirect: 'manual',
        signal: AbortSignal.timeout(120000)
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('更新跳转地址缺失');
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) throw new Error('更新下载未完成');
      return response;
    }
    throw new Error('更新跳转过多');
  }

  async loadVerifiedReleaseManifest(candidate) {
    const bytes = await readBounded(await this.response(candidate.manifestUrl), MAX_MANIFEST_BYTES, 'UPDATE_MANIFEST');
    const signatureBytes = await readBounded(await this.response(candidate.signatureUrl), MAX_SIGNATURE_BYTES, 'UPDATE_SIGNATURE');
    const signatureText = signatureBytes.toString('utf8').trim();
    verifySignedManifest(bytes, signatureText, this.manifestPublicKey);
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('UPDATE_MANIFEST_JSON_INVALID'); }
    const manifest = validateManifest(parsed, {
      tag: candidate.tag,
      publisherThumbprint: this.publisherThumbprint
    });
    return { bytes, manifest, digest: createHash('sha256').update(bytes).digest('hex') };
  }

  async performCheck() {
    if (!this.manifestPublicKey || !/^[A-Fa-f0-9]{40}$/.test(normalizedThumbprint(this.publisherThumbprint))) {
      this.last = {
        currentVersion: this.version,
        status: 'untrusted-release-channel',
        message: 'YuTang 正式更新信任链尚未配置；为避免安装未验证版本，自动更新已安全关闭。'
      };
      return this.state();
    }
    const response = await this.fetchImpl(API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'YuTang-Verified-Updater' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 404) {
      this.last = { currentVersion: this.version, status: 'unpublished', message: 'YuTang 尚未发布可验证的正式更新。' };
      return this.state();
    }
    if (!response.ok) throw new Error('更新接口不可用');
    const release = await response.json();
    if (release.draft || release.prerelease || !parseVersion(release.tag_name)) throw new Error('没有稳定的 YuTang 软件版本');
    const version = release.tag_name.replace(/^v/, '');
    if (!newerVersion(version, this.version)) {
      this.last = { currentVersion: this.version, latestVersion: version, status: 'current', message: '当前已是本机所需的最新 YuTang 安全版本。' };
      return this.state();
    }
    const name = 'Dafeiyu-Douyin-API-' + version + '-win-x64.exe';
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAsset = assets.find(item => item.name === UPDATE_MANIFEST_NAME);
    const signatureAsset = assets.find(item => item.name === UPDATE_SIGNATURE_NAME);
    const executableAsset = assets.find(item => item.name === name);
    if (!manifestAsset || !signatureAsset || !executableAsset ||
        !githubAsset(manifestAsset.browser_download_url, release.tag_name, UPDATE_MANIFEST_NAME) ||
        !githubAsset(signatureAsset.browser_download_url, release.tag_name, UPDATE_SIGNATURE_NAME) ||
        !githubAsset(executableAsset.browser_download_url, release.tag_name, name) ||
        !Number.isSafeInteger(executableAsset.size) || executableAsset.size < 1024 || executableAsset.size > MAX_EXE_BYTES) {
      throw new Error('YuTang 发布包或签名清单不完整');
    }
    const candidate = {
      tag: release.tag_name,
      version,
      name,
      manifestUrl: manifestAsset.browser_download_url,
      signatureUrl: signatureAsset.browser_download_url,
      executableUrl: executableAsset.browser_download_url,
      releaseAssetSize: executableAsset.size
    };
    const verified = await this.loadVerifiedReleaseManifest(candidate);
    if (verified.manifest.asset.name !== name || verified.manifest.asset.size !== executableAsset.size) {
      throw new Error('YuTang 清单与 Release 资产信息不一致');
    }
    this.candidate = { ...candidate, manifestDigest: verified.digest, manifest: verified.manifest };
    this.last = {
      currentVersion: this.version,
      latestVersion: version,
      status: 'available',
      name,
      bytes: verified.manifest.asset.size,
      sha256: verified.manifest.asset.sha256,
      publisherThumbprint: verified.manifest.authenticode.thumbprint,
      sourceCommit: verified.manifest.source.yutangPatchCommit,
      message: '发现已签名的 YuTang 更新；发布者身份与补丁来源均已核对。'
    };
    return this.state();
  }

  download() {
    if (this.downloading) return this.downloading;
    this.downloading = this.performDownload().catch(() => {
      this.last = { ...this.last, status: 'error', message: '更新下载、清单签名、Authenticode 或 SHA256 核验失败；未运行文件。' };
      return this.state();
    }).finally(() => { this.downloading = null; });
    return this.downloading;
  }

  async performDownload() {
    if (!this.candidate || !['available', 'downloaded'].includes(this.last.status)) throw new Error('请先检查 YuTang 更新');
    const candidate = { ...this.candidate };
    const verified = await this.loadVerifiedReleaseManifest(candidate);
    if (verified.digest !== candidate.manifestDigest ||
        verified.manifest.asset.sha256 !== candidate.manifest.asset.sha256 ||
        verified.manifest.authenticode.thumbprint !== candidate.manifest.authenticode.thumbprint) {
      throw new Error('更新清单在检查后发生变化');
    }
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = path.join(this.directory, '.download-' + randomUUID() + '.tmp');
    const target = path.join(this.directory, candidate.name);
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      const response = await this.response(candidate.executableUrl);
      const hash = createHash('sha256');
      let size = 0;
      let first = Buffer.alloc(0);
      for await (const value of response.body) {
        const chunk = Buffer.from(value);
        if (first.length < 2) first = Buffer.concat([first, chunk.subarray(0, 2 - first.length)]);
        size += chunk.length;
        if (size > verified.manifest.asset.size || size > MAX_EXE_BYTES) throw new Error('文件长度超过签名清单');
        hash.update(chunk);
        await handle.writeFile(chunk);
      }
      await handle.close();
      handle = null;
      const digest = hash.digest('hex');
      if (size !== verified.manifest.asset.size || first.toString('ascii') !== 'MZ' || digest !== verified.manifest.asset.sha256) {
        throw new Error('下载文件与签名清单不一致');
      }
      await this.verifyAuthenticode(temporary, verified.manifest.authenticode.thumbprint);
      await fs.rename(temporary, target);
      this.last = {
        ...this.last,
        status: 'downloaded',
        executable: target,
        sha256: digest,
        version: verified.manifest.version,
        publisherThumbprint: verified.manifest.authenticode.thumbprint,
        message: 'YuTang 发布者签名、补丁来源和 SHA256 均已核对，可以进行健康确认升级。'
      };
      return this.state();
    } finally {
      await handle?.close();
      await fs.rm(temporary, { force: true });
    }
  }

  async verifiedExecutable() {
    if (this.last.status !== 'downloaded' || !this.last.executable) throw new Error('请先完成已验证的 YuTang 更新下载');
    const file = path.resolve(this.last.executable);
    if (path.dirname(file) !== this.directory || path.basename(file) !== this.candidate?.name) throw new Error('下载文件路径不在受控更新目录');
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('更新文件不是普通文件');
    const digest = createHash('sha256').update(await fs.readFile(file)).digest('hex');
    if (digest !== this.last.sha256) throw new Error('下载文件已改变，请重新检查更新');
    await this.verifyAuthenticode(file, this.last.publisherThumbprint);
    return {
      file,
      sha256: this.last.sha256,
      publisherThumbprint: this.last.publisherThumbprint,
      version: this.last.version
    };
  }
}
