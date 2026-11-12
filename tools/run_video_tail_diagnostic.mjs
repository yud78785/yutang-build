/** A bounded, seek-to-near-end diagnostic ONLY; NOT whole-video acceptance. */
import fs from 'node:fs/promises';
import path from 'node:path';

const VIDEO_ID='7577614489533680959';
const HEX64=/^[a-f0-9]{64}$/;
export function validateNaturalEndEvent(value,expectedDuration) {
 if(!value||value.kind!=='ORIGINAL_HTML_VIDEO_ENDED_EVENT'||
   value.eventSeen!==true||value.originalElementConnected!==true||
   value.ended!==true||value.loop!==false||value.seeking!==false||
   !Number.isFinite(expectedDuration)||expectedDuration<30||expectedDuration>7200||
   !Number.isFinite(value.duration)||Math.abs(value.duration-expectedDuration)>.35||
   !Number.isFinite(value.startTime)||value.startTime<expectedDuration-10||
   value.startTime>expectedDuration-4||
   !Number.isFinite(value.endTime)||value.endTime<expectedDuration-.75||
   value.endTime>expectedDuration+.5||
   !Number.isFinite(value.wallMs)||value.wallMs<3000||value.wallMs>16000||
   !Number.isSafeInteger(value.decodedBefore)||!Number.isSafeInteger(value.decodedAfter)||
   value.decodedAfter-value.decodedBefore<20)
    throw Error('TAIL_NATURAL_END_EVENT_UNVERIFIED');
 return Object.freeze({...value,verifiedAs:'TAIL_ONLY_HTML_VIDEO_ENDED_EVENT',
   wholeVideoPlaybackVerified:false,fullAudioTranscriptionVerified:false,
   fullVideoSemanticUnderstandingVerified:false});
}
export async function runTailOnlyDiagnostic({controller,evidenceDir,referenceDurationSeconds,exeSha256}) {
 if(!controller||!controller.page||!Number.isFinite(referenceDurationSeconds)||
   !HEX64.test(exeSha256||''))throw Error('TAIL_INPUT_INVALID');
 const filename=path.join(evidenceDir,'tail-diagnostic.json');
 const report={schemaVersion:1,scope:'TAIL_ONLY_SAMPLED_LAST_SECONDS',
   videoId:VIDEO_ID,referenceDurationSeconds,exeSha256,
   wholeVideoPlaybackVerified:false,fullAudioTranscriptionVerified:false,
   fullVideoSemanticUnderstandingVerified:false,outcome:'PENDING'};
 try {
   const state=await controller.state({record:false});
   const u=new URL(controller.page.url());
   if(u.protocol!=='https:'||u.hostname!=='www.douyin.com'||
     u.pathname!=='/video/'+VIDEO_ID||state.video?.id!==VIDEO_ID||
     state.video.readyState<2||state.loginRequired||state.verificationRequired||
     state.privateChatVisible||state.unsupportedPage||state.livePreview?.recognized)
      throw Error('TAIL_PUBLIC_IDENTITY_INVALID');
   const locator=await controller.currentVideo();
   const observed=await locator.evaluate(async(video,{duration})=>{
     const measure=()=>({time:video.currentTime,duration:video.duration,
       ended:video.ended,seeking:video.seeking,loop:video.loop,
       connected:video.isConnected,
       decoded:Math.floor(video.getVideoPlaybackQuality?.().totalVideoFrames??0)});
     if(!video.isConnected||video.readyState<2||
       !Number.isFinite(video.duration)||Math.abs(video.duration-duration)>.35)
       return {kind:'TAIL_START_INVALID'};
     video.loop=false;
     video.currentTime=Math.max(0,duration-7);
     const seekStart=performance.now();
     while(video.seeking&&performance.now()-seekStart<4500)
       await new Promise(resolve=>setTimeout(resolve,40));
     const begin=measure();
     if(begin.seeking||Math.abs(begin.time-(duration-7))>1.25)
       return {kind:'TAIL_SEEK_UNVERIFIED',startTime:begin.time};
     const started=performance.now();
     const event=await new Promise(resolve=>{
       let done=false,timeout,interval;
       const finish=(kind)=>{
         if(done)return;done=true;
         clearInterval(interval);clearTimeout(timeout);
         video.removeEventListener('ended',onEnded,true);
         resolve({kind,eventSeen:kind==='ORIGINAL_HTML_VIDEO_ENDED_EVENT',
           originalElementConnected:video.isConnected,startTime:begin.time,
           endTime:video.currentTime,duration:video.duration,ended:video.ended,
           loop:video.loop,seeking:video.seeking,decodedBefore:begin.decoded,
           decodedAfter:Math.floor(video.getVideoPlaybackQuality?.().totalVideoFrames??0),
           wallMs:performance.now()-started});
       };
       const onEnded=()=>finish('ORIGINAL_HTML_VIDEO_ENDED_EVENT');
       video.addEventListener('ended',onEnded,true);
       interval=setInterval(()=>{
         if(!video.isConnected)return finish('TAIL_VIDEO_ELEMENT_DETACHED');
         if(video.currentTime<begin.time-1)return finish('TAIL_AUTOSWITCH_OR_REWIND');
       },80);
       timeout=setTimeout(()=>finish('TAIL_END_EVENT_TIMEOUT'),15000);
       Promise.resolve(video.play()).catch(()=>finish('TAIL_PLAY_REJECTED'));
     });
     return event;
   },{duration:referenceDurationSeconds});
   report.observed=observed;
   report.verified=validateNaturalEndEvent(observed,referenceDurationSeconds);
   report.outcome='PASS_TAIL_EVENT_ONLY_NOT_FULL_VIDEO';
 } catch(err) {
   report.outcome='FAIL_TAIL_DIAGNOSTIC';
   const match=String(err?.message||'').match(/\bTAIL_[A-Z0-9_]+\b/);
   report.errorCode=match?.[0]||'TAIL_BROWSER_EVALUATION_FAILURE';
 } finally {
   await fs.writeFile(filename,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 }
 if(report.outcome!=='PASS_TAIL_EVENT_ONLY_NOT_FULL_VIDEO')
   throw Error(report.errorCode||'TAIL_DIAGNOSTIC_FAILED');
 return report;
}
