// Full-playback proof for ONE public video on an ephemeral GitHub-hosted Windows
// candidate. This does NOT claim every frame or the full audio is understood.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createCoverageAudit,appendCoverageSegment,endCoverageAudit,lineHash} from './full_video_coverage_audit.mjs';
import {verifyFullVideoNaturalEndEvent} from './verify_full_video_natural_end.mjs';

const ID='7577614489533680959';
const HEAD='00f5ac8d560f8459f333cadeb9e9cb227cfaeca6';
const hash=b=>createHash('sha256').update(b).digest('hex');

export async function coverFullPublicVideo({controller,verifyFrameProof,evidenceDir,
    referenceDurationSeconds,exeSha256}){
 if(!controller||typeof controller.captureSharedFrames!=='function'||
    typeof verifyFrameProof!=='function'||!Number.isFinite(referenceDurationSeconds))
   throw Error('FULL_VIDEO_RUNTIME_MISSING');
 const ledgerFile=path.join(evidenceDir,'full-coverage-ledger.jsonl');
 await fs.writeFile(ledgerFile,'',{flag:'wx'});
 let lastChain='0'.repeat(64);
 const log=async (data)=>{
  const h=lineHash(lastChain,data);
  await fs.appendFile(ledgerFile,JSON.stringify({data,chain:h})+'\n');
  lastChain=h;
 };
 const strict=async()=>{
  const st=await controller.state({record:false});
  let u;try{u=new URL(controller.page.url());}catch{throw Error('FULL_VIDEO_URL_INVALID');}
  if(u.protocol!=='https:'||u.hostname!=='www.douyin.com'||
    u.pathname!=='/video/'+ID||
    st.loginRequired||st.verificationRequired||st.privateChatVisible||
    st.unsupportedPage||st.livePreview?.recognized===true||
    st.video?.id!==ID||!(st.video.readyState>=2))
   throw Error('FULL_VIDEO_ID_OR_ACCESS_CHANGED');
  return st;
 };
 await strict();
 // One auditable local player reset to t=0 (no network/account write or DRM bypass).
 const locator=await controller.currentVideo();
 const reset=await locator.evaluate(async v=>{
  const prop=(name)=>Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,name);
  const get=(name)=>prop(name)?.get?.call(v);
  const set=(name,value)=>prop(name)?.set?.call(v,value);
  if(!v.isConnected||get('readyState')<2||
    !Number.isFinite(get('duration'))||get('duration')<30)
   throw Error('FULL_VIDEO_CURRENT_ELEMENT_NOT_READY');
  const earlierTime=get('currentTime');
  set('loop',false);set('currentTime',0);
  for(let n=0;n<80;n++){
   if(!get('seeking')&&get('currentTime')<0.4)break;
   await new Promise(done=>setTimeout(done,50));
  }
  if(get('seeking')||get('currentTime')>0.5)throw Error('FULL_VIDEO_START_SEEK_NOT_SETTLED');
  await v.play();
  return {earlierTime,atTime:get('currentTime'),duration:get('duration'),
    loop:get('loop'),seeking:get('seeking'),paused:get('paused')};
 });
 const state=await strict();
 if(reset.loop!==false||reset.seeking!==false||reset.paused!==false||
   reset.atTime>1||state.video.time>1.25||
   Math.abs(state.video.duration-referenceDurationSeconds)>0.25)
  throw Error('FULL_VIDEO_START_NOT_VERIFIED');
 const audit=createCoverageAudit({videoId:ID,durationSeconds:referenceDurationSeconds,
  initialTime:state.video.time,initialLocalSeek:true,
  exeSha256,windowsSourceSha:HEAD});
 await log({stage:'BEGIN',videoId:ID,initialVideoTime:state.video.time,
  previousVideoTime:reset.earlierTime,oneLocalPlaybackReset:true,
  sourceHead:HEAD,exeSha256,durationSeconds:referenceDurationSeconds});
 const startWall=Date.now(),deadline=startWall+26*60*1000;
 let audioUnavailable=false;
 for(let n=0;n<75;n++){
  if(Date.now()>deadline)throw Error('FULL_VIDEO_WALL_BUDGET_EXCEEDED');
  const current=await strict();
  if(current.video.ended===true)break;
  if(current.video.paused===true)throw Error('FULL_VIDEO_PAUSED');
  const remaining=audit.durationSeconds-current.video.time;
  if(remaining<=1.5)break;
  const seconds=Math.min(20,remaining-1.2);
  if(seconds<0.2)break;
  const signal=AbortSignal.timeout(Math.ceil((seconds+15)*1000));
  const [vid,aud]=await Promise.allSettled([
   controller.captureSharedFrames(seconds,signal),
   audioUnavailable?Promise.resolve(null):controller.captureAudio(seconds,signal)
  ]);
  if(vid.status!=='fulfilled')
   throw Error('FULL_VIDEO_CAPTURE_FAILED_'+String(vid.reason?.code||vid.reason?.name||'unknown').slice(0,50));
  const observed=vid.value,frames=observed?.frames;
  if(!verifyFrameProof(observed,ID)||!Array.isArray(frames)||frames.length!==3||
    frames.some(f=>f.videoId!==ID||f.captureMethod!=='video-canvas-jpeg-v1'||f.mimeType!=='image/jpeg'))
   throw Error('FULL_VIDEO_UNVERIFIED_FRAME_SOURCE');
  const before=frames[0].captureInterval.before,after=frames[2].captureInterval.after;
  if(before.paused!==false||after.paused!==false||before.seeking||after.seeking||
    before.loop!==false||after.loop!==false||
    Math.abs(before.duration-audit.durationSeconds)>.3||
    Math.abs(after.duration-audit.durationSeconds)>.3)
   throw Error('FULL_VIDEO_PLAYER_TIME_UNTRUSTED');
  const jpegHashes=frames.map(f=>{
   const bytes=Buffer.from(f.data,'base64');
   if(bytes.length<100||bytes.length>2_000_000||bytes[0]!==0xff||bytes[1]!==0xd8)
    throw Error('FULL_VIDEO_JPEG_INVALID');
   return hash(bytes);
  });
  let audio={outcome:'unavailable'};
  if(aud.status==='fulfilled'&&aud.value){
   const a=aud.value,buffer=typeof a.data==='string'?Buffer.from(a.data,'base64'):null;
   if(a.videoId===ID&&buffer?.length>0&&buffer.length<2_000_000&&
     Number.isFinite(a.beforeTime)&&Number.isFinite(a.afterTime)){
    audio={outcome:'capture',before:a.beforeTime,after:a.afterTime,
      sha256:hash(buffer),bytes:buffer.length};
   }
  }
  if(audio.outcome==='unavailable')audioUnavailable=true;
  const entry=appendCoverageSegment(audit,{
   index:n,videoId:ID,before:before.time,after:after.time,
   playbackProgress:observed.observation?.playbackProgressSeconds,
   decodedBefore:before.decodedFrames,decodedAfter:after.decodedFrames,
   wallSeconds:observed.observation?.actualWallSeconds,
   frameHashes:jpegHashes,method:'video-canvas-jpeg-v1',audio
  });
  await log({stage:'SEGMENT',...entry});
  if(n%5===0)console.log('FULL_VIDEO_SEGMENT '+JSON.stringify({
   index:n,endTime:entry.after,duration:audit.durationSeconds,
   audioSegments:audit.audioSegments,totalFrames:(n+1)*3}));
  // Register the original element's ended listener BEFORE an application-driven
  // autoplay/next-video transition can change controller.state() at the boundary.
  if(audit.durationSeconds-entry.after<=2.0)break;
 }
 // Do not poll controller.state() once the original video is <2s from ending:
 // the Douyin application may replace the current page/video before that poll.
 // Instead, await the native ended event on the EXACT original video element.
 let terminal;
 try {
  terminal=await locator.evaluate(async video=>{
   const beginTime=video.currentTime;
   const decodedBefore=Math.floor(video.getVideoPlaybackQuality?.().totalVideoFrames??0);
   const start=performance.now();
   return await new Promise(resolve=>{
    let finished=false,timeout,interval;
    const finish=kind=>{
     if(finished)return;finished=true;
     clearTimeout(timeout);clearInterval(interval);
     video.removeEventListener('ended',onEnded,true);
     resolve({kind,eventSeen:kind==='ORIGINAL_HTML_VIDEO_ENDED_EVENT',
      originalElementConnected:video.isConnected,ended:video.ended,
      loop:video.loop,seeking:video.seeking,
      startTime:beginTime,endTime:video.currentTime,
      actualDuration:video.duration,decodedBefore,
      decodedAfter:Math.floor(video.getVideoPlaybackQuality?.().totalVideoFrames??0),
      wallMs:performance.now()-start});
    };
    const onEnded=()=>finish('ORIGINAL_HTML_VIDEO_ENDED_EVENT');
    // Fail closed for an already ended video: the event was not observed.
    if(video.ended)return finish('TERMINAL_STATE_ALREADY_ENDED');
    video.addEventListener('ended',onEnded,true);
    interval=setInterval(()=>{
     if(!video.isConnected)return finish('ORIGINAL_VIDEO_ELEMENT_DETACHED');
     if(video.currentTime<beginTime-.4)return finish('ORIGINAL_VIDEO_REWOUND_OR_REPLACED');
    },65);
    timeout=setTimeout(()=>finish('ORIGINAL_VIDEO_END_EVENT_TIMEOUT'),8000);
   });
  });
 } catch(err) {
  await log({stage:'TAIL_EVALUATION_ERROR',
   category:'VIDEO_ELEMENT_EVALUATION_FAILED_NO_END_EVENT_PROOF'});
  throw Object.assign(Error('FULL_VIDEO_TAIL_EVALUATION_FAILED'),
   {code:'FULL_VIDEO_TAIL_EVALUATION_FAILED'});
 }
 // Save original terminal evidence even on rejection so a failed real Windows
 // artifact can distinguish auto-next, detachment, missing event and a true END.
 await log({stage:'TAIL_SNAPSHOT',snapshot:terminal});
 const verifiedEnd=verifyFullVideoNaturalEndEvent(terminal,{
  duration:audit.durationSeconds,previousTime:audit.priorEnd});
 const tail={ended:verifiedEnd.ended,loop:verifiedEnd.loop,
  seeking:verifiedEnd.seeking,currentTime:verifiedEnd.endTime,
  decodedFrames:verifiedEnd.decodedAfter};
 const result=endCoverageAudit(audit,{ended:tail.ended,loop:tail.loop,
  seeking:tail.seeking,videoId:ID,time:tail.currentTime,
  decodedFrames:tail.decodedFrames,finalWallMs:Date.now()-startWall});
 await log({stage:'END',result,terminalEvidence:verifiedEnd});
 const output={...result,endEventEvidence:verifiedEnd,ledgerChainSha256:lastChain,
  lastRecordedAt:new Date().toISOString(),
  allIndividualFramesUnderstood:false,fullAudioTranscribed:false};
 await fs.writeFile(path.join(evidenceDir,'full-playback-result.json'),
   JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 console.log('FULL_VIDEO_PLAYBACK_PROVED '+JSON.stringify({
  result:result.result,durationSeconds:result.expectedDurationSeconds,
  samples:result.sampledVideoFrames,segments:result.segments,
  audioSegments:result.audioSegments,modelInference:false}));
 return output;
}
