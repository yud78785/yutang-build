// Source-only, optional Windows acceptance runner. No browser launch or writes.
// Requires a clean, pinned *source* checkout of the upstream project.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectExistingDedicatedDouyinVideoReadOnly } from './douyin-existing-browser-readonly.mjs';
import { observePublicCommentsReadOnly } from './douyin-public-comment-readonly.mjs';
import { inspectDouyinAiSummaryEntryReadOnly } from './douyin-ai-summary-entry-readonly.mjs';

const UPSTREAM_SHA = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const WORK_ID = /^\d{10,30}$/;
const ALLOWED_OPTIONS = new Set(['--video-id', '--upstream-root']);
const DEPENDENCIES = Object.freeze(['core.mjs', 'comment-browser.mjs', 'package.json', 'browser-launcher.mjs']);

function blocked(reasonCode) {
  return {status:'blocked',reasonCode,videoId:null,comments:[],aiSummaryEntryVisible:false,aiSummaryGenerated:false,
    browserLaunchedByThisProbe:false,navigationByThisProbe:false,clickedByThisProbe:false,persistentDataModifiedByThisProbe:false};
}
export function parseReadOnlyArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) return {ok:false,reasonCode:'ARGUMENTS_REQUIRED'};
  const items = new Map();
  for(let i=0;i<argv.length;i+=2){
    if(!ALLOWED_OPTIONS.has(argv[i]) || items.has(argv[i]) || typeof argv[i+1]!=='string')
      return {ok:false,reasonCode:'ARGUMENTS_INVALID'};
    items.set(argv[i],argv[i+1]);
  }
  const videoId = items.get('--video-id'), root = items.get('--upstream-root');
  if (!WORK_ID.test(videoId||'')) return {ok:false,reasonCode:'VIDEO_ID_INVALID'};
  if (typeof root!=='string' || !path.isAbsolute(root) || /[\0\r\n]/.test(root))
    return {ok:false,reasonCode:'UPSTREAM_ROOT_MUST_BE_ABSOLUTE'};
  return {ok:true,videoId,root:path.resolve(root)};
}

export function checkPinnedSourceRoot(root, { git = execFileSync }={}) {
  try {
    const location = fs.realpathSync(root);
    if(!fs.statSync(location).isDirectory()) return {ok:false,reasonCode:'UPSTREAM_ROOT_INVALID'};
    for(const file of DEPENDENCIES){
      const full=path.resolve(location,file), real=fs.realpathSync(full);
      if(path.dirname(real)!==location || !fs.statSync(real).isFile())
        return {ok:false,reasonCode:'UPSTREAM_FILE_UNVERIFIED'};
    }
    const rev = String(git('git',['rev-parse','--verify','HEAD'],{
      cwd:location,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:4000,maxBuffer:256,
    })).trim();
    if(rev!==UPSTREAM_SHA) return {ok:false,reasonCode:'UPSTREAM_COMMIT_NOT_PINNED'};
    const repoRoot = String(git('git',['rev-parse','--show-toplevel'],{
      cwd:location,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:4000,maxBuffer:2048,
    })).trim();
    if(path.resolve(repoRoot).toLowerCase()!==location.toLowerCase())
      return {ok:false,reasonCode:'UPSTREAM_WORKTREE_ROOT_MISMATCH'};
    const dirty=String(git('git',['status','--porcelain','--untracked-files=no'],{
      cwd:location,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:4000,maxBuffer:16_384,
    })).trim();
    if(dirty) return {ok:false,reasonCode:'UPSTREAM_MODIFIED_SOURCE'};
    return {ok:true,root:location};
  } catch {return {ok:false,reasonCode:'UPSTREAM_ROOT_UNVERIFIED'};}
}

export async function runReadOnlySourcePreflight({argv, platform=process.platform, nodeVersion=process.versions.node,
  rootCheck=checkPinnedSourceRoot, load=async root=>Promise.all([
    import(pathToFileURL(path.join(root,'core.mjs')).href),
    import(pathToFileURL(path.join(root,'comment-browser.mjs')).href),
  ]), controllerFactory=module=>new module.BrowserController({source:'api'})}={}) {
  const parsed=parseReadOnlyArgs(argv);
  if(!parsed.ok)return blocked(parsed.reasonCode);
  if(platform!=='win32')return blocked('WINDOWS_REQUIRED');
  const [major,minor]=String(nodeVersion).split('.').map(Number);
  if(!Number.isSafeInteger(major)||!Number.isSafeInteger(minor)||major<22||major===22&&minor<13)
    return blocked('NODE_22_13_OR_NEWER_REQUIRED');
  const verified=rootCheck(parsed.root);
  if(!verified?.ok)return blocked(verified?.reasonCode||'UPSTREAM_ROOT_UNVERIFIED');
  let core,comments;
  try {[core,comments]=await load(verified.root);}
  catch{return blocked('PINNED_UPSTREAM_IMPORT_FAILED');}
  if(typeof core?.BrowserController!=='function'||typeof core?.readPageState!=='function'||
     typeof core?.acquireBrowserOperationLock!=='function'||
     typeof comments?.readCommentDom!=='function')return blocked('PINNED_UPSTREAM_EXPORTS_MISSING');
  let controller;
  try{controller=controllerFactory(core);}catch{return blocked('UPSTREAM_CONTROLLER_UNAVAILABLE');}
  try{
    return await inspectExistingDedicatedDouyinVideoReadOnly({
      controller,readPageState:core.readPageState,readCommentDom:comments.readCommentDom,
      observeComments:observePublicCommentsReadOnly,inspectSummary:inspectDouyinAiSummaryEntryReadOnly,
      acquireReadLock: ({signal}) => core.acquireBrowserOperationLock('tab-api', {
        signal, directory:controller.controlDirectory, timeoutMs:4000,
      }),
      expectedVideoId:parsed.videoId,limit:12,
    });
  }catch{return blocked('READ_ONLY_EXECUTION_FAILED');}
}

const entry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if(entry){
  void runReadOnlySourcePreflight({argv:process.argv.slice(2)}).then(value=>{
    // There is no 'browser.close()': dropping this one-shot connection must never
    // terminate an Edge process that existed before this probe.
    process.stdout.write(JSON.stringify(value)+'\n',()=>process.exit(value.status==='read_only_evidence'?0:2));
  },()=>process.stdout.write(JSON.stringify(blocked('UNEXPECTED_PRECHECK_FAILURE'))+'\n',()=>process.exit(2)));
}
