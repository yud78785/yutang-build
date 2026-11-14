import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareBootstrapTrust } from '../tools/signing/prepare-bootstrap-trust.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const template=path.join(root,'tools/windows147-update-patched/update-service.mjs');
const script=path.join(root,'tools/signing/prepare-bootstrap-trust.mjs');
let dir, pem, badPem, codeCert, otherCert, pin;
const digest = bytes=>createHash('sha256').update(bytes).digest('hex');

before(async()=>{
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'yutang-bootstrap-trust-'));
  const {publicKey}=generateKeyPairSync('ed25519');
  pem=path.join(dir,'manifest-public.pem');
  await fs.writeFile(pem,publicKey.export({type:'spki',format:'pem'}));
  const {publicKey:otherKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  badPem=path.join(dir,'wrong-algorithm-public.pem');
  await fs.writeFile(badPem,otherKey.export({type:'spki',format:'pem'}));
  async function cert(name,eku){
    const key=path.join(dir,name+'.key'),cert=path.join(dir,name+'.crt');
    const args=['req','-x509','-newkey','rsa:2048','-noenc','-keyout',key,'-out',cert,
      '-days','7','-subj','/C=RS/O=TEST ONLY/CN=MOCK SIGNER NOT RELEASE',
      '-addext','basicConstraints=CA:FALSE','-addext','keyUsage=digitalSignature',
      '-addext','extendedKeyUsage='+eku];
    const run=spawnSync('openssl',args,{encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stderr);
    await fs.unlink(key); // No RSA private cert key is retained, committed or uploaded.
    return cert;
  }
  codeCert=await cert('code-signing','codeSigning');
  otherCert=await cert('other-purpose','serverAuth');
  pin=new X509Certificate(await fs.readFile(codeCert)).fingerprint.replaceAll(':','').toUpperCase();
});
after(async()=>{if(dir)await fs.rm(dir,{recursive:true,force:true});});
async function fixture(t){
  const out=await fs.mkdtemp(path.join(dir,'test-output-'));
  t.after(()=>fs.rm(out,{recursive:true,force:true}));
  return {template,manifestPublicKey:pem,publisherCert:codeCert,
    expectedThumbprint:pin,outputDir:out,targetVersion:'1.4.8'};
}

