#!/usr/bin/env node
// Prepare a future update-client trust-source COPY, never sign, build or publish.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createPublicKey, X509Certificate } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const TEMPLATE_BLOB = 'b00c130f081cbe80bec3200bcfc024a738631784';
const TEMPLATE_NAME = 'update-service.mjs';
const RECEIPT_NAME = 'bootstrap-trust-preparation.json';
const CODE_SIGNING_EKU = '1.3.6.1.5.5.7.3.3';
const TRUST_LINES = Object.freeze([
  "export const UPDATE_MANIFEST_PUBLIC_KEY = '';",
  "export const UPDATE_PUBLISHER_THUMBPRINT = '';"
]);
function guard(ok, message) { if (!ok) throw new Error(message); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function gitBlob(bytes) { return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'); }
function validNextVersion(v) {
  if(typeof v !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)) return false;
  const x = v.split('.').map(Number);
  return x.every(Number.isSafeInteger) && (x[0]>1 || (x[0]===1 && (x[1]>4 || (x[1]===4 && x[2]>7))));
}
async function readRegular(file, max) {
  guard(typeof file === 'string' && path.isAbsolute(file), 'ABSOLUTE_INPUT_PATH_REQUIRED');
  const s = await fs.lstat(file);
  guard(s.isFile() && !s.isSymbolicLink() && s.size>0 && s.size<=max, 'INPUT_FILE_INVALID');
  const bytes=await fs.readFile(file);
  guard(bytes.length===s.size, 'INPUT_CHANGED_DURING_READ');
  return bytes;
}
function replaceOnce(source,needle,replacement){
  const pos=source.indexOf(needle);
  guard(pos>=0 && source.indexOf(needle,pos+needle.length)<0, 'TRUST_ANCHOR_MISSING_OR_AMBIGUOUS');
  return source.slice(0,pos)+replacement+source.slice(pos+needle.length);
}
function readManifestPublicKey(bytes) {
  const pem=bytes.toString('utf8');
  guard(/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\r?\n?$/.test(pem) &&
        !pem.includes('PRIVATE KEY'), 'ED25519_PUBLIC_PEM_REQUIRED');
  let key;
  try { key=createPublicKey(pem); } catch { throw new Error('ED25519_PUBLIC_KEY_INVALID'); }
  guard(key.asymmetricKeyType==='ed25519','ED25519_KEY_TYPE_REQUIRED');
  return {pem:key.export({type:'spki',format:'pem'}),fingerprintSha256:sha256(key.export({type:'spki',format:'der'}))};
}
function readPublisherCertificate(bytes, pin, now) {
  guard(/^[a-fA-F0-9]{40}$/.test(String(pin||'')),'PUBLISHER_PIN_FORMAT_INVALID');
  const expected=pin.toUpperCase();
  guard(!/^(.)\1{39}$/.test(expected),'PUBLISHER_PIN_PLACEHOLDER_REJECTED');
  let cert;
  try {cert=new X509Certificate(bytes);}catch {throw new Error('PUBLIC_X509_CERT_REQUIRED');}
  const actual=cert.fingerprint.replaceAll(':','').toUpperCase();
  guard(actual===expected,'PUBLISHER_CERT_FINGERPRINT_MISMATCH');
  guard(cert.keyUsage?.includes(CODE_SIGNING_EKU)===true,'PUBLIC_CERT_CODE_SIGNING_EKU_REQUIRED');
  guard(Number.isFinite(now) && now>=cert.validFromDate.getTime() && now<=cert.validToDate.getTime(),
    'PUBLIC_CERT_NOT_CURRENTLY_VALID');
  guard(!cert.ca,'PUBLISHER_CERT_MUST_BE_LEAF');
  return {thumbprint:actual,fingerprint256:cert.fingerprint256.replaceAll(':','').toLowerCase(),validTo:cert.validToDate.toISOString()};
}

export async function prepareBootstrapTrust({template,manifestPublicKey,publisherCert,expectedThumbprint,
  outputDir,targetVersion,now=Date.now()}={}){
  guard(validNextVersion(targetVersion),'BOOTSTRAP_TARGET_VERSION_MUST_EXCEED_1_4_7');
  const [rawTemplate,pubBytes,certBytes] = await Promise.all([
    readRegular(template,65536),readRegular(manifestPublicKey,8192),readRegular(publisherCert,32768)
  ]);
  // Only the exact accepted fail-closed template may be used as input.
  guard(gitBlob(rawTemplate)===TEMPLATE_BLOB,'UPDATE_SERVICE_TEMPLATE_GIT_BLOB_MISMATCH');
  const publicKey=readManifestPublicKey(pubBytes);
  const publisher=readPublisherCertificate(certBytes,expectedThumbprint,now);
  const original=rawTemplate.toString('utf8');
  const updated=replaceOnce(replaceOnce(original,TRUST_LINES[0],
    'export const UPDATE_MANIFEST_PUBLIC_KEY = '+JSON.stringify(publicKey.pem)+';'),TRUST_LINES[1],
    'export const UPDATE_PUBLISHER_THUMBPRINT = '+JSON.stringify(publisher.thumbprint)+';');
  guard(updated!==original && !updated.includes(TRUST_LINES[0]) && !updated.includes(TRUST_LINES[1]),
    'TRUST_PINS_NOT_CONFIGURED');
  const target=path.resolve(outputDir||'.');
  guard(path.isAbsolute(outputDir||''),'ABSOLUTE_OUTPUT_DIR_REQUIRED');
  const st=await fs.lstat(target);
  guard(st.isDirectory() && !st.isSymbolicLink(),'OUTPUT_DIRECTORY_INVALID');
  guard(target!==path.dirname(path.resolve(template)),'OUTPUT_MUST_BE_SEPARATE_FROM_APPROVED_TEMPLATE');
  const sourceFile=path.join(target,TEMPLATE_NAME),receiptFile=path.join(target,RECEIPT_NAME);
  const sourceBytes=Buffer.from(updated,'utf8');
  const receipt={
    schema:'yutang.bootstrap-trust-source-preparation.v1',
    status:'SOURCE_COPY_PREPARED_NOT_BUILT_NOT_SIGNED',
    productVersion:targetVersion,
    sourceTemplateGitBlobSha1:TEMPLATE_BLOB,
    sourceTemplateSha256:sha256(rawTemplate),
    preparedSourceSha256:sha256(sourceBytes),
    manifestPublicKeySpkiSha256:publicKey.fingerprintSha256,
    publisherCertSha256:publisher.fingerprint256,
    publisherThumbprint:publisher.thumbprint,
    publisherCertificateNotAfter:publisher.validTo,
    releaseReady:false,exeBuilt:false,authenticodeVerified:false,windows2022Accepted:false,windows2025Accepted:false,
    warning:'OFFLINE SOURCE COPY ONLY; certificate chain, publisher identity and signed EXE must be independently verified on Windows.'
  };
  let wroteSource=false;
  try {
    await fs.writeFile(sourceFile,sourceBytes,{flag:'wx',mode:0o600});
    wroteSource=true;
    await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  } catch(error) {
    if(wroteSource) await fs.rm(sourceFile,{force:true});
    throw error;
  }
  return receipt;
}

function parseArgs(argv){
  const allowed=['--template','--manifest-public-key','--publisher-cert','--expected-thumbprint','--output-dir','--target-version'];
  guard(argv.length===12,'ARGUMENT_COUNT_INVALID');
  const options={};
  for(let i=0;i<argv.length;i+=2){
    const k=argv[i];guard(allowed.includes(k)&&!Object.hasOwn(options,k)&&!!argv[i+1],'ARGUMENT_INVALID');
    options[k]=argv[i+1];
  }
  guard(allowed.every(x=>Object.hasOwn(options,x)),'ARGUMENT_MISSING');
  return {template:options['--template'],manifestPublicKey:options['--manifest-public-key'],
    publisherCert:options['--publisher-cert'],expectedThumbprint:options['--expected-thumbprint'],
    outputDir:options['--output-dir'],targetVersion:options['--target-version']};
}
const directly=process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(directly){
  try { console.log(JSON.stringify(await prepareBootstrapTrust(parseArgs(process.argv.slice(2))),null,2)); }
  catch(e){console.error('BOOTSTRAP_TRUST_PREP_REJECTED: '+String(e?.message||e));process.exitCode=1;}
}
