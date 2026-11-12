import assert from 'node:assert/strict';
import { patchBrowserLauncher } from '../tools/patch-browser-launcher-navigation.mjs';

const source=[
  "function cancelled(signal) { signal?.throwIfAborted(); }",
  "function abortable(value, signal) { return value; }",
  "function allowedPage(url) { try { return url === 'about:blank' || new URL(url).origin === 'https://www.douyin.com'; } catch { return false; } }",
  "async open({ signal } = {}) {",
  "  if (page.url() === 'about:blank') { await abortable(page.goto(this.homeUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }), signal); await abortable(page.evaluate(installPreparePause, { label:PREPARE_PAGE_NAME, token, claimInitial:true }), signal); }",
  "  const paused = await abortable(page.evaluate(pauseResult), signal);",
  "  if(claimable&&token){const proof=await abortable(page.evaluate(()=>({url:location.href,timeOrigin:performance.timeOrigin})),signal);this.preparedOwnership.set(page,{token,...proof});}",
  "}"
].join('\n');
const patched=patchBrowserLauncher(source);
assert.match(patched,/async function evaluateAfterNavigation/);
assert.match(patched,/attempt < 3/);
assert.match(patched,/Execution context was destroyed\|Cannot find context with specified id/);
assert.match(patched,/!allowedPage\(page\.url\(\)\)/);
assert.match(patched,/evaluateAfterNavigation\(page, installPreparePause/);
assert.match(patched,/evaluateAfterNavigation\(page, pauseResult/);
assert.match(patched,/evaluateAfterNavigation\(page,\(\)=>\(\{url:location\.href,timeOrigin:performance\.timeOrigin\}\)/);
assert.throws(()=>patchBrowserLauncher(source.replace('function allowedPage','function missingAllowedPage')),/anchor mismatch/);
assert.throws(()=>patchBrowserLauncher(patched),/anchor mismatch/);
console.log('PASS BrowserLauncher navigation recovery patch: exact anchors, same-origin gate, 3-attempt ceiling, all post-navigation evaluations covered.');
