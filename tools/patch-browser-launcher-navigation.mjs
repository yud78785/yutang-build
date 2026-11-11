#!/usr/bin/env node
// Exact-blob guarded fix for transient same-origin navigation destroying Playwright evaluate contexts.
// It never retries across an unsupported origin and has a strict three-attempt / bounded-wait ceiling.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const EXPECTED_BLOB='ca0fbc9d28119fc08cab455613ef478ed9de9447';
const gitBlob = bytes => createHash('sha1')
  .update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');

export function patchBrowserLauncher(source) {
  const helperAnchor="function allowedPage(url) { try { return url === 'about:blank' || new URL(url).origin === 'https://www.douyin.com'; } catch { return false; } }\n";
  const helper=[
    "function allowedPage(url) { try { return url === 'about:blank' || new URL(url).origin === 'https://www.douyin.com'; } catch { return false; } }",
    "",
    "async function evaluateAfterNavigation(page, fn, argument, signal) {",
    "  let lastError;",
    "  for (let attempt = 0; attempt < 3; attempt++) {",
    "    cancelled(signal);",
    "    const currentUrl = page.url();",
    "    if (!allowedPage(currentUrl) || currentUrl === 'about:blank') {",
    "      throw new Error('专用抖音准备页跳转到不受支持的来源，已停止；没有尝试绕过登录或验证。');",
    "    }",
    "    try {",
    "      return await abortable(page.evaluate(fn, argument), signal);",
    "    } catch (error) {",
    "      lastError = error;",
    "      const message = String(error?.message || error);",
    "      if (!/Execution context was destroyed|Cannot find context with specified id/i.test(message) || attempt === 2) throw error;",
    "      if (!allowedPage(page.url()) || page.url() === 'about:blank') {",
    "        throw new Error('专用抖音准备页在导航期间离开允许来源，已停止。');",
    "      }",
    "      await abortable(page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {}), signal);",
    "      await abortable(new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1))), signal);",
    "    }",
    "  }",
    "  throw lastError || new Error('专用抖音准备页初始化未能稳定。');",
    "}",
    ""
  ].join('\n');
  if(source.split(helperAnchor).length!==2)throw new Error('Pinned BrowserLauncher allowedPage anchor mismatch');
  source=source.replace(helperAnchor,helper);
  const afterGoto="if (page.url() === 'about:blank') { await abortable(page.goto(this.homeUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }), signal); await abortable(page.evaluate(installPreparePause, { label:PREPARE_PAGE_NAME, token, claimInitial:true }), signal); }";
  const afterGotoPatched="if (page.url() === 'about:blank') { await abortable(page.goto(this.homeUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }), signal); await evaluateAfterNavigation(page, installPreparePause, { label:PREPARE_PAGE_NAME, token, claimInitial:true }, signal); }";
  if(source.split(afterGoto).length!==2)throw new Error('Pinned BrowserLauncher post-navigation pause anchor mismatch');
  source=source.replace(afterGoto,afterGotoPatched);
  const paused="const paused = await abortable(page.evaluate(pauseResult), signal);";
  if(source.split(paused).length!==2)throw new Error('Pinned BrowserLauncher pauseResult anchor mismatch');
  source=source.replace(paused,"const paused = await evaluateAfterNavigation(page, pauseResult, undefined, signal);");
  const proof="const proof=await abortable(page.evaluate(()=>({url:location.href,timeOrigin:performance.timeOrigin})),signal);";
  if(source.split(proof).length!==2)throw new Error('Pinned BrowserLauncher ownership proof anchor mismatch');
  source=source.replace(proof,"const proof=await evaluateAfterNavigation(page,()=>({url:location.href,timeOrigin:performance.timeOrigin}),undefined,signal);");
  const open=source.slice(source.indexOf('async open({ signal } = {})'));
  if(!open.includes('evaluateAfterNavigation(page, installPreparePause')||!open.includes('evaluateAfterNavigation(page, pauseResult')||!open.includes('evaluateAfterNavigation(page,()=>({url:location.href,timeOrigin:performance.timeOrigin})')) throw new Error('Bounded navigation recovery did not reach every post-navigation evaluation');
  return source;
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked){
  const filename=process.argv[2];
  if(!filename||!path.isAbsolute(filename))throw new Error('Usage: node tools/patch-browser-launcher-navigation.mjs /absolute/browser-launcher.mjs');
  const stat=await fs.lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Refusing symlink or non-regular BrowserLauncher source');
  const bytes=await fs.readFile(filename);
  if(gitBlob(bytes)!==EXPECTED_BLOB)throw new Error('Pinned BrowserLauncher Git blob mismatch; refusing patch');
  const patched=Buffer.from(patchBrowserLauncher(bytes.toString('utf8')),'utf8');
  const temp=filename+'.yutang-navigation-'+process.pid+'.tmp';
  try{await fs.writeFile(temp,patched,{flag:'wx'});await fs.rename(temp,filename);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  console.log('PATCHED_BROWSER_LAUNCHER_NAVIGATION sha256='+createHash('sha256').update(patched).digest('hex'));
}
