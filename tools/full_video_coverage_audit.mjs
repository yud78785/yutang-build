import {createHash} from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/;
const ID=/^\d{10,30}$/;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const fail=(message)=>{throw Object.assign(new Error(message),{code:message});};
const near=(x,y,tol)=>Math.abs(x-y)<=tol;
const safe=(s)=>typeof s==='string'&&s.length<=64;

export function createCoverageAudit({videoId,durationSeconds,initialTime,exeSha256,windowsSourceSha,initialLocalSeek=false}={}){
 if(!ID.test(videoId||'')||!finite(durationSeconds)||durationSeconds<10||durationSeconds>7200||
  !finite(initialTime)||initialTime<0||initialTime>1.25||!HASH.test(exeSha256||'')||
  !/^[a-f0-9]{40}$/.test(windowsSourceSha||'')||initialLocalSeek!==true)fail('AUDIT_START_UNTRUSTED');
 const a={
  schemaVersion:1,mode:'PLAYBACK_TO_END_WITH_INTERVAL_FRAME_HASHES',
  videoId,durationSeconds,initialTime,initialLocalSeek,
  exeSha256,windowsSourceSha,
  priorEnd:initialTime,segments:[],maxGapSeconds:0,totalGapsSeconds:0,
  audioCoverageSeconds:0,audioSegments:0,audioFailures:0,source:'actual-candidate-runtime',
  realModelInferencePerformed:false,fullSemanticUnderstandingVerified:false,
  fullAudioTranscriptionVerified:false,
 };
 return a;
}
export function appendCoverageSegment(a,s){
 if(!a||!Array.isArray(a.segments)||a.segments.length>=100)fail('AUDIT_SEGMENT_LIMIT');
 const expectedIndex=a.segments.length;
 if(!s||s.index!==expectedIndex||s.videoId!==a.videoId||
  !finite(s.before)||!finite(s.after)||!(s.after>s.before)||
  !finite(s.playbackProgress)||s.playbackProgress<=0.1||s.playbackProgress>30.5||
  !finite(s.decodedBefore)||!finite(s.decodedAfter)||s.decodedAfter<=s.decodedBefore||
  !Array.isArray(s.frameHashes)||s.frameHashes.length!==3||!s.frameHashes.every(h=>HASH.test(h))||
  s.after>a.durationSeconds+0.5||
  !safe(s.method)||s.method!=='video-canvas-jpeg-v1'||
  !finite(s.wallSeconds)||s.wallSeconds<0.2||s.wallSeconds>45)fail('AUDIT_SEGMENT_INVALID');
 if(s.before<a.priorEnd-0.2)fail('AUDIT_PLAYBACK_REWIND');
 const gap=s.before-a.priorEnd;
 if(gap>1.8)fail('AUDIT_UNOBSERVED_GAP');
 if(Math.abs((s.after-s.before)-s.playbackProgress)>1)fail('AUDIT_PROGRESS_INCONSISTENT');
 if(!near(s.playbackProgress,s.wallSeconds,Math.max(2.5,s.wallSeconds*.25)))fail('AUDIT_HOST_CLOCK_INCONSISTENT');
 a.maxGapSeconds=Math.max(a.maxGapSeconds,Math.max(0,gap));
 a.totalGapsSeconds+=Math.max(0,gap);
 const entry={index:s.index,videoId:s.videoId,before:s.before,after:s.after,
  playbackProgress:s.playbackProgress,decodedBefore:s.decodedBefore,
  decodedAfter:s.decodedAfter,frameHashes:[...s.frameHashes],
  method:s.method,wallSeconds:s.wallSeconds,
  ...(s.audio?{audio:s.audio}:{})};
 if(s.audio){
  if(s.audio.outcome==='capture'){
   if(!finite(s.audio.before)||!finite(s.audio.after)||s.audio.after<=s.audio.before||
     !HASH.test(s.audio.sha256||'')||!finite(s.audio.bytes)||s.audio.bytes<=0||
     Math.abs(s.audio.before-s.before)>2.5||
     Math.abs(s.audio.after-s.after)>2.5)fail('AUDIT_AUDIO_UNBOUND');
   a.audioSegments++;a.audioCoverageSeconds+=s.audio.after-s.audio.before;
  } else if(s.audio.outcome==='unavailable')a.audioFailures++;
  else fail('AUDIT_AUDIO_OUTCOME_INVALID');
 }
 a.segments.push(entry);a.priorEnd=s.after;
 return entry;
}
export function endCoverageAudit(a,{ended,videoId,time,loop,seeking,decodedFrames,finalWallMs}={}){
 if(!a||!Array.isArray(a.segments)||a.segments.length<2)fail('AUDIT_NO_COVERAGE');
 if(ended!==true||loop!==false||seeking!==false||videoId!==a.videoId||
  !finite(time)||time<a.durationSeconds-0.7||time>a.durationSeconds+0.5||
  !Number.isSafeInteger(decodedFrames)||decodedFrames<1||
  !finite(finalWallMs)||finalWallMs<=0||finalWallMs>35*60*1000)
   fail('AUDIT_END_UNPROVEN');
 if(a.priorEnd<a.durationSeconds-1.8||time<a.priorEnd||a.totalGapsSeconds>Math.max(20,a.segments.length*.65))
   fail('AUDIT_TIMELINE_GAPPED');
 return {
  schemaVersion:1,
  result:'PASS_PLAYBACK_TO_END_WITH_SAMPLED_VIDEO_FRAMES_ONLY',
  videoId:a.videoId,expectedDurationSeconds:a.durationSeconds,
  playbackTimeAtEnd:time,firstTime:a.initialTime,lastCapturedTime:a.priorEnd,
  segments:a.segments.length,sampledVideoFrames:a.segments.length*3,
  maxBoundaryGapSeconds:a.maxGapSeconds,totalBoundaryGapsSeconds:a.totalGapsSeconds,
  audioSegments:a.audioSegments,audioCoverageSeconds:a.audioCoverageSeconds,
  audioFailures:a.audioFailures,exeSha256:a.exeSha256,windowsSourceSha:a.windowsSourceSha,
  fullAudioTranscriptVerified:false,allIndividualVideoFramesReviewed:false,
  videoSemanticsPassed:false,modelInferencePerformed:false,
  notAFullMultimediaUnderstandingPass:true,
 };
}
export function lineHash(previous,entry){
 if(!HASH.test(previous))fail('AUDIT_CHAIN_UNBOUND');
 return createHash('sha256').update(previous+'\n'+JSON.stringify(entry)+'\n').digest('hex');
}
