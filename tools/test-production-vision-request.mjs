import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from '../upstream/storyboard/vendor/jpeg-js/index.js';
import { ApiAgent } from '../upstream/api-agent.mjs';

const VIDEO_ID = '7577614489533680959';
const KEY = 'fixture-only-never-a-real-api-key';
const SHARE_DISABLED = { enabled:false, paused:true, dailyRemaining:0, recipients:[] };
const COMMENT_DISABLED = { enabled:false, paused:true, remainingDaily:0, remainingSession:0 };

function makeObservation() {
  const width = 320, height = 560;
  const frames = [0,1,2].map(index => {
    const data = Buffer.alloc(width * height * 4);
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      const at = (y * width + x) * 4;
      data[at] = index === 0 ? 210 : 30;
      data[at+1] = index === 1 ? 210 : 30;
      data[at+2] = index === 2 ? 210 : 30;
      data[at+3] = 255;
    }
    return {
      mimeType:'image/jpeg',
      data:jpeg.encode({width,height,data},80).data.toString('base64'),
      videoId:VIDEO_ID,
      time:1 + index * 1.1,
    };
  });
  return {
    state:{
      url:'https://www.douyin.com/video/' + VIDEO_ID,
      loginRequired:false,
      verificationRequired:false,
      privateChatVisible:false,
      unsupportedPage:false,
      video:{id:VIDEO_ID,url:'https://www.douyin.com/video/' + VIDEO_ID,time:3.2,duration:1082.5,readyState:4,paused:false},
    },
    frames,
    observation:{videoId:VIDEO_ID,beforeTime:1,afterTime:3.2,actualWallSeconds:2.3},
  };
}

const decision = {
  action:'stop',
  reason:'三帧中可见一段食品烹饪画面。',
  topics:[{topic:'烹饪',signal:'neutral'}],
  reflection:'这是有限采样，只能描述可见画面，不能推断整条视频。',
};

function response(content, finishReason='stop', usage={prompt_tokens:41,completion_tokens:13,total_tokens:54}, extra={}) {
  return new Response(JSON.stringify({
    choices:[{finish_reason:finishReason,message:{content:typeof content==='string'?content:JSON.stringify(content),...extra}}],
    usage,
  }),{headers:{'content-type':'application/json'}});
}

test('生产 ApiAgent.decideWatch 真实请求分支发送三帧分镜、只接收决策且不执行工具', async () => {
  const requests=[],usageRecords=[];
  let toolExecutions=0;
  const agent=new ApiAgent({
    controller:{execute:async()=>{toolExecutions++;throw new Error('该测试禁止执行工具');}},
    config:{apiKey:KEY,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
    fetchImpl:async(url,options)=>{
      requests.push({url,options,body:JSON.parse(options.body)});
      return response(decision);
    },
    usageLedger:{record:value=>usageRecords.push(value)},
    maxFrames:3,
    maxTokens:1200,
  });
  const result=await agent.decideWatch({
    observation:makeObservation(),
    context:'测试人格上下文，不含任何凭据。',
    watchOptions:{mode:'recommend',topics:[],exclude:[]},
    shareContext:SHARE_DISABLED,
    commentContext:COMMENT_DISABLED,
  });
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://api.deepseek.com/chat/completions');
  assert.equal(requests[0].options.method,'POST');
  assert.equal(requests[0].options.redirect,'error');
  assert.equal(requests[0].options.headers.authorization,'Bearer '+KEY);
  assert.equal(requests[0].options.headers['content-type'],'application/json');
  assert.equal(requests[0].body.model,'deepseek-flash');
  assert.deepEqual(requests[0].body.thinking,{type:'disabled'});
  assert.equal(requests[0].body.stream,false);
  assert.equal(requests[0].body.max_tokens,1200);
  assert.equal(requests[0].body.tools,undefined);
  assert.equal(requests[0].body.tool_choice,undefined);
  const userContent=requests[0].body.messages.find(message=>message.role==='user')?.content;
  const images=userContent.filter(part=>part?.type==='image_url');
  assert.equal(images.length,1,'three genuine JPEG samples should be packed into one production storyboard image');
  assert.match(images[0].image_url.url,/^data:image\/jpeg;base64,/);
  assert.equal(Buffer.from(images[0].image_url.url.split(',')[1],'base64').subarray(0,2).toString('hex'),'ffd8');
  const text=userContent.filter(part=>part?.type==='text').map(part=>part.text).join('\n');
  assert.ok(text.includes(VIDEO_ID));
  assert.match(text,/第1格/);
  assert.equal(agent.lastVisualPacking.status,'storyboard');
  assert.equal(agent.lastVisualPacking.inputImages,3);
  assert.equal(agent.lastVisualPacking.outputImages,1);
  assert.deepEqual(result.decision,decision);
  assert.deepEqual(result.usage,{promptTokens:41,completionTokens:13,totalTokens:54});
  assert.equal(usageRecords.length,1);
  assert.equal(usageRecords[0].kind,'watch');
  assert.equal(usageRecords[0].model,'deepseek-flash');
  assert.equal(toolExecutions,0);
  assert.equal(JSON.stringify(result).includes(KEY),false);
  assert.equal(JSON.stringify(requests[0].body).includes(KEY),false);
});

test('未配置密钥或出现登录验证状态时，在发送任何模型请求前停止', async () => {
  let requests=0;
  const observation=makeObservation();
  const noKey=new ApiAgent({
    controller:{execute:async()=>({})},
    config:{apiKey:'',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
    fetchImpl:async()=>{requests++;return response(decision);},
  });
  await assert.rejects(noKey.decideWatch({observation}),/API Key/);
  const blocked=new ApiAgent({
    controller:{execute:async()=>({})},
    config:{apiKey:KEY,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
    fetchImpl:async()=>{requests++;return response(decision);},
  });
  await assert.rejects(blocked.decideWatch({observation:{...observation,state:{...observation.state,verificationRequired:true}}}),/停止自主观看/);
  assert.equal(requests,0);
});

test('截断响应或未授权工具调用不会变成有效自主观看决策', async () => {
  for (const finishReason of ['length','tool_calls','content_filter','aborted']) {
    const agent=new ApiAgent({
      controller:{execute:async()=>assert.fail('decideWatch must never execute a tool call')},
      config:{apiKey:KEY,baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
      fetchImpl:async()=>response(decision,finishReason,{},finishReason==='tool_calls'?{tool_calls:[{id:'call-1'}]}:{}),
    });
    await assert.rejects(agent.decideWatch({observation:makeObservation(),shareContext:SHARE_DISABLED,commentContext:COMMENT_DISABLED}));
  }
});