test('creates only isolated pinned source copy with actual exported ESM trust values',async t=>{
  const args=await fixture(t);
  const old=await fs.readFile(template),oldHash=digest(old);
  const result=await prepareBootstrapTrust(args);
  assert.equal(result.status,'SOURCE_COPY_PREPARED_NOT_BUILT_NOT_SIGNED');
  assert.equal(result.releaseReady,false);
  assert.equal(result.exeBuilt,false);
  assert.equal(result.windows2022Accepted,false);
  assert.equal(result.windows2025Accepted,false);
  assert.equal(result.productVersion,'1.4.8');
  assert.equal(result.publisherThumbprint,pin);
  const source=path.join(args.outputDir,'update-service.mjs');
  const js=await fs.readFile(source,'utf8');
  assert.ok(!js.includes("UPDATE_MANIFEST_PUBLIC_KEY = '';"));
  assert.ok(!js.includes("UPDATE_PUBLISHER_THUMBPRINT = '';"));
  const imported=await import(pathToFileURL(source).href+'?unique=1');
  assert.equal(imported.UPDATE_PUBLISHER_THUMBPRINT,pin);
  assert.match(imported.UPDATE_MANIFEST_PUBLIC_KEY,/BEGIN PUBLIC KEY/);
  assert.equal((await fs.readFile(template)).equals(old),true);
  assert.equal(digest(old),oldHash);
  const receipt=JSON.parse(await fs.readFile(path.join(args.outputDir,'bootstrap-trust-preparation.json')));
  assert.equal(receipt.preparedSourceSha256,digest(await fs.readFile(source)));
});
test('refuses same and lower candidate version and invalid semver',async t=>{
  const a=await fixture(t);
  for(const v of ['1.4.7','1.4.6','1.4','v1.4.8','1.4.8-rc.1','1.4.08','1.4.8\nX']){
    await assert.rejects(prepareBootstrapTrust({...a,targetVersion:v}),/BOOTSTRAP_TARGET_VERSION_MUST_EXCEED_1_4_7/);
  }
  assert.deepEqual(await fs.readdir(a.outputDir),[]);
});
test('rejects wrong source blob even if the trust anchors are still present',async t=>{
  const a=await fixture(t);
  const wrong=path.join(dir,'tampered-template-'+Math.random()+'.mjs');
  await fs.writeFile(wrong,(await fs.readFile(template,'utf8'))+'\n// modified');
  t.after(()=>fs.rm(wrong,{force:true}));
  await assert.rejects(prepareBootstrapTrust({...a,template:wrong}),/UPDATE_SERVICE_TEMPLATE_GIT_BLOB_MISMATCH/);
});
test('refuses non-Ed25519 public key input',async t=>{
  const a=await fixture(t);
  await assert.rejects(prepareBootstrapTrust({...a,manifestPublicKey:badPem}),/ED25519_KEY_TYPE_REQUIRED/);
});
test('refuses untrusted candidate signer thumbprint mismatch and placeholder',async t=>{
  const a=await fixture(t);
  await assert.rejects(prepareBootstrapTrust({...a,expectedThumbprint:'A'.repeat(40)}),/PUBLISHER_PIN_PLACEHOLDER_REJECTED/);
  const wrong=(pin[0]==='0'?'1':'0')+pin.slice(1);
  await assert.rejects(prepareBootstrapTrust({...a,expectedThumbprint:wrong}),/PUBLISHER_CERT_FINGERPRINT_MISMATCH/);
});
test('refuses non-code-signing X509 certificate',async t=>{
  const a=await fixture(t);
  const cert = new X509Certificate(await fs.readFile(otherCert));
  await assert.rejects(prepareBootstrapTrust({...a,publisherCert:otherCert,
    expectedThumbprint:cert.fingerprint.replaceAll(':','')}),/PUBLIC_CERT_CODE_SIGNING_EKU_REQUIRED/);
});
test('refuses expired or not-yet-valid publisher certificate',async t=>{
  const a=await fixture(t),x=new X509Certificate(await fs.readFile(codeCert));
  await assert.rejects(prepareBootstrapTrust({...a,now:x.validToDate.getTime()+1}),/PUBLIC_CERT_NOT_CURRENTLY_VALID/);
  await assert.rejects(prepareBootstrapTrust({...a,now:x.validFromDate.getTime()-1}),/PUBLIC_CERT_NOT_CURRENTLY_VALID/);
});
test('refuses source folder as output and any existing output collision without overwrite',async t=>{
  const a=await fixture(t);
  await assert.rejects(prepareBootstrapTrust({...a,outputDir:path.dirname(template)}),/OUTPUT_MUST_BE_SEPARATE_FROM_APPROVED_TEMPLATE/);
  await prepareBootstrapTrust(a);
  const before=await fs.readFile(path.join(a.outputDir,'update-service.mjs'));
  await assert.rejects(prepareBootstrapTrust(a),/EEXIST/);
  const after=await fs.readFile(path.join(a.outputDir,'update-service.mjs'));
  assert.equal(after.equals(before),true);
});
test('no signer keys, cryptographic signatures or real release are made in the output',async t=>{
  const a=await fixture(t),result=await prepareBootstrapTrust(a);
  const out=await fs.readFile(path.join(a.outputDir,'update-service.mjs'),'utf8');
  assert.doesNotMatch(out,/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/);
  assert.deepEqual((await fs.readdir(a.outputDir)).sort(),
    ['bootstrap-trust-preparation.json','update-service.mjs']);
  assert.equal(result.authenticodeVerified,false);
});
test('CLI with synthetic public inputs reports source-copy only and rejects invalid args',async t=>{
  const a=await fixture(t);
  const argv=['--template',a.template,'--manifest-public-key',a.manifestPublicKey,
    '--publisher-cert',a.publisherCert,'--expected-thumbprint',a.expectedThumbprint,
    '--output-dir',a.outputDir,'--target-version',a.targetVersion];
  const result=spawnSync(process.execPath,[script,...argv],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).status,'SOURCE_COPY_PREPARED_NOT_BUILT_NOT_SIGNED');
  const duplicate=spawnSync(process.execPath,[script,...argv,'--output-dir',a.outputDir],{encoding:'utf8'});
  assert.notEqual(duplicate.status,0);
  assert.match(duplicate.stderr,/ARGUMENT_COUNT_INVALID/);
});
