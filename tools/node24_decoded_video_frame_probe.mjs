#!/usr/bin/env node
// Actual HTMLVideoElement decoded-frame verification using locally generated WebM.
// Not a Douyin test. No model, account, API credential, or external network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs/promises';
import path from 'node:path';

const runtime = process.argv[2] && path.resolve(process.argv[2]);
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.YUTANG_EDGE_FIREWALL_CONFIRMED !== 'yes' || !runtime ||
    !path.isAbsolute(runtime)) throw Error('Only guarded ephemeral Windows CI is permitted.');
assert.equal(process.versions.node, '24.17.0', 'Bundled Node version mismatch.');
const require = createRequire(path.join(runtime, 'local-video-probe.cjs'));
assert.equal(require('playwright-core/package.json').version, '1.64.0-alpha-1790635538000');
const { chromium } = require('playwright-core');
const edgeExe = process.env.YUTANG_EDGE_EXE;
assert.ok(edgeExe && path.isAbsolute(edgeExe), 'Verified signed Edge path required.');
await fs.access(edgeExe);
const temp = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'yutang-decoded-frame-'));
const profile = path.join(temp, 'dedicated-profile');
const port = 9240;
let context;
function ownedEdgeCount() {
  const command = 'Get-CimInstance Win32_Process -Filter "Name = ' + "'msedge.exe'" + '" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress -Depth 3';
  const output = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',command], {
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024
  }).trim();
  if (!output) return 0;
  const parsed = JSON.parse(output);
  return (Array.isArray(parsed) ? parsed : [parsed]).filter(
    item => String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase())).length;
}
async function awaitClean() {
  for (let i = 0; i < 50; i++) {
    if (ownedEdgeCount() === 0) return true;
    await delay(250);
  }
  return false;
}
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath:edgeExe,headless:false,chromiumSandbox:true,viewport:{width:640,height:480},
    args:['--remote-debugging-port=' + port,'--remote-debugging-address=127.0.0.1',
      '--enable-features=NetworkServiceSandbox','--no-first-run','--no-default-browser-check'],
    timeout:30000
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('about:blank');
  await page.setContent('<!doctype html><html><body><video id="fixture" muted playsinline width="256" height="144"></video></body></html>');
  const proof = await page.evaluate(async () => {
    const video = document.getElementById('fixture');
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 108;
    const painter = canvas.getContext('2d',{alpha:false});
    if (!painter || !canvas.captureStream || typeof MediaRecorder !== 'function') throw Error('Browser cannot encode test video.');
    const mime = ['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    if (!mime) throw Error('No WebM recording codec supported.');
    const colors=['#f01818','#18e018','#1818f0'];
    const started=performance.now();
    const paint=()=>{
      const second=(performance.now()-started)/1000;
      const idx=Math.min(2,Math.floor(second/1.02));
      painter.fillStyle=colors[idx];painter.fillRect(0,0,192,108);
      painter.fillStyle='#ffffff';painter.fillRect(8+idx*50,12,16,16);
    };
    paint();
    const stream=canvas.captureStream(20);
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:750000});
    const pieces=[];
    recorder.addEventListener('dataavailable',event=>{if(event.data?.size)pieces.push(event.data);});
    const stopped=new Promise((resolve,reject)=>{
      recorder.addEventListener('stop',resolve,{once:true});
      recorder.addEventListener('error',()=>reject(Error('WebM recording error')),{once:true});
    });
    recorder.start(120);
    const timer=setInterval(paint,40);
    await new Promise(resolve=>setTimeout(resolve,3250));
    clearInterval(timer);
    recorder.stop(); await stopped;
    stream.getTracks().forEach(track=>track.stop());
    const blob=new Blob(pieces,{type:mime});
    if (blob.size < 3500) throw Error('Encoded WebM too small.');
    video.src=URL.createObjectURL(blob);
    await Promise.race([
      new Promise((resolve,reject)=>{
        if(video.readyState>=2)return resolve();
        video.addEventListener('loadeddata',resolve,{once:true});
        video.addEventListener('error',()=>reject(Error('Video decode error')),{once:true});
      }),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('Timed out loading encoded WebM')),10000))
    ]);
    if(video.videoWidth<100||video.videoHeight<50)throw Error('Decoded HTMLVideoElement has no dimensions.');
    const outputCanvas=document.createElement('canvas');
    outputCanvas.width=video.videoWidth;outputCanvas.height=video.videoHeight;
    const output=outputCanvas.getContext('2d',{willReadFrequently:true});
    if(!output)throw Error('Decoded frame canvas unavailable.');
    const frames=[];
    const found=new Set();
    await video.play();
    const begin=performance.now();
    while(found.size<3 && performance.now()-begin<7000) {
      await new Promise(resolve=>setTimeout(resolve,75));
      if(video.readyState<2)continue;
      output.drawImage(video,0,0,outputCanvas.width,outputCanvas.height);
      const px=Array.from(output.getImageData(128,65,1,1).data).slice(0,3);
      let color=null;
      if(px[0]>px[1]+60&&px[0]>px[2]+60) color='red';
      if(px[1]>px[0]+60&&px[1]>px[2]+60) color='green';
      if(px[2]>px[0]+60&&px[2]>px[1]+60) color='blue';
      if(color && !found.has(color)) {
        found.add(color);
        const jpeg=outputCanvas.toDataURL('image/jpeg',0.78);
        if(jpeg.length<800||!jpeg.startsWith('data:image/jpeg;base64,'))throw Error('Canvas did not capture JPEG image of decoded video.');
        const q=typeof video.getVideoPlaybackQuality==='function'?video.getVideoPlaybackQuality():null;
        frames.push({color,time:video.currentTime,pixel:px,decodedFrames:q?.totalVideoFrames??null,jpeg});
      }
    }
    video.pause();
    return {mime,encodedBytes:blob.size,videoWidth:video.videoWidth,videoHeight:video.videoHeight,
      videoDuration:Number.isFinite(video.duration)?video.duration:null,
      playbackTime:video.currentTime,paused:video.paused,frames};
  });
  assert.ok(proof.encodedBytes>3500 && proof.videoWidth>=100 && proof.videoHeight>=50);
  assert.deepEqual(proof.frames.map(x=>x.color),['red','green','blue'],'Observed frames do not match red->green->blue decoded video timeline.');
  assert.ok(proof.frames.every(x=>Number.isFinite(x.time)), 'Missing decoded playback timestamps.');
  assert.ok(proof.frames[0].time<proof.frames[1].time && proof.frames[1].time<proof.frames[2].time,'Video timestamps did not advance.');
  assert.ok(proof.playbackTime>1.7,'Video playback never advanced sufficiently.');
  const frameDigests=proof.frames.map(x=>createHash('sha256').update(x.jpeg).digest('hex'));
  assert.equal(new Set(frameDigests).size,3,'Decoded frame image digests did not change.');

  // Call the production Core native capture method on the same decoded local WebM.
  // Video identity is synthetic and explicitly does NOT represent Douyin.
  const core=await import(pathToFileURL(path.join(runtime,'core.mjs')).href);
  assert.equal(typeof core.BrowserController,'function');
  assert.equal(typeof core.verifySharedVideoFrameProof,'function');
  const fixtureId='1234567890123456789';
  const controller=Object.create(core.BrowserController.prototype);
  controller.source='verification';
  controller.page=page;
  controller.checkVideoLimits=async()=>{};
  controller.currentVideo=async()=>page.locator('video');
  controller.state=async()=>{
    const state=await page.evaluate(()=>{
      const v=document.getElementById('fixture');
      return {paused:v.paused,readyState:v.readyState,time:v.currentTime,duration:v.duration};
    });
    return {video:{id:fixtureId,...state},videoSelection:{identityConflict:false},
      loginRequired:false,verificationRequired:false,privateChatVisible:false,unsupportedPage:false};
  };
  await page.evaluate(async()=>{
    const v=document.getElementById('fixture');
    const reset=new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));
    v.currentTime=0;
    await reset;
    await v.play();
  });
  const observed=await controller.captureSharedFrames(2.2);
  assert.equal(observed.frames.length,3,'Native Core must capture three real video frames.');
  assert.equal(observed.observation.captureMethod,'video-canvas-jpeg-v1');
  assert.equal(core.verifySharedVideoFrameProof(observed,fixtureId),true,'Native Core frame proof was rejected.');
  assert.equal(core.verifySharedVideoFrameProof(structuredClone(observed),fixtureId),false,'Copied proof must be rejected.');
  const coreFrames=[];
  for(let i=0;i<observed.frames.length;i++){
    const fr=observed.frames[i];
    const px=await page.evaluate(async data=>{
      const img=new Image();img.src='data:image/jpeg;base64,'+data;
      await img.decode();
      const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
      const g=cv.getContext('2d',{willReadFrequently:true});
      g.drawImage(img,0,0);
      return Array.from(g.getImageData(128,65,1,1).data).slice(0,3);
    },fr.data);
    const color=['red','green','blue'][i];
    assert.ok(px[i]>px[(i+1)%3]+55&&px[i]>px[(i+2)%3]+55,
      'Core '+color+' pixel does not match decoded video at '+fr.time+' sec: '+px.join(','));
    coreFrames.push({color,time:fr.time,pixel:px,method:fr.captureMethod,sha256:createHash('sha256').update(fr.data).digest('hex')});
  }
  assert.ok(observed.observation.playbackProgressSeconds>1.5,'Native Core did not verify playback progress.');
  await page.evaluate(()=>document.getElementById('fixture').pause());
  await assert.rejects(controller.captureSharedFrames(0.2),/分享|视频|播放|采样/);
  console.log('YUTANG_CORE_NATIVE_VIDEO_CAPTURE_RESULT '+JSON.stringify({
    verdict:'PASS_CORE_NATIVE_FRAME_CAPTURE_ON_LOCAL_WEBM',fixture:'synthetic local WebM, not Douyin',
    frameCount:observed.frames.length,captureMethod:observed.observation.captureMethod,
    playbackProgressSeconds:observed.observation.playbackProgressSeconds,
    actualWallSeconds:observed.observation.actualWallSeconds,originalProofVerified:true,
    serializedCopyProofRejected:true,pausedVideoRejected:true,frames:coreFrames,
    notProven:['Full YuTang desktop-to-Core invocation','Real public Douyin video','Model understands frames']
  }));
  await page.evaluate(()=>URL.revokeObjectURL(document.getElementById('fixture').src));
  console.log('YUTANG_DECODED_VIDEO_FRAME_RESULT '+JSON.stringify({
    verdict:'PASS_REAL_DECODED_LOCAL_VIDEO',node:process.versions.node,
    playwright:require('playwright-core/package.json').version,
    mediaSource:'local Canvas MediaRecorder WebM; NOT Douyin',
    networkBlocked:true,realAccount:false,modelKey:false,
    encodedBytes:proof.encodedBytes,videoWidth:proof.videoWidth,videoHeight:proof.videoHeight,
    videoDuration:proof.videoDuration,playbackTime:proof.playbackTime,
    frames:proof.frames.map((x,i)=>({color:x.color,time:x.time,pixel:x.pixel,decodedFrames:x.decodedFrames,sha256:frameDigests[i]})),
    notProven:['Full YuTang desktop-to-Core integration','Public Douyin playback','Model understands these pictures','Network Service native Windows token restrictions']
  }));
} finally {
  if(context)await context.close();
  const clean=await awaitClean();
  await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});
  if(!clean)throw Error('Dedicated video probe left Edge profile process behind.');
  console.log('DECODED_VIDEO_PROBE_CLEANUP: no owned Edge profile process remains.');
}
