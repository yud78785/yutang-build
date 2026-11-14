#!/usr/bin/env node
// SOURCE-ONLY preparation. No Authenticode signing, purchase, network or GitHub Release.
// Refuses real manifest creation unless Windows validates the already-signed EXE.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY = 'yud78785/yutang-build';
const UNSIGNED_ACCEPTED_SHA = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';
const MANIFEST = 'yutang-update-manifest.json';
const SIGNATURE = 'yutang-update-manifest.sig';
const PUBLIC_KEY = 'yutang-update-manifest.public.pem';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const THUMBPRINT_RE = /^[A-F0-9]{40}$/;
const CODE_SIGNING_EKU = '1.3.6.1.5.5.7.3.3';
const MAX_EXE = 500 * 1024 * 1024;

function fail(code) { throw new Error(code); }
const inside = (base, target) => { const rel = path.relative(base, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function sha256File(file) {
  const hash=createHash('sha256');
  const handle=await fs.open(file,'r');
  try { for await(const chunk of handle.createReadStream({autoClose:false})) hash.update(chunk); }
  finally { await handle.close(); }
  return hash.digest('hex');
}
const thumbprint = value => String(value || '').replace(/\s/g, '').toUpperCase();
const nameForVersion = version => `Dafeiyu-Douyin-API-${version}-win-x64.exe`;

export function makeManifest({ tag, exeFileName, signedExeSize, signedExeSha256, upstreamCommit,
  yutangPatchCommit, workflowRunId, artifactId, expectedThumbprint, certEvidence }) {
  const found = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(tag || ''));
  if (!found) fail('RELEASE_TAG_INVALID');
  const version = found.slice(1).join('.');
  if (exeFileName !== nameForVersion(version)) fail('SIGNED_EXE_NAME_INVALID');
  if (!Number.isSafeInteger(signedExeSize) || signedExeSize < 1024 || signedExeSize > MAX_EXE ||
      !SHA_RE.test(String(signedExeSha256 || '')) || signedExeSha256 === UNSIGNED_ACCEPTED_SHA) fail('SIGNED_EXE_NOT_VERIFIED');
  if (!COMMIT_RE.test(String(upstreamCommit || '')) || !COMMIT_RE.test(String(yutangPatchCommit || ''))) fail('RELEASE_SOURCE_COMMIT_INVALID');
  if (!Number.isSafeInteger(workflowRunId) || workflowRunId <= 0 || !Number.isSafeInteger(artifactId) || artifactId <= 0) fail('RELEASE_PROVENANCE_INVALID');
  const expected = thumbprint(expectedThumbprint);
  const observed = thumbprint(certEvidence?.thumbprint);
  if (!THUMBPRINT_RE.test(expected) || certEvidence?.status !== 'Valid' || observed !== expected ||
      typeof certEvidence.subject !== 'string' || !certEvidence.subject.trim() ||
      certEvidence.codeSigningEku !== true || certEvidence.timestampCertificatePresent !== true ||
      certEvidence.signatureType !== 'Authenticode' || certEvidence.signtoolEmbeddedVerified !== true) fail('RELEASE_AUTHENTICODE_NOT_VERIFIED');
  return {
    schema: 'yutang.windows-update-manifest.v1', repository: REPOSITORY, tag, version,
    asset: { name: exeFileName, size: signedExeSize, sha256: signedExeSha256 },
    source: { upstreamCommit, yutangPatchCommit },
    candidate: { workflowRunId, artifactId },
    authenticode: { thumbprint: expected, subject: certEvidence.subject.trim() }
  };
}

export function inspectWindowsAuthenticode(exeFile, { platform = process.platform, exec = execFileSync,
  signToolPath = process.env.YUTANG_SIGNTOOL_PATH } = {}) {
  if (platform !== 'win32') fail('WINDOWS_AUTHENTICODE_REQUIRED');
  if (typeof exeFile !== 'string' || !path.isAbsolute(exeFile)) fail('SIGNED_EXE_PATH_INVALID');
  // Explicit trusted Windows SDK SignTool location supplied by the signer.
  // Missing/unverified SDK tools must not silently weaken the validation path.
  if (typeof signToolPath !== 'string' || !path.isAbsolute(signToolPath) ||
      path.basename(signToolPath).toLowerCase() !== 'signtool.exe') fail('SIGNTOOL_ABSOLUTE_PATH_REQUIRED');
  // No cert credentials; only read public Windows signature evidence.
  const script = [
    "$ErrorActionPreference='Stop'",
    '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)',
    '$s=Get-AuthenticodeSignature -LiteralPath $env:YUTANG_SIGNED_EXE',
    '$c=$s.SignerCertificate',
    '$eku=$false',
    `if($null -ne $c){foreach($e in $c.EnhancedKeyUsageList){if([string]$e.ObjectId -eq '${CODE_SIGNING_EKU}'){$eku=$true}}}`,
    '[pscustomobject]@{status=[string]$s.Status;signatureType=[string]$s.SignatureType;thumbprint=[string]$c.Thumbprint;subject=[string]$c.Subject;codeSigningEku=[bool]$eku;timestampCertificatePresent=($null -ne $s.TimeStamperCertificate)} | ConvertTo-Json -Compress'
  ].join(';');
  let raw;
  try { raw = exec('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], {
    encoding:'utf8',windowsHide:true,timeout:18000,maxBuffer:64*1024,
    env:{...process.env,YUTANG_SIGNED_EXE:exeFile}
  }); } catch { fail('WINDOWS_AUTHENTICODE_QUERY_FAILED'); }
  try {
    const value = JSON.parse(String(raw).trim());
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('WINDOWS_AUTHENTICODE_RESPONSE_INVALID');
    // Get-AuthenticodeSignature can select a Windows catalog over embedded data.
    // Catalog trust is not portable with a standalone EXE.
    if(value.signatureType !== 'Authenticode') fail('WINDOWS_EMBEDDED_SIGNATURE_REQUIRED');
    if(value.status !== 'Valid' || value.codeSigningEku !== true ||
        value.timestampCertificatePresent !== true) fail('WINDOWS_AUTHENTICODE_NOT_VALID');
    try {
      // No /a, /ad or /c: SignTool verifies the EXE's embedded signature,
      // using Authenticode policy and warning on absent timestamps.
      // execFileSync throws on exit code 1 (failed) and 2 (warning).
      exec(signToolPath,['verify','/pa','/tw',exeFile],{
        encoding:'utf8',windowsHide:true,timeout:18000,maxBuffer:64*1024
      });
    } catch { fail('WINDOWS_EMBEDDED_SIGNTOOL_VERIFY_FAILED'); }
    return {...value,signtoolEmbeddedVerified:true};
  } catch(error) {
    if (/^[A-Z_]{4,80}$/.test(String(error?.message||''))) throw error;
    fail('WINDOWS_AUTHENTICODE_RESPONSE_INVALID');
  }
}

