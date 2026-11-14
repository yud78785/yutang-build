import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templates=['manual-only','branch-one-shot'].map(type=>({
  type,
  path:path.join(root,'docs/templates',`windows-147-nosign-preflight.${type}.yml`)
})).map(v=>({...v,text:fs.readFileSync(v.path,'utf8')}));
const byType=Object.fromEntries(templates.map(v=>[v.type,v.text]));
const CHECKOUT='11d5960a326750d5838078e36cf38b85af677262';
const DOWNLOAD='d3f86a106a0bac45b974a628896c90dbdf5c8093';
const CODE='c8cf9be7c175d00774e7e5cc5a763d587b77ec6e';
const EXE_SHA='3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';

test('both templates remain inert and can never auto-run from docs/templates',()=>{
  for(const f of templates){
    assert.ok(!f.path.includes(path.join('.github','workflows')));
    assert.equal(f.text.match(/- name: Checkout immutable no-sign preflight code/g)?.length,1);
    assert.doesNotMatch(f.text,/^\s*(?:id-token|contents|actions): write\s*$/m);
  }
});

test('the two official GitHub actions use immutable SHA pins, not movable v4 tags',()=>{
  for(const {text} of templates){
    assert.match(text,new RegExp(`uses: actions/checkout@${CHECKOUT}`));
    assert.match(text,new RegExp(`uses: actions/download-artifact@${DOWNLOAD}`));
    assert.doesNotMatch(text,/uses: actions\/(?:checkout|download-artifact)@v\d/);
  }
});

test('checkout is byte-addressed and verified before downloading the candidate',()=>{
  for(const {text} of templates){
    assert.match(text,new RegExp(`ref: ${CODE}`));
    assert.ok(text.includes("if ($actualCommit -cne '"+CODE+"')"));
    assert.match(text,/AUDITED_CODE_CHECKOUT_SHA_MISMATCH/);
    assert.ok(text.indexOf('Confirm immutable audited checkout')<text.indexOf('Download exact accepted unsigned Windows 2025 candidate'));
  }
});

test('one-shot variant uses supported push.before SHA instead of missing added fields',()=>{
  const text=byType['branch-one-shot'];
  const seed='ee411c1a9c2684d6fdc82cfa8c2542de83fd776f';
  const gate=text.split('\n').find(line => line.trim().startsWith('if: github.event_name'));
  assert.ok(gate);
  assert.ok(gate.includes("github.event.before == '"+seed+"'"));
  assert.ok(gate.includes('github.event.created == false'));
  assert.ok(gate.includes('github.event.forced == false'));
  assert.ok(gate.includes('github.event.deleted == false'));
  assert.doesNotMatch(text,/head_commit\.added|FIRST_ADDITION/);
  assert.ok(text.indexOf('Recheck approved activation base SHA')<text.indexOf('Checkout immutable no-sign preflight code'));
  assert.match(text,/ONE_SHOT_ACTIVATION_NOT_FROM_APPROVED_BASE/);
  assert.match(text,/^\s+branches:\n\s+- experiment\/windows-147-nosign-run-20261114/m);
});

test('both templates pin unsigned source artifact ID, byte count and digest',()=>{
  for(const {text} of templates){
    assert.match(text,/run-id: 43541915930/);
    assert.match(text,/name: YuTang-OpenRouter-Desktop-1\.4\.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE/);
    assert.match(text,new RegExp(EXE_SHA));
    assert.match(text,/125446071/);
    assert.match(text,/os: \[windows-2022, windows-2025\]/);
  }
});

test('no signing, release, untrusted dynamic checkout or secret persistence',()=>{
  for(const {text} of templates){
    assert.match(text,/persist-credentials: false/);
    assert.match(text,/permissions:\n  contents: read\n  actions: read/);
    assert.doesNotMatch(text,/(?:^|\s)-Sign(?:\s|$)|\bsigntool\b|upload-artifact|create-release|publish release|gh release create/im);
    assert.match(text,/PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY/);
    assert.match(text,/NONSIGN_RECEIPT_REJECTED/);
    assert.match(text,/UNSIGNED_EXE_CHANGED_AFTER_PREFLIGHT/);
  }
});


test('synthetic push-state matrix rejects repeats, creation, force pushes and unrelated branches',()=>{
  // JS reproduces the reviewed boolean condition; it does not execute Actions.
  const branch='refs/heads/experiment/windows-147-nosign-run-20261114';
  const seed='ee411c1a9c2684d6fdc82cfa8c2542de83fd776f';
  const schedule=({event='push',ref=branch,before=seed,created=false,forced=false,deleted=false}={}) =>
    event==='push' && ref===branch && before===seed && !created && !forced && !deleted;
  assert.equal(schedule(),true);
  assert.equal(schedule({before:'f'.repeat(40)}),false);
  assert.equal(schedule({created:true}),false);
  assert.equal(schedule({forced:true}),false);
  assert.equal(schedule({deleted:true}),false);
  assert.equal(schedule({ref:'refs/heads/main'}),false);
  assert.equal(schedule({event:'workflow_dispatch'}),false);
});

