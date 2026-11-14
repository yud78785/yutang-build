import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, createPublicKey, createHash, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectWindowsAuthenticode, makeManifest, prepareSignedManifest } from '../tools/windows147-release-manifest-kit.mjs';

const THUMB='A'.repeat(40),SIGNATURE_PRESENT={status:'Valid',thumbprint:THUMB,subject:'CN=Local Test Publisher',codeSigningEku:true,timestampCertificatePresent:true,signatureType:'Authenticode',signtoolEmbeddedVerified:true};
const cfg={tag:'v1.4.8',upstreamCommit:'a'.repeat(40),yutangPatchCommit:'b'.repeat(40),workflowRunId:43541915930,artifactId:14092434238,expectedThumbprint:THUMB};
const short={...cfg,exeFileName:'Dafeiyu-Douyin-API-1.4.8-win-x64.exe',signedExeSize:2048,signedExeSha256:'c'.repeat(64),certEvidence:SIGNATURE_PRESENT};
const summarySha=x=>createHash('sha256').update(x).digest('hex');
async function env(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yutang-signing-offline-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const exe=path.join(dir,short.exeFileName),key=path.join(dir,'outside-project-test-only-private.pem');
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 await fs.writeFile(exe,Buffer.concat([Buffer.from('MZ'),Buffer.alloc(2046,23)]),{flag:'wx'});
 await fs.writeFile(key,privateKey.export({format:'pem',type:'pkcs8'}),{flag:'wx',mode:0o600});
 await fs.chmod(key,0o600);
 return {dir,exe,key,publicKey,output:path.join(dir,'release-evidence'),input:{config:cfg,signedExe:exe,privateKeyFile:key,outputDir:path.join(dir,'release-evidence')}};
}
const fixture=()=>({...short,certEvidence:{...SIGNATURE_PRESENT}});