async function readSigningKey(keyFile) {
  if (typeof keyFile !== 'string' || !path.isAbsolute(keyFile)) fail('MANIFEST_KEY_PATH_INVALID');
  const real = await fs.realpath(keyFile).catch(() => fail('MANIFEST_KEY_NOT_FOUND'));
  if (inside(ROOT, real)) fail('MANIFEST_PRIVATE_KEY_INSIDE_PROJECT');
  const info = await fs.lstat(keyFile);
  if (!info.isFile() || info.isSymbolicLink()) fail('MANIFEST_KEY_FILE_NOT_REGULAR');
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) fail('MANIFEST_KEY_PERMISSIONS_UNSAFE');
  let buf = await fs.readFile(keyFile);
  try {
    const key = createPrivateKey(buf);
    if (key.asymmetricKeyType !== 'ed25519') fail('MANIFEST_KEY_MUST_BE_ED25519');
    return key;
  } catch { fail('MANIFEST_KEY_INVALID'); }
  finally { buf.fill(0); }
}

export async function prepareSignedManifest({config, signedExe, privateKeyFile, outputDir}, {
  verifyAuthenticode = inspectWindowsAuthenticode
} = {}) {
  if (typeof signedExe !== 'string' || !path.isAbsolute(signedExe) ||
      typeof outputDir !== 'string' || !path.isAbsolute(outputDir)) fail('RELEASE_PATH_INVALID');
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('RELEASE_CONFIG_INVALID');
  const stat = await fs.lstat(signedExe);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_EXE) fail('SIGNED_EXE_FILE_INVALID');
  // Bind the native Authenticode decision to the same immutable EXE bytes.
  // Hash before and after the OS signature query to detect in-place changes.
  const beforeHash=await sha256File(signedExe);
  const certEvidence = await verifyAuthenticode(signedExe);
  const signedExeSha256=await sha256File(signedExe);
  const statAfter = await fs.lstat(signedExe);
  if (stat.size !== statAfter.size || stat.mtimeMs !== statAfter.mtimeMs ||
      stat.ino !== statAfter.ino || beforeHash !== signedExeSha256) fail('SIGNED_EXE_CHANGED_DURING_AUTHENTICODE_CHECK');
  const manifest = makeManifest({...config, exeFileName:path.basename(signedExe),
    signedExeSize:stat.size,signedExeSha256,certEvidence});
  const key=await readSigningKey(privateKeyFile);
  const body=Buffer.from(JSON.stringify(manifest,null,2)+'\n','utf8');
  if (body.byteLength > 64*1024) fail('MANIFEST_TOO_LARGE');
  const signature=sign(null,body,key);
  const publicKey=createPublicKey(key);
  if(signature.length!==64 || !verify(null,body,publicKey,signature)) fail('MANIFEST_SIGNATURE_SELF_CHECK_FAILED');
  const publicPem=publicKey.export({format:'pem',type:'spki'});
  if (path.dirname(outputDir)===outputDir || inside(ROOT,outputDir) || inside(outputDir,ROOT)) fail('MANIFEST_OUTPUT_ROOT_INVALID');
  const parent=path.dirname(outputDir), parentStat=await fs.lstat(parent);
  if(!parentStat.isDirectory()||parentStat.isSymbolicLink())fail('MANIFEST_OUTPUT_PARENT_INVALID');
  // A non-symlink final parent can still be reached through a symlinked
  // ancestor. Check the canonical filesystem target before writing any file.
  const [realRoot,realParent]=await Promise.all([fs.realpath(ROOT),fs.realpath(parent)]);
  const realOutput=path.join(realParent,path.basename(outputDir));
  if(inside(realRoot,realOutput)||inside(realOutput,realRoot))
    fail('MANIFEST_OUTPUT_PARENT_INVALID');
  try { await fs.lstat(outputDir); fail('MANIFEST_OUTPUT_ALREADY_EXISTS'); }
  catch(e) { if(e?.code!=='ENOENT')throw e; }
  const temp=await fs.mkdtemp(path.join(parent,'.yutang-manifest-'));
  try {
    await fs.writeFile(path.join(temp,MANIFEST),body,{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(temp,SIGNATURE),signature.toString('base64')+'\n',{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(temp,PUBLIC_KEY),publicPem,{flag:'wx',mode:0o600});
    await fs.rename(temp,outputDir);
  } finally {
    const exists = await fs.lstat(temp).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e));
    if(exists)await fs.rm(temp,{recursive:true});
  }
  return { status:'SOURCE_ONLY_MANIFEST_PREPARED_NOT_RELEASED', exeSha256:signedExeSha256,
    exeSize:stat.size,manifestSha256:sha256(body),manifestName:MANIFEST,signatureName:SIGNATURE,
    publicKeyName:PUBLIC_KEY,outputDir };
}

