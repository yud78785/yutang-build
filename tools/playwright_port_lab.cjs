'use strict';
// Experiment only: signed Windows Microsoft Edge + exact locked Playwright alpha.
// No YuTang EXE, account, Google, Douyin, model key, outbound browser network, or real user profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2];
if (!['pipe','fixed'].includes(mode) || process.platform!=='win32' || process.env.GITHUB_ACTIONS!=='true' || process.env.YUTANG_EDGE_FIREWALL_CONFIRMED!=='yes') {
  console.error('LAB_REFUSED: must run in guarded ephemeral Windows CI with mode=pipe|fixed');
  process.exit(2);
}
const source = path.resolve(process.cwd(),'upstream');
const pkg = require(path.join(source,'node_modules','playwright-core','package.json'));
assert.equal(pkg.version,'1.64.0-alpha-1790635538000');
const {chromium} = require(path.join(source,'node_modules','playwright-core'));
const profile = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,`yutang-playwright-${mode}-`));
const port = 9331;
const options = {
  channel:'msedge', headless:false, viewport:null, chromiumSandbox:true,
  ignoreDefaultArgs:['--mute-audio'],
  args: mode==='fixed' ? [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required'] : ['--autoplay-policy=no-user-gesture-required']
};
function category(error){
  const value=String(error?.message||error);
  if(/timeout|timed out/i.test(value))return 'TIMEOUT';
  if(/permission|access denied|EACCES|EPERM/i.test(value))return 'PERMISSION';
  if(/pipe|websocket|ECONNREFUSED|connection/i.test(value))return 'DEBUG_CONNECTION';
  if(/executable|ENOENT|not found/i.test(value))return 'BROWSER_NOT_FOUND';
  return 'OTHER';
}
(async()=>{
  let context=null, listenerObserved=false, timeoutHandle=null;
  const check = async () => {
    try {
      const res=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)});
      if(res.ok && /Edg|Chrome/.test(String((await res.json()).Browser)))listenerObserved=true;
    }catch{}
  };
  const interval = mode==='fixed'?setInterval(()=>{void check();},500):null;
  try {
    const timeout = new Promise((_,reject)=>{timeoutHandle=setTimeout(()=>reject(new Error('LAB_LAUNCH_TIMEOUT')),31000);});
    context = await Promise.race([chromium.launchPersistentContext(profile,options), timeout]);
    const page=context.pages()[0]||await context.newPage();
    await page.goto('about:blank',{timeout:5000});
    if(mode==='fixed')await check();
    console.log('LAB_RESULT '+JSON.stringify({mode,launch:'PASS',playwrightVersion:pkg.version,externalCdpListenerObserved:listenerObserved,headless:false,sandboxRequested:true}));
  }catch(error){
    console.log('LAB_RESULT '+JSON.stringify({mode,launch:'FAIL',playwrightVersion:pkg.version,externalCdpListenerObserved:listenerObserved,errorCategory:category(error),headless:false,sandboxRequested:true}));
    process.exitCode=1;
  }finally{
    if(interval)clearInterval(interval);
    if(timeoutHandle)clearTimeout(timeoutHandle);
    if(context)await context.close().catch(()=>{});
    // All work is on a disposable CI VM; no user profile is ever read.
  }
})().catch(()=>{process.exitCode=1;});