test('manifest uses the exact updater v1 schema, source commits and signer identity',()=>{
 const m=makeManifest(fixture());
 assert.equal(m.schema,'yutang.windows-update-manifest.v1');
 assert.equal(m.repository,'yud78785/yutang-build');
 assert.equal(m.version,'1.4.8');
 assert.equal(m.tag,'v1.4.8');
 assert.deepEqual(m.asset,{name:short.exeFileName,size:2048,sha256:'c'.repeat(64)});
 assert.deepEqual(m.source,{upstreamCommit:'a'.repeat(40),yutangPatchCommit:'b'.repeat(40)});
 assert.deepEqual(m.candidate,{workflowRunId:43541915930,artifactId:14092434238});
 assert.deepEqual(m.authenticode,{thumbprint:THUMB,subject:'CN=Local Test Publisher'});
});
test('manifest cannot use unsigned already-accepted EXE SHA as signed identity',()=>{
 assert.throws(()=>makeManifest({...fixture(),signedExeSha256:'3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34'}),/SIGNED_EXE_NOT_VERIFIED/);
});
test('version, tag, EXE name, file length and digest mismatch fail closed',()=>{
 for(const tag of ['1.4.8','v1.04.8','v1.4.8-beta','v1.4','v01.4.8','v1.4.8\n'])
   assert.throws(()=>makeManifest({...fixture(),tag}),/RELEASE_TAG_INVALID/);
 assert.throws(()=>makeManifest({...fixture(),exeFileName:'another.exe'}),/SIGNED_EXE_NAME_INVALID/);
 assert.throws(()=>makeManifest({...fixture(),signedExeSize:1}),/SIGNED_EXE_NOT_VERIFIED/);
 assert.throws(()=>makeManifest({...fixture(),signedExeSha256:'not-hash'}),/SIGNED_EXE_NOT_VERIFIED/);
});
test('source identity and candidate numeric provenance must be complete',()=>{
 for(const patch of [{upstreamCommit:'ab'},{yutangPatchCommit:'c'.repeat(39)},{workflowRunId:0},{artifactId:-1},{artifactId:1.5}])
   assert.throws(()=>makeManifest({...fixture(),...patch}),/RELEASE_SOURCE_COMMIT_INVALID|RELEASE_PROVENANCE_INVALID/);
});
test('refuses missing, invalid, mismatched or untimestamped Authenticode evidence',()=>{
 const invalid=[null,{...SIGNATURE_PRESENT,status:'NotSigned'}, {...SIGNATURE_PRESENT,thumbprint:'B'.repeat(40)},
 {...SIGNATURE_PRESENT,subject:' '},{...SIGNATURE_PRESENT,codeSigningEku:false},{...SIGNATURE_PRESENT,timestampCertificatePresent:false},
 {...SIGNATURE_PRESENT,signatureType:'Catalog'},{...SIGNATURE_PRESENT,signatureType:'None'},{...SIGNATURE_PRESENT,signtoolEmbeddedVerified:false}];
 for(const certEvidence of invalid)assert.throws(()=>makeManifest({...fixture(),certEvidence}),/RELEASE_AUTHENTICODE_NOT_VERIFIED/);
});
test('non-Windows platform cannot claim real Authenticode acceptance',()=>{
 assert.throws(()=>inspectWindowsAuthenticode('C:\\bad.exe',{platform:'linux'}),/WINDOWS_AUTHENTICODE_REQUIRED/);
});
test('Windows native preflight requires SDK SignTool by absolute path',()=>{
 const exe=path.resolve(os.tmpdir(),'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
 assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath:undefined}),/SIGNTOOL_ABSOLUTE_PATH_REQUIRED/);
 assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath:'signtool.exe'}),/SIGNTOOL_ABSOLUTE_PATH_REQUIRED/);
 assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath:path.resolve(os.tmpdir(),'not-signtool.exe')}),/SIGNTOOL_ABSOLUTE_PATH_REQUIRED/);
});
test('Windows embedded signer is verified independently by SignTool /pa /tw',()=>{
 const exe=path.resolve(os.tmpdir(),'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
 const signToolPath=path.resolve(os.tmpdir(),'signtool.exe');
 const psEvidence={...SIGNATURE_PRESENT};delete psEvidence.signtoolEmbeddedVerified;
 let invoked=0;
 const got=inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath,exec:(name,args,options)=>{
  invoked++;
  if(name==='powershell.exe') {
   assert.equal(options.env.YUTANG_SIGNED_EXE,exe);
   assert.match(args.join(' '),/Get-AuthenticodeSignature/);
   assert.match(args.join(' '),/SignatureType/);
   assert.match(args.join(' '),/TimeStamperCertificate/);
   assert.match(args.join(' '),/1\.3\.6\.1\.5\.5\.7\.3\.3/);
   return JSON.stringify(psEvidence);
  }
  assert.equal(name,signToolPath);
  assert.deepEqual(args,['verify','/pa','/tw',exe]);
  assert.ok(!args.includes('/a') && !args.includes('/c'));
  assert.ok(!('YUTANG_SIGNED_EXE' in options));
  return 'Successfully verified';
 }});
 assert.equal(invoked,2);
 assert.equal(got.signatureType,'Authenticode');
 assert.equal(got.signtoolEmbeddedVerified,true);
});
test('Windows signature inspector refuses a valid catalog without launching SignTool',()=>{
 const exe=path.resolve(os.tmpdir(),'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
 let count=0;
 assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath:path.resolve(os.tmpdir(),'signtool.exe'),exec:(name)=>{
  count++;
  assert.equal(name,'powershell.exe');
  return JSON.stringify({...SIGNATURE_PRESENT,signatureType:'Catalog'});
 }}),/WINDOWS_EMBEDDED_SIGNATURE_REQUIRED/);
 assert.equal(count,1);
});
test('Windows native inspection fails closed on SignTool warnings or errors without leaking them',()=>{
 const exe=path.resolve(os.tmpdir(),'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
 for(const status of [1,2]){
  const psEvidence={...SIGNATURE_PRESENT};delete psEvidence.signtoolEmbeddedVerified;
  let calls=0;
  assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath:path.resolve(os.tmpdir(),'signtool.exe'),exec:(name)=>{
   calls++;
   if(name==='powershell.exe')return JSON.stringify(psEvidence);
   const error=new Error('D:\secret\customer path with user data');
   error.status=status;throw error;
  }}),/^Error: WINDOWS_EMBEDDED_SIGNTOOL_VERIFY_FAILED$/);
  assert.equal(calls,2);
 }
});
test('Windows signature query refuses malformed JSON and redacts errors',()=>{
 const exe=path.resolve(os.tmpdir(),'Dafeiyu-Douyin-API-1.4.8-win-x64.exe');
 const signToolPath=path.resolve(os.tmpdir(),'signtool.exe');
 assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath,exec:()=>{throw Error('private secret')}}),/WINDOWS_AUTHENTICODE_QUERY_FAILED/);
 assert.throws(()=>inspectWindowsAuthenticode(exe,{platform:'win32',signToolPath,exec:()=>'{bad'}),/WINDOWS_AUTHENTICODE_RESPONSE_INVALID/);
});
test('real entry point refuses Linux rather than manufacturing fake release trust',()=>{
 const file=fileURLToPath(new URL('../tools/windows147-release-manifest-kit.mjs',import.meta.url));
 let output='';
 try{execFileSync(process.execPath,[file],{encoding:'utf8',timeout:10000})}
 catch(e){assert.equal(e.status,1);output=String(e.stderr)}
 assert.match(output,/YUTANG_MANIFEST_REFUSED WINDOWS_AUTHENTICODE_REQUIRED/);
});
test('offline fixture creates verifiable exact-byte Ed25519 manifest, signature and public key',async t=>{
 const f=await env(t);
 const receipt=await prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT});
 assert.equal(receipt.status,'SOURCE_ONLY_MANIFEST_PREPARED_NOT_RELEASED');
 assert.equal(receipt.exeSha256,summarySha(await fs.readFile(f.exe)));
 assert.equal(receipt.exeSize,2048);
 const bytes=await fs.readFile(path.join(f.output,'yutang-update-manifest.json'));
 const sigText=await fs.readFile(path.join(f.output,'yutang-update-manifest.sig'),'utf8');
 const pem=await fs.readFile(path.join(f.output,'yutang-update-manifest.public.pem'),'utf8');
 assert.equal(receipt.manifestSha256,summarySha(bytes));
 assert.equal(sigText.trim().length>80,true);
 assert.equal(verify(null,bytes,createPublicKey(pem),Buffer.from(sigText.trim(),'base64')),true);
 assert.equal(verify(null,Buffer.concat([bytes,Buffer.from('\n')]),createPublicKey(pem),Buffer.from(sigText.trim(),'base64')),false);
 assert.equal(JSON.parse(bytes).authenticode.thumbprint,THUMB);
 assert.ok(!('privateKey' in receipt));
});
test('valid signature does not validate a tampered manifest or wrong public key',async t=>{
 const f=await env(t);await prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT});
 const raw=await fs.readFile(path.join(f.output,'yutang-update-manifest.json'));
 const sig=Buffer.from((await fs.readFile(path.join(f.output,'yutang-update-manifest.sig'),'utf8')).trim(),'base64');
 const wrong=generateKeyPairSync('ed25519').publicKey;
 assert.equal(verify(null,raw,wrong,sig),false);
 const edit=Buffer.from(raw);edit[10]^=1;
 assert.equal(verify(null,edit,f.publicKey,sig),false);
});
test('real signing evidence mismatch blocks all file outputs',async t=>{
 const f=await env(t);
 await assert.rejects(prepareSignedManifest(f.input,{verifyAuthenticode:()=>({...SIGNATURE_PRESENT,status:'NotSigned'})}),/RELEASE_AUTHENTICODE_NOT_VERIFIED/);
 await assert.rejects(fs.lstat(f.output),{code:'ENOENT'});
});
test('signature manifest creation must not overwrite a previous release',async t=>{
 const f=await env(t);await prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT});
 const before=await fs.readFile(path.join(f.output,'yutang-update-manifest.json'));
 await assert.rejects(prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT}),/MANIFEST_OUTPUT_ALREADY_EXISTS/);
 assert.deepEqual(await fs.readFile(path.join(f.output,'yutang-update-manifest.json')),before);
});
test('private signing key must be Ed25519, external to project and non-world-readable',async t=>{
 const f=await env(t);
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 await fs.writeFile(f.key,privateKey.export({format:'pem',type:'pkcs8'}));
 await assert.rejects(prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT}),/MANIFEST_KEY_INVALID/);
 const {privateKey:ed}=generateKeyPairSync('ed25519');
 await fs.writeFile(f.key,ed.export({format:'pem',type:'pkcs8'}));
 if(process.platform!=='win32'){
  await fs.chmod(f.key,0o644);
  await assert.rejects(prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT}),/MANIFEST_KEY_PERMISSIONS_UNSAFE/);
 }
});
test('cannot import symlinked key or signed exe for release manifest',async t=>{
 const f=await env(t);
 const link=path.join(f.dir,'linked-key.pem');await fs.symlink(f.key,link);
 await assert.rejects(prepareSignedManifest({...f.input,privateKeyFile:link},{verifyAuthenticode:()=>SIGNATURE_PRESENT}),/MANIFEST_KEY_FILE_NOT_REGULAR/);
 const xlink=path.join(f.dir,short.exeFileName+'-link');await fs.symlink(f.exe,xlink);
 await assert.rejects(prepareSignedManifest({...f.input,signedExe:xlink},{verifyAuthenticode:()=>SIGNATURE_PRESENT}),/SIGNED_EXE_FILE_INVALID/);
});
test('no output is produced when output parent missing, and no unsigned/base EXE modified',async t=>{
 const f=await env(t);const before=await fs.readFile(f.exe);
 await assert.rejects(prepareSignedManifest({...f.input,outputDir:path.join(f.dir,'missing','out')},{verifyAuthenticode:()=>SIGNATURE_PRESENT}),{code:'ENOENT'});
 assert.deepEqual(await fs.readFile(f.exe),before);
});