async function main() {
  if (process.platform !== 'win32') fail('WINDOWS_AUTHENTICODE_REQUIRED');
  const [configPath,signedExe,privateKeyFile,outputDir,...extra]=process.argv.slice(2);
  if(extra.length || ![configPath,signedExe,privateKeyFile,outputDir].every(x=>typeof x==='string'&&path.isAbsolute(x))) fail('RELEASE_CLI_ARGS_INVALID');
  const cfgStat=await fs.lstat(configPath);
  if(!cfgStat.isFile()||cfgStat.isSymbolicLink()||cfgStat.size>8192)fail('RELEASE_CONFIG_FILE_INVALID');
  const config=JSON.parse(await fs.readFile(configPath,'utf8'));
  const summary=await prepareSignedManifest({config,signedExe,privateKeyFile,outputDir});
  // Never log raw signer certificate subject, signed file path, or private key.
  console.log('YUTANG_MANIFEST_PREPARED '+JSON.stringify({status:summary.status,exeSha256:summary.exeSha256,
    exeSize:summary.exeSize,manifestSha256:summary.manifestSha256,releaseAuthorized:false}));
}
const called=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(called)main().catch(e=>{console.error('YUTANG_MANIFEST_REFUSED '+(/^[A-Z_]{3,80}$/.test(String(e?.message||''))?e.message:'RELEASE_TOOL_ERROR')); process.exitCode=1;});
