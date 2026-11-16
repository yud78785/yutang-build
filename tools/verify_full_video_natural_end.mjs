/** Only certifies the natural-ended event for the SAME previously sampled media element. */
export function verifyFullVideoNaturalEndEvent(s,{duration,previousTime}) {
 if(!s||s.kind!=='ORIGINAL_HTML_VIDEO_ENDED_EVENT'||s.eventSeen!==true||
    s.originalElementConnected!==true||s.ended!==true||
    s.loop!==false||s.seeking!==false||
    !Number.isFinite(duration)||duration<10||duration>7200||
    !Number.isFinite(previousTime)||previousTime<0||previousTime>duration||
    !Number.isFinite(s.startTime)||s.startTime<previousTime-.45||
    s.startTime>duration+.3||
    !Number.isFinite(s.endTime)||s.endTime<duration-.7||s.endTime>duration+.5||
    !Number.isFinite(s.actualDuration)||Math.abs(s.actualDuration-duration)>.35||
    !Number.isFinite(s.wallMs)||s.wallMs<0||s.wallMs>8500||
    !Number.isSafeInteger(s.decodedBefore)||!Number.isSafeInteger(s.decodedAfter)||
    s.decodedAfter<s.decodedBefore||s.decodedAfter<1)
     throw Object.assign(Error('FULL_VIDEO_NATURAL_END_EVENT_UNVERIFIED'),
       {code:'FULL_VIDEO_NATURAL_END_EVENT_UNVERIFIED'});
 return Object.freeze({...s,scope:'NATURAL_END_OF_ORIGINAL_VIDEO_ELEMENT',
  fullAudioTranscriptionVerified:false,wholeVideoSemanticUnderstandingVerified:false});
}