test('mutating EXE during Authenticode inspection blocks manifest and cleans no existing files',async t=>{
 const f=await env(t);
 const before=await fs.readFile(f.exe);
 const cert=async()=>{
  const modified=Buffer.from(before);modified[80]^=1;
  await fs.writeFile(f.exe,modified);
  return SIGNATURE_PRESENT;
 };
 await assert.rejects(prepareSignedManifest(f.input,{verifyAuthenticode:cert}),/SIGNED_EXE_CHANGED_DURING_AUTHENTICODE_CHECK/);
 await assert.rejects(fs.lstat(f.output),{code:'ENOENT'});
});
test('private key under tool source project is rejected',async t=>{
 const f=await env(t);
 const sourceKey=path.resolve(path.dirname(fileURLToPath(new URL('../tools/windows147-release-manifest-kit.mjs',import.meta.url))),'..','temporary-private-test-key.pem');
 const {privateKey}=generateKeyPairSync('ed25519');
 await fs.writeFile(sourceKey,privateKey.export({format:'pem',type:'pkcs8'}),{flag:'wx',mode:0o600});
 t.after(()=>fs.rm(sourceKey,{force:true}));
 await assert.rejects(prepareSignedManifest({...f.input,privateKeyFile:sourceKey},{verifyAuthenticode:()=>SIGNATURE_PRESENT}),/MANIFEST_PRIVATE_KEY_INSIDE_PROJECT/);
});


