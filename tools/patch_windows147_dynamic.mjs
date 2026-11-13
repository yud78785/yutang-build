#!/usr/bin/env node
// Dynamic companion patches applied only after the pinned OpenRouter UI/model patch.
// Verifies its receipt before changing the main-process profile root or packaged verifier.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BASE_COMMIT='9c49833078f4b4d18b9211ef86d024e7f2e15739';
const sha256=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:Buffer.from(value,'utf8')).digest('hex');
const gitBlob=value=>{const b=Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
function once(source,before,after,label){
  const i=source.indexOf(before);
  if(i<0||source.indexOf(before,i+before.length)>=0)throw new Error('DYNAMIC_PATCH_ANCHOR_MISMATCH: '+label);
  return source.slice(0,i)+after+source.slice(i+before.length);
}
export function patchDesktopMain(source){
  source=once(source,
    "app.setPath('userData', override || path.join(app.getPath('appData'), 'DafeiyuDouyinAPI'));",
    "app.setPath('userData', override || path.join(app.getPath('appData'), 'YuTangObserver-Isolated-Candidate'));",
    'isolated Electron userData');
  source=once(source,
    "const shared = await ensureSharedLocation({ resolve: pathsModule.resolveRuntimePaths });",
    "const shared = await ensureSharedLocation({ resolve: pathsModule.resolveRuntimePaths, env: {} });",
    'ignore inherited legacy runtime path overrides');
  if(source.includes("'DafeiyuDouyinAPI'"))throw new Error('Legacy Electron userData root remains');
  return source;
}
export function patchPackagedVerifier(source){
  source=once(source,
    "const userData = path.join(directory, 'user-data'), home = path.join(directory, 'home'), memory = path.join(directory, 'memory');",
    "const userData = path.join(directory, 'user-data'), home = path.join(directory, 'home'), memory = path.join(home, '.yutang-observer-isolated', 'memory');",
    'verifier uses isolated candidate memory root');
  source=once(source,
    "const locationFile = path.join(directory, 'runtime-location.json');",
    "const locationFile = path.join(home, '.yutang-observer-isolated', 'runtime-location.json');",
    'verifier location record path');
  source=once(source,
    "for (const folder of [userData, home, memory, paths.stateDir, paths.mediaRuntimeRoot, path.join(directory, 'temp')]) await fs.mkdir(folder, { recursive: true });",
    "for (const folder of [userData, home, memory, path.dirname(locationFile), paths.stateDir, paths.mediaRuntimeRoot, path.join(directory, 'temp')]) await fs.mkdir(folder, { recursive: true });",
    'verifier creates isolated location parent');
  source=once(source,
    "const manifest = JSON.parse(asar.extractFile(archive, 'app/build-manifest.json').toString());\n",
    "const manifest = JSON.parse(asar.extractFile(archive, 'app/build-manifest.json').toString());\n"+
    "const guardSource = path.join(desktop, '.cache', 'api-runtime', 'jobguard.exe');\n"+
    "const guardPackaged = path.join(resources, 'api-runtime', 'jobguard.exe');\n"+
    "assert.equal(digest(await fs.readFile(guardPackaged)), digest(await fs.readFile(guardSource)), 'packaged Job Object helper SHA-256');\n",
    'packaged Job Object helper hash');
  source=once(source,
    "  const actualRuntime = path.join(userData, 'runtimes', manifest.runtimeId.slice(0, 20));\n",
    "  const actualRuntime = path.join(userData, 'runtimes', manifest.runtimeId.slice(0, 20));\n"+
    "  assert.equal(digest(await fs.readFile(path.join(actualRuntime, 'jobguard.exe'))), digest(await fs.readFile(guardSource)), 'prepared Job Object helper SHA-256');\n",
    'prepared Job Object helper hash');
  return source;
}
export async function previewDynamicPatches(root){
  const base=path.resolve(root);
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:base,encoding:'utf8'}).trim();
  if(head!==BASE_COMMIT)throw new Error('UPSTREAM_COMMIT_MISMATCH: '+head);
  const openrouter=JSON.parse(await fs.readFile(path.join(base,'openrouter-desktop-patch-receipt.json'),'utf8'));
  if(openrouter.status!=='PATCH_APPLIED_TO_PINNED_UPSTREAM_SOURCE_ONLY'||openrouter.upstreamCommit!==BASE_COMMIT||
     openrouter.liveApiRequests!==0||openrouter.apiKeysUsed!==false||openrouter.exeBuilt!==false||openrouter.windowsTested!==false)
    throw new Error('OPENROUTER_PATCH_RECEIPT_MISMATCH');
  const manifestPath=path.join(base,'..','tools','windows147-patched','manifest.json');
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  if(manifest.upstreamCommit!==BASE_COMMIT||!Array.isArray(manifest.sources)||manifest.sources.length!==7)
    throw new Error('STATIC_PATCH_MANIFEST_MISMATCH');
  const staticFiles=[];
  for(const item of manifest.sources){
    const target=path.join(base,item.path);
    const stat=await fs.lstat(target);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('STATIC_PATCH_TARGET_NOT_REGULAR: '+item.path);
    const content=await fs.readFile(target);
    const actual=gitBlob(content);
    if(actual!==item.patchedGitBlobSha1)throw new Error('STATIC_PATCH_BLOB_MISMATCH: '+item.path);
    staticFiles.push({path:item.path,originalGitBlobSha1:item.originalGitBlobSha1,patchedGitBlobSha1:actual,sha256:sha256(content)});
  }
  const mainPath=path.join(base,'desktop/src/main.mjs');
  const verifierPath=path.join(base,'desktop/scripts/verify-packaged-api.mjs');
  const mainSource=await fs.readFile(mainPath,'utf8');
  const verifierSource=await fs.readFile(verifierPath,'utf8');
  const mainExpected=openrouter.modifiedSourceSha256?.['desktop/src/main.mjs'];
  const verifierExpected=openrouter.modifiedSourceSha256?.['desktop/scripts/verify-packaged-api.mjs'];
  if(sha256(mainSource)!==mainExpected||sha256(verifierSource)!==verifierExpected)
    throw new Error('OPENROUTER_DYNAMIC_SOURCE_SHA_MISMATCH');
  const main=patchDesktopMain(mainSource);
  const verifier=patchPackagedVerifier(verifierSource);
  return {
    base,staticFiles,
    patched:{
      'desktop/src/main.mjs':main,
      'desktop/scripts/verify-packaged-api.mjs':verifier
    },
    patchedSha256:{
      'desktop/src/main.mjs':sha256(main),
      'desktop/scripts/verify-packaged-api.mjs':sha256(verifier)
    }
  };
}
export async function applyDynamicPatches(root){
  const plan=await previewDynamicPatches(root);
  for(const [relative,content] of Object.entries(plan.patched)){
    const filename=path.join(plan.base,relative),temporary=filename+'.yutang-dynamic-'+process.pid+'.tmp';
    try{await fs.writeFile(temporary,content,{flag:'wx'});await fs.rename(temporary,filename);}
    finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
    console.log('PATCHED_147_DYNAMIC_SOURCE '+relative+' sha256='+plan.patchedSha256[relative]);
  }
  const receipt={
    schema:'yutang.windows-security-147-dynamic.v1',
    status:'PASS_EXACT_SOURCE_SECURITY_PATCH',
    upstreamCommit:BASE_COMMIT,
    staticSources:plan.staticFiles,
    dynamicPatchedSourceSha256:plan.patchedSha256,
    isolatedElectronUserData:true,
    noLegacyRuntimeEnvironmentImport:true,
    packagedJobGuardHashVerified:true,
    preparedRuntimeJobGuardHashVerified:true,
    liveModelCalled:false,
    realMessageSent:false,
    release:false
  };
  await fs.writeFile(path.join(plan.base,'windows-security-147-dynamic-patch-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('PASS_WINDOWS_SECURITY_147_DYNAMIC_PATCH '+JSON.stringify(receipt));
  return receipt;
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked){
  const root=process.argv[2];
  if(!root)throw new Error('Usage: node tools/patch_windows147_dynamic.mjs /absolute/upstream/source');
  applyDynamicPatches(root).catch(error=>{console.error('WINDOWS_SECURITY_147_DYNAMIC_PATCH_FAIL_CLOSED: '+String(error?.message||error));process.exitCode=1;});
}
