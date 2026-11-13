import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNaturalEndEvent} from '../tools/run_video_tail_diagnostic.mjs';
const duration=1082.518;
const ok=()=>({kind:'ORIGINAL_HTML_VIDEO_ENDED_EVENT',eventSeen:true,
  originalElementConnected:true,ended:true,loop:false,seeking:false,
  duration,startTime:duration-7,endTime:duration,wallMs:6960,
  decodedBefore:32000,decodedAfter:32197});
test('terminal ended event is only proof for near-end diagnostic, never full video',()=>{
 const x=validateNaturalEndEvent(ok(),duration);
 assert.equal(x.verifiedAs,'TAIL_ONLY_HTML_VIDEO_ENDED_EVENT');
 assert.equal(x.wholeVideoPlaybackVerified,false);
 assert.equal(x.fullAudioTranscriptionVerified,false);
});
test('denies ended=false and fake end event',()=>{
 for(const patch of [{ended:false},{eventSeen:false},{kind:'TAIL_END_EVENT_TIMEOUT'}])
  assert.throws(()=>validateNaturalEndEvent({...ok(),...patch},duration));
});
test('denies paused/looped/reseeked playback',()=>{
 for(const patch of [{loop:true},{seeking:true},{originalElementConnected:false}])
  assert.throws(()=>validateNaturalEndEvent({...ok(),...patch},duration));
});
test('denies inconclusive near-end times and wrong duration',()=>{
 for(const patch of [{startTime:200},{endTime:1070},{duration:1000},{endTime:1100}])
  assert.throws(()=>validateNaturalEndEvent({...ok(),...patch},duration));
});
test('denies fake instant or excessive wall elapsed',()=>{
 for(const wallMs of [0,1000,17000,NaN])
  assert.throws(()=>validateNaturalEndEvent({...ok(),wallMs},duration));
});
test('denies stale or stationary video frame decode counter',()=>{
 for(const patch of [{decodedAfter:32000},{decodedAfter:32015},{decodedBefore:-1.5}])
  assert.throws(()=>validateNaturalEndEvent({...ok(),...patch},duration));
});
