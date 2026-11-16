import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFullVideoNaturalEndEvent} from '../tools/verify_full_video_natural_end.mjs';
const duration=1082.518, previousTime=1081.366499;
const sample=()=>({kind:'ORIGINAL_HTML_VIDEO_ENDED_EVENT',eventSeen:true,
  originalElementConnected:true,ended:true,loop:false,seeking:false,
  startTime:1081.46,endTime:1082.517,actualDuration:1082.518,
  decodedBefore:32630,decodedAfter:32661,wallMs:1120});
const run=v=>verifyFullVideoNaturalEndEvent(v,{duration,previousTime});
test('true original ended event adjacent to last segment is valid',()=>{
 const o=run(sample());assert.equal(o.scope,'NATURAL_END_OF_ORIGINAL_VIDEO_ELEMENT');
 assert.equal(o.fullAudioTranscriptionVerified,false);
});
test('cannot accept the mere terminal time or fabricated ended event',()=>{
 for(const fields of [{kind:'TERMINAL_TIME_ONLY'},{eventSeen:false},{ended:false},
   {originalElementConnected:false}]) assert.throws(()=>run({...sample(),...fields}));
});
test('rejects loop, seek, duration drift, reversed time',()=>{
 for(const fields of [{loop:true},{seeking:true},{endTime:1080},
   {startTime:1080},{actualDuration:1100},{endTime:1090}])
  assert.throws(()=>run({...sample(),...fields}));
});
test('rejects fake decoder and excessive wait',()=>{
 for(const fields of [{decodedAfter:32000},{decodedBefore:0.1},
   {decodedAfter:0},{wallMs:9000},{wallMs:-1}])
  assert.throws(()=>run({...sample(),...fields}));
});
test('past 2.5 minutes cannot replace continuously covered playback',()=>{
 assert.throws(()=>verifyFullVideoNaturalEndEvent(sample(),{duration,previousTime:1083}));
 assert.throws(()=>run({...sample(),startTime:550}));
});
