import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM_COMMIT = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const EXPECTED_BLOBS = {
  'desktop/src/update-service.mjs': '92709845a54a961eb58cc76e1697dce917c6252e',
  'desktop/src/update-launcher.mjs': '1d98056c709de8d4ddcc4322cfb82b1204dc8538'
};

function gitBlobSha1(value) {
  const bytes = Buffer.from(value, 'utf8');
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

function replaceExactlyOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error('UPDATE_TRUST_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS: ' + label);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function read(file) {
  return fs.readFile(file, 'utf8');
}

async function write(file, value) {
  await fs.writeFile(file, value, 'utf8');
}

export async function applyUpdateTrustPatch(upstream, repositoryRoot = REPOSITORY_ROOT) {
  const actualCommit = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualCommit !== UPSTREAM_COMMIT) throw new Error('UPDATE_TRUST_PATCH_WRONG_UPSTREAM_COMMIT: ' + actualCommit);

  for (const [relative, expected] of Object.entries(EXPECTED_BLOBS)) {
    const original = await read(path.join(upstream, relative));
    const actual = gitBlobSha1(original);
    if (actual !== expected) throw new Error('UPDATE_TRUST_PATCH_SOURCE_BLOB_MISMATCH: ' + relative + ' ' + actual);
  }

  const serviceTemplate = await read(path.join(repositoryRoot, 'tools/windows147-update-patched/update-service.mjs'));
  const launcherTemplate = await read(path.join(repositoryRoot, 'tools/windows147-update-patched/update-launcher.mjs'));
  if (!serviceTemplate.includes("UPDATE_REPOSITORY = 'yud78785/yutang-build'") ||
      !serviceTemplate.includes("UPDATE_MANIFEST_PUBLIC_KEY = ''") ||
      !serviceTemplate.includes("UPDATE_PUBLISHER_THUMBPRINT = ''")) {
    throw new Error('UPDATE_TRUST_PATCH_MUST_FAIL_CLOSED_UNTIL_REAL_TRUST_KEYS_ARE_CONFIGURED');
  }
  await write(path.join(upstream, 'desktop/src/update-service.mjs'), serviceTemplate);
  await write(path.join(upstream, 'desktop/src/update-launcher.mjs'), launcherTemplate);

  const mainPath = path.join(upstream, 'desktop/src/main.mjs');
  let main = await read(mainPath);
  if (!main.includes("import { randomUUID, createHash } from 'node:crypto';") ||
      !main.includes("import { UpdateService } from './update-service.mjs';")) {
    throw new Error('UPDATE_TRUST_PATCH_MAIN_IMPORTS_CHANGED');
  }

  const backendStartIndex = main.indexOf('    await backend.start(current);');
  const navigationIndex = main.indexOf('    await navigateStartup({');
  const rendererCheckIndex = main.indexOf('checkRenderer:', navigationIndex);
  const startupSuccessIndex = main.indexOf('    await startup.success();', navigationIndex);
  const backendAliveIndex = main.indexOf('    if (!backend.child.connected', startupSuccessIndex);
  const startupReadyIndex = main.indexOf('    startupReady = true;', backendAliveIndex);
  if (backendStartIndex < 0 || navigationIndex < backendStartIndex ||
      rendererCheckIndex < navigationIndex || startupSuccessIndex < rendererCheckIndex ||
      backendAliveIndex < startupSuccessIndex || startupReadyIndex < backendAliveIndex) {
    throw new Error('UPDATE_HEALTH_SIGNAL_NOT_AFTER_BACKEND_AND_RENDERER_READINESS');
  }

  const oldInstallBlock = [
    "      const {file,sha256}=await updater.verifiedExecutable();",
    "      // 便携版退出后会清理解压目录，更新助手必须先放到持久目录。",
    "      const launcherDir=path.join(userData,'updates','launcher');await fs.mkdir(launcherDir,{recursive:true});",
    "      const launcher=path.join(launcherDir,'update-launcher.mjs'),launcherNode=path.join(launcherDir,'node.exe');",
    "      await fs.copyFile(node,launcherNode);await fs.copyFile(path.join(appRoot,'app/update-launcher.mjs'),launcher);",
    "      const shortcut=path.join(app.getPath('desktop'),'大肥鱼抖音助手.lnk');",
    "      if(!shell.writeShortcutLink(shortcut,'create',{target:file,cwd:path.dirname(file),description:'大肥鱼抖音助手 · 独立 API 版',icon:file,iconIndex:0,appUserModelId:'local.dafeiyu.douyin.api'}))throw new Error('无法创建新版软件快捷方式，尚未重启。');",
    "      const child=spawn(launcherNode,[launcher,String(process.pid),file,sha256],{detached:true,windowsHide:true,stdio:'ignore',shell:false});",
    "      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();",
    "      setTimeout(()=>{void quit();},100);return {status:'restarting',message:'正在退出旧版并打开已核对的新版。桌面快捷方式已指向新版。'};"
  ].join('\n');
  const newInstallBlock = [
    "      const {file,sha256,publisherThumbprint,version}=await updater.verifiedExecutable();",
    "      // 更新助手必须位于持久目录；旧版快捷方式在新版健康确认前保持不变。",
    "      const launcherDir=path.join(userData,'updates','launcher');await fs.mkdir(launcherDir,{recursive:true});",
    "      const launcher=path.join(launcherDir,'update-launcher.mjs'),launcherNode=path.join(launcherDir,'node.exe');",
    "      await fs.copyFile(node,launcherNode);await fs.copyFile(path.join(appRoot,'app/update-launcher.mjs'),launcher);",
    "      const nonce=randomUUID(),updateDirectory=path.dirname(file);",
    "      const healthFile=path.join(updateDirectory,'.health-'+nonce+'.json');",
    "      const stagedShortcut=path.join(updateDirectory,'.shortcut-'+nonce+'.lnk');",
    "      const shortcut=path.join(app.getPath('desktop'),'大肥鱼抖音助手.lnk');",
    "      await fs.rm(healthFile,{force:true});await fs.rm(stagedShortcut,{force:true});",
    "      if(!shell.writeShortcutLink(stagedShortcut,'create',{target:file,cwd:path.dirname(file),description:'大肥鱼抖音助手 · 独立 API 版',icon:file,iconIndex:0,appUserModelId:'local.dafeiyu.douyin.api'}))throw new Error('无法创建新版暂存快捷方式，旧版入口未改变。');",
    "      const child=spawn(launcherNode,[launcher,String(process.pid),file,sha256,publisherThumbprint,version,nonce,healthFile,stagedShortcut,shortcut],{detached:true,windowsHide:true,stdio:'ignore',shell:false});",
    "      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();",
    "      setTimeout(()=>{void quit();},100);return {status:'restarting',message:'正在启动新版并检查 UI、API 和文件身份；确认健康后才切换桌面快捷方式。'};"
  ].join('\n');
  main = replaceExactlyOnce(main, oldInstallBlock, newInstallBlock, 'main-update-install-flow');

  const healthAnchor = '    startupReady = true;';
  const healthCode = [
    "    startupReady = true;",
    "    const updateHealthFile=process.env.YUTANG_UPDATE_HEALTH_FILE;",
    "    const updateHealthNonce=process.env.YUTANG_UPDATE_HEALTH_NONCE;",
    "    const updateExpectedSha256=process.env.YUTANG_UPDATE_EXPECTED_SHA256;",
    "    if(updateHealthFile||updateHealthNonce||updateExpectedSha256){",
    "      if(!path.isAbsolute(updateHealthFile||'')||path.dirname(updateHealthFile)!==path.join(userData,'updates')||path.basename(updateHealthFile)!=='.health-'+updateHealthNonce+'.json'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(updateHealthNonce||'')||! /^[a-f0-9]{64}$/.test(updateExpectedSha256||''))throw new Error('新版更新健康确认参数无效。');",
    "      const runningSha256=createHash('sha256').update(await fs.readFile(process.execPath)).digest('hex');",
    "      if(runningSha256!==updateExpectedSha256)throw new Error('新版运行文件与签名清单不一致。');",
    "      const updateHealth={ready:true,nonce:updateHealthNonce,pid:process.pid,version:app.getVersion(),sha256:runningSha256,backendPid:backend.child.pid};",
    "      await fs.writeFile(updateHealthFile,JSON.stringify(updateHealth)+'\\n',{flag:'wx',mode:0o600});",
    "    }"
  ].join('\n');
  main = replaceExactlyOnce(main, healthAnchor, healthCode, 'main-update-health-signal');
  await write(mainPath, main);

  const trustTests = await read(path.join(repositoryRoot, 'tests/windows147-update-trust.test.mjs'));
  const upstreamTrustTests = trustTests
    .replace("../tools/windows147-update-patched/update-service.mjs", "../src/update-service.mjs")
    .replace("../tools/windows147-update-patched/update-launcher.mjs", "../src/update-launcher.mjs");
  if (upstreamTrustTests === trustTests || !upstreamTrustTests.includes("from '../src/update-service.mjs'") ||
      !upstreamTrustTests.includes("from '../src/update-launcher.mjs'")) {
    throw new Error('UPDATE_TRUST_TEST_IMPORT_REWRITE_FAILED');
  }
  await fs.mkdir(path.join(upstream, 'desktop/tests'), { recursive: true });
  await write(path.join(upstream, 'desktop/tests/update-trust.test.mjs'), upstreamTrustTests);
  await fs.rm(path.join(upstream, 'desktop/tests/update-service.test.mjs'), { force: true });

  const modified = {};
  for (const relative of ['desktop/src/update-service.mjs', 'desktop/src/update-launcher.mjs', 'desktop/src/main.mjs']) {
    modified[relative] = createHash('sha256').update(await fs.readFile(path.join(upstream, relative))).digest('hex');
  }
  const updateTrustTestsSha256 = createHash('sha256').update(await fs.readFile(path.join(upstream, 'desktop/tests/update-trust.test.mjs'))).digest('hex');
  const receipt = {
    schema: 'yutang.windows-update-trust-patch.v1',
    status: 'PASS_FAIL_CLOSED_UPDATE_TRUST_AND_HEALTH_HANDSHAKE_PATCH',
    upstreamRepository: 'LockyBee/dsh-douyin-agent',
    upstreamCommit: UPSTREAM_COMMIT,
    originalSourceGitBlobSha1: EXPECTED_BLOBS,
    modifiedSourceSha256: modified,
    updateTrustTestsSha256,
    updateRepository: 'yud78785/yutang-build',
    signedManifestRequired: true,
    manifestPublicKeyConfigured: false,
    authenticodePublisherThumbprintConfigured: false,
    updatesDisabledUntilTrustConfigured: true,
    startupHealthHandshake: true,
    startupHealthAfterRendererReady: true,
    stagedShortcutUntilHealthy: true,
    postSwitchRollbackWindowMs: 30000,
    normalExitDuringObservationAccepted: true,
    rollbackFailurePreservesBackupPath: true,
    release: false,
    executableBuilt: false,
    windowsTested: false
  };
  await write(path.join(upstream, 'windows-update-trust-patch-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const upstream = path.resolve(process.argv[2] || path.join(REPOSITORY_ROOT, 'upstream'));
  applyUpdateTrustPatch(upstream).then(receipt => {
    console.log('PASS_WINDOWS_UPDATE_TRUST_PATCH ' + JSON.stringify(receipt));
  }).catch(error => {
    console.error('FAIL_WINDOWS_UPDATE_TRUST_PATCH:', String(error?.message || error));
    process.exitCode = 1;
  });
}
