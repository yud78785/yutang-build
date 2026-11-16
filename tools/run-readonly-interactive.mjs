// Interactive Windows wrapper: handles user input entirely inside Node.js,
// never interpolating untrusted text into a CMD shell command.
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {readExistingDouyinComments} from './read-existing-douyin-comments.mjs';
const rl=createInterface({input:stdin,output:stdout});
let value='';
try{value=(await rl.question('Enter Douyin numeric video ID (10-30 digits): ')).trim();}
finally{rl.close();}
const receipt=await readExistingDouyinComments({argv:['--video-id',value]});
stdout.write(JSON.stringify(receipt)+'\n',()=>{process.exitCode=receipt.status==='read_only_evidence'?0:2});
