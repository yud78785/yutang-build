import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiAgent, buildChatRequestBody, normalizeApiConfig, OPENROUTER_DEEPSEEK_MODEL, OPENROUTER_PRICE_CEILING } from '../api-agent.mjs';
import { ChatAgent } from '../chat-agent.mjs';
import { SparkAgent } from '../spark-agent.mjs';
import { PublicCommentAgent } from '../public-comment-agent.mjs';

const API_KEY = 'synthetic-openrouter-key';
const config = normalizeApiConfig({
  apiKey: API_KEY,
  baseUrl: 'https://openrouter.ai/api/v1',
  model: OPENROUTER_DEEPSEEK_MODEL,
});
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPEkAAAAASUVORK5CYII=';
const VIDEO_ID = '7579432563794584933';
const observation = () => ({
  state: { video: { id: VIDEO_ID, title: '合成公开视频', author: '合成作者', time: 1, duration: 30 },
    loginRequired: false, verificationRequired: false, privateChatVisible: false },
  frames: [{ mimeType: 'image/png', data: PNG, videoId: VIDEO_ID, time: 1 }],
  observation: { videoId: VIDEO_ID },
});
const response = message => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message }],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
}), { headers: { 'content-type': 'application/json' } });
function capture(message, calls) {
  return async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return response(message);
  };
}
function assertOpenRouterRequest(call) {
  assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers.authorization, 'Bearer ' + API_KEY);
  assert.equal(call.body.model, OPENROUTER_DEEPSEEK_MODEL);
  assert.equal(Object.hasOwn(call.body, 'thinking'), false);
  assert.deepEqual(call.body.reasoning, { effort: 'none' });
  assert.deepEqual(call.body.provider, {
    sort: 'price',
    max_price: { prompt: OPENROUTER_PRICE_CEILING.prompt, completion: OPENROUTER_PRICE_CEILING.completion },
    data_collection: 'deny',
    zdr: true,
    require_parameters: true,
  });
  assert.equal(JSON.stringify(call.body).includes(API_KEY), false);
}

test('OpenRouter endpoint only accepts the pinned DeepSeek vision model', () => {
  assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(config.model, OPENROUTER_DEEPSEEK_MODEL);
  assert.throws(() => normalizeApiConfig({
    apiKey: API_KEY, baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash',
  }), /OpenRouter 备用线路必须使用模型/);
  assert.throws(() => buildChatRequestBody(config, null), /模型请求正文无效/);
});

test('official DeepSeek requests remain unchanged and do not receive OpenRouter routing fields', () => {
  const official = normalizeApiConfig({ apiKey: API_KEY, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' });
  const body = { model: official.model, messages: [], thinking: { type: 'disabled' }, stream: false, max_tokens: 128 };
  assert.strictEqual(buildChatRequestBody(official, body), body);
  assert.deepEqual(buildChatRequestBody(official, body), body);
});

test('all five desktop production model paths use the same guarded OpenRouter request profile', async () => {
  const calls = [];
  const watch = new ApiAgent({
    controller: { execute: async () => ({}) }, config,
    fetchImpl: capture({ content: JSON.stringify({
      action: 'skip', reason: '只根据当前采样停止', topics: [], reflection: '没有推断未见内容',
    }) }, calls),
  });
  const decision = await watch.decideWatch({ observation: observation() });
  assert.equal(decision.decision.action, 'skip');
  assertOpenRouterRequest(calls.at(-1));
  assert.ok(calls.at(-1).body.messages.some(message =>
    Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')));

  const task = new ApiAgent({
    controller: { execute: async () => ({}) }, config,
    fetchImpl: capture({ content: '任务已完成。' }, calls),
  });
  const taskResult = await task.runTask({ instruction: '只检查模型请求适配，不调用浏览器工具。' });
  assert.equal(taskResult.status, 'completed');
  assertOpenRouterRequest(calls.at(-1));
  assert.ok(Array.isArray(calls.at(-1).body.tools));
  assert.equal(calls.at(-1).body.tool_choice, 'auto');

  const chat = new ChatAgent({
    config,
    fetchImpl: capture({ content: '[自动回复]你好。' }, calls),
  });
  const chatResult = await chat.reply({ messages: [{ id: 'synthetic-message', sender: 'incoming', text: '你好' }] });
  assert.equal(chatResult.text, '你好。');
  assertOpenRouterRequest(calls.at(-1));

  const spark = new SparkAgent({
    config,
    fetchImpl: capture({ content: '早上好，今天也加油。' }, calls),
  });
  const sparkResult = await spark.greet({ date: '2026-11-13' });
  assert.match(sparkResult.text, /^\[自动问候\]/);
  assertOpenRouterRequest(calls.at(-1));

  const comment = new PublicCommentAgent({
    config,
    fetchImpl: capture({ content: JSON.stringify({ text: '这个配色很舒服。' }) }, calls),
  });
  const commentResult = await comment.generate({ observation: observation() });
  assert.equal(commentResult.text, '这个配色很舒服。');
  assertOpenRouterRequest(calls.at(-1));
  assert.equal(calls.length, 5);
});