test('indirect symlink ancestor may not redirect manifest outputs into source project',async t=>{
 const f=await env(t);
 const projectRoot=path.resolve(path.dirname(fileURLToPath(new URL('../tools/windows147-release-manifest-kit.mjs',import.meta.url))),'..');
 const symlinkPath=path.join(f.dir,'project-redirect');
 try { await fs.symlink(projectRoot,symlinkPath,'dir'); }
 catch(e){ if(process.platform==='win32' && (e.code==='EPERM'||e.code==='EACCES')){t.skip('Windows symlink privilege absent');return;} throw e; }
 const redirected=path.join(symlinkPath,'tests','release-evidence-test-output');
 await assert.rejects(prepareSignedManifest({...f.input,outputDir:redirected},
   {verifyAuthenticode:()=>SIGNATURE_PRESENT}),/MANIFEST_OUTPUT_PARENT_INVALID/);
 await assert.rejects(fs.lstat(path.join(projectRoot,'tests','release-evidence-test-output')),{code:'ENOENT'});
});
test('legitimate output directory is still allowed outside source project',async t=>{
 const f=await env(t);
 const proof=await prepareSignedManifest(f.input,{verifyAuthenticode:()=>SIGNATURE_PRESENT});
 assert.equal(proof.status,'SOURCE_ONLY_MANIFEST_PREPARED_NOT_RELEASED');
 assert.equal((await fs.readdir(f.output)).length,3);
});
