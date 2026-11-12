import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoverageAudit,appendCoverageSegment,endCoverageAudit,lineHash} from './full_video_coverage_audit.mjs';
const id='7577614489533680959',sha='a'.repeat(64);
const mk=()=>createCoverageAudit({videoId:id,durationSeconds:1082.518,initialTime:0.2,
  exeSha256:sha,windowsSourceSha:'b'.repeat(40),initialLocalSeek:true});
const seg=(index,before,after,more={})=>({
 index,videoId:id,before,after,playbackProgress:after-before,
 decodedBefore:index*700+1,decodedAfter:index*700+600,
 frameHashes:['1','2','3'].map(x=>x.repeat(64)),
 method:'video-canvas-jpeg-v1',wallSeconds:after-before,
 ...more});
test('real 18-minute duration with sufficient continuous segment ledger accepts only playback',()=>{
 const a=mk();let p=0.2;for(let i=0;i<55;i++){
 const n=Math.min(1081.5,p+19.66);appendCoverageSegment(a,seg(i,p,n));p=n;
 }
 const d=endCoverageAudit(a,{ended:true,videoId:id,time:1082.518,loop:false,seeking:false,decodedFrames:35000,finalWallMs:1082518});
 assert.equal(d.result,'PASS_PLAYBACK_TO_END_WITH_SAMPLED_VIDEO_FRAMES_ONLY');
 assert.equal(d.videoSemanticsPassed,false);
 assert.equal(d.fullAudioTranscriptVerified,false);
});
test('missing beginning or unapproved seek cannot start a full recording',()=>{
 assert.throws(()=>createCoverageAudit({videoId:id,durationSeconds:1082.518,initialTime:5,
   exeSha256:sha,windowsSourceSha:'b'.repeat(40),initialLocalSeek:true}),/AUDIT_START_UNTRUSTED/);
 assert.throws(()=>createCoverageAudit({videoId:id,durationSeconds:1082.518,initialTime:0.2,
   exeSha256:sha,windowsSourceSha:'b'.repeat(40),initialLocalSeek:false}),/AUDIT_START_UNTRUSTED/);
});
test('unexpected gap or rollback aborts',()=>{
 const a=mk();appendCoverageSegment(a,seg(0,.2,20.2));
 assert.throws(()=>appendCoverageSegment(a,seg(1,24,44)),/AUDIT_UNOBSERVED_GAP/);
 assert.throws(()=>appendCoverageSegment(a,seg(1,18.2,38.2)),/AUDIT_PLAYBACK_REWIND/);
});
test('no decoded progression and time mismatch refuse; duplicate still images can be valid video',()=>{
 for(const wrong of [
 {decodedAfter:1},{after:90},{wallSeconds:3}]){const a=mk();assert.throws(()=>appendCoverageSegment(a,seg(0,.2,20.2,wrong)));}
});
test('static scene may have repeated JPEG hashes while decoder timestamps progress',()=>{
 const a=mk();const e=seg(0,.2,20.2);
 e.frameHashes=['1'.repeat(64),'1'.repeat(64),'1'.repeat(64)];
 appendCoverageSegment(a,e);
 assert.equal(a.segments[0].frameHashes[1],e.frameHashes[1]);
});
test('merely near the end, loops, changed id and insufficient coverage are NOT pass',()=>{
 const a=mk();appendCoverageSegment(a,seg(0,.2,20.2));appendCoverageSegment(a,seg(1,20.2,40.2));
 for(const f of [
 {ended:false},{loop:true},{seeking:true},{videoId:'7577614489533680960'},
 {time:1081},{decodedFrames:0}
 ]){
 const good={ended:true,loop:false,seeking:false,videoId:id,time:1082.518,decodedFrames:36000,finalWallMs:1082518};
 assert.throws(()=>endCoverageAudit(a,{...good,...f}));
 }
 assert.throws(()=>endCoverageAudit(a,{ended:true,loop:false,seeking:false,videoId:id,time:1082.518,decodedFrames:36000,finalWallMs:1082518}),/AUDIT_TIMELINE_GAPPED/);
});
test('good bound audio provenance vs unavailable track',()=>{
 const a=mk();
 appendCoverageSegment(a,seg(0,.2,20.2,{audio:{outcome:'capture',before:.2,after:20.2,bytes:160000,sha256:'4'.repeat(64)}}));
 appendCoverageSegment(a,seg(1,20.2,40.2,{audio:{outcome:'unavailable'}}));
 assert.equal(a.audioSegments,1);assert.equal(a.audioFailures,1);
});
test('strong chain deterministic and rejects invalid previous anchor',()=>{
 let h='f'.repeat(64);
 const e={index:0,before:0.2,after:20};
 const n=lineHash(h,e);
 assert.match(n,/^[a-f0-9]{64}$/);assert.equal(n,lineHash(h,e));
 assert.notEqual(n,lineHash(h,{...e,after:21}));
 assert.throws(()=>lineHash('bad',e),/AUDIT_CHAIN_UNBOUND/);
});
