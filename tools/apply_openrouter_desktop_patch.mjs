import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BASE_COMMIT = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const EXPECTED = {
  'api-agent.mjs': 'e7c3f37ad39b29a461ecef1356c86d4de6822ff1',
  'chat-agent.mjs': 'a5c1769d9534d536a09a97fb881116784063744c',
  'spark-agent.mjs': 'a57f1910277f2292de25e634fb3eb1682e027465',
  'public-comment-agent.mjs': 'b010cd0cc6591af38a4d66604190847b3ab67693',
  'desktop/ui-api/src/main.jsx': '80c43d0fe4a2646410787cd690f179ce974f2388',
  'desktop/README.md': '8cddcbad0e0309a10ea646f9673add4b3b710524',
  'desktop/tests/api-worker.test.mjs': '42f351a26235508d595eb5daadabbc81039d5276',
  'desktop/scripts/stage-api-runtime.mjs': 'c80c1670e08a986984b91191d361bf75202a7d73',
};
const root = path.resolve(process.argv[2] || process.cwd());
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== BASE_COMMIT) throw new Error('UPSTREAM_BASE_COMMIT_MISMATCH: expected ' + BASE_COMMIT + ', got ' + head);

const sha256 = value => createHash('sha256').update(value).digest('hex');
const gitBlobSha1 = value => createHash('sha1').update('blob ' + Buffer.byteLength(value, 'utf8') + '\0').update(value, 'utf8').digest('hex');
const read = async relative => fs.readFile(path.join(root, relative), 'utf8');
const write = async (relative, value) => fs.writeFile(path.join(root, relative), value, 'utf8');
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error('PATCH_ANCHOR_MISMATCH: ' + label);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}
async function loadVerified(relative) {
  const value = await read(relative);
  const actual = gitBlobSha1(value);
  if (actual !== EXPECTED[relative]) throw new Error('UPSTREAM_SOURCE_SHA_MISMATCH: ' + relative + ' expected ' + EXPECTED[relative] + ' got ' + actual);
  return value;
}

let api = await loadVerified('api-agent.mjs');
api = replaceOnce(api,
  "export const HARD_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxSteps: 10000, maxToolCalls: 10000, taskTimeoutMs: 604_800_000 });",
  "export const HARD_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, maxSteps: 10000, maxToolCalls: 10000, taskTimeoutMs: 604_800_000 });\n\n" +
  "export const OPENROUTER_DEEPSEEK_MODEL = 'deepseek/deepseek-v4.1-flash';\n" +
  "export const OPENROUTER_PRICE_CEILING = Object.freeze({ prompt: 0.30, completion: 1.20 });\n" +
  "function isOpenRouterEndpoint(baseUrl) {\n" +
  "  try { const url = new URL(baseUrl); return url.origin === 'https://openrouter.ai' && url.pathname.replace(/\\/+$/u, '') === '/api/v1'; }\n" +
  "  catch { return false; }\n" +
  "}\n" +
  "export function buildChatRequestBody(config, body) {\n" +
  "  if (!isOpenRouterEndpoint(config?.baseUrl)) return body;\n" +
  "  if (config.model !== OPENROUTER_DEEPSEEK_MODEL) throw new Error('OpenRouter 备用线路目前只支持模型 ' + OPENROUTER_DEEPSEEK_MODEL + '。');\n" +
  "  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('模型请求正文无效。');\n" +
  "  const { thinking: _thinking, reasoning: _reasoning, provider: _provider, ...payload } = body;\n" +
  "  return { ...payload, reasoning: { effort: 'none' }, provider: {\n" +
  "    sort: 'price',\n" +
  "    max_price: { prompt: OPENROUTER_PRICE_CEILING.prompt, completion: OPENROUTER_PRICE_CEILING.completion },\n" +
  "    data_collection: 'deny',\n" +
  "    zdr: true,\n" +
  "    require_parameters: true,\n" +
  "  } };\n" +
  "}",
  'api-agent OpenRouter request adapter');
api = replaceOnce(api,
  "  const model = value.model?.trim() || DEFAULT_MODEL;\n  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error('模型名称格式无效，最多 128 个字符。');\n  return { apiKey, baseUrl: url.href.replace(/\\/+$/, ''), model, keySource: apiKey ? '本机 API 设置' : '未配置' };",
  "  const model = value.model?.trim() || DEFAULT_MODEL;\n  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error('模型名称格式无效，最多 128 个字符。');\n  const normalizedBaseUrl = url.href.replace(/\\/+$/, '');\n  if (isOpenRouterEndpoint(normalizedBaseUrl) && model !== OPENROUTER_DEEPSEEK_MODEL) throw new Error('OpenRouter 备用线路必须使用模型 ' + OPENROUTER_DEEPSEEK_MODEL + '。');\n  return { apiKey, baseUrl: normalizedBaseUrl, model, keySource: apiKey ? '本机 API 设置' : '未配置' };",
  'api-agent normalized settings');
api = replaceOnce(api,
  "  return {\n    apiKey,\n    baseUrl: url.href.replace(/\\/+$/, ''),\n    model: env.DOUYIN_MODEL?.trim() || DEFAULT_MODEL,\n    keySource: env.DEEPSEEK_API_KEY?.trim() ? '环境变量' : apiKey ? 'QQ 机器人项目的 .env（仅在内存使用）' : '未配置',\n  };",
  "  const model = env.DOUYIN_MODEL?.trim() || DEFAULT_MODEL;\n  const normalizedBaseUrl = url.href.replace(/\\/+$/, '');\n  if (isOpenRouterEndpoint(normalizedBaseUrl) && model !== OPENROUTER_DEEPSEEK_MODEL) throw new Error('OpenRouter 备用线路必须使用模型 ' + OPENROUTER_DEEPSEEK_MODEL + '。');\n  return {\n    apiKey,\n    baseUrl: normalizedBaseUrl,\n    model,\n    keySource: env.DEEPSEEK_API_KEY?.trim() ? '环境变量' : apiKey ? 'QQ 机器人项目的 .env（仅在内存使用）' : '未配置',\n  };",
  'api-agent environment settings');
api = replaceOnce(api,
  "body: JSON.stringify({ model: this.config.model, messages, thinking: { type: 'disabled' }, stream: false, max_tokens: this.maxTokens })",
  "body: JSON.stringify(buildChatRequestBody(this.config, { model: this.config.model, messages, thinking: { type: 'disabled' }, stream: false, max_tokens: this.maxTokens }))",
  'api-agent autonomous vision request');
api = replaceOnce(api,
  "body: JSON.stringify({ model: this.config.model, messages, thinking: { type: 'disabled' }, stream: false, max_tokens: this.maxTokens, tools: this.toolDefinitions.map((definition) => ({ type: 'function', function: definition })), tool_choice: 'auto', parallel_tool_calls: false })",
  "body: JSON.stringify(buildChatRequestBody(this.config, { model: this.config.model, messages, thinking: { type: 'disabled' }, stream: false, max_tokens: this.maxTokens, tools: this.toolDefinitions.map((definition) => ({ type: 'function', function: definition })), tool_choice: 'auto', parallel_tool_calls: false }))",
  'api-agent task/tool request');
api = api.replaceAll('未配置 DeepSeek API Key', '未配置模型 API Key')
         .replaceAll('DeepSeek 正在判断', '模型正在判断')
         .replaceAll('DeepSeek 单次请求超时', '模型单次请求超时')
         .replaceAll('DeepSeek 请求失败', '模型请求失败');
await write('api-agent.mjs', api);

let chat = await loadVerified('chat-agent.mjs');
chat = replaceOnce(chat,
  "import { loadApiConfig, redact } from './api-agent.mjs';",
  "import { buildChatRequestBody, loadApiConfig, redact } from './api-agent.mjs';",
  'chat-agent shared request builder import');
chat = replaceOnce(chat,
  "body: JSON.stringify({ model: this.config.model, messages: [{ role: 'system', content: systemPrompt }, ...content], thinking: { type: 'disabled' }, stream: false, max_tokens: this.replyTokens }),",
  "body: JSON.stringify(buildChatRequestBody(this.config, { model: this.config.model, messages: [{ role: 'system', content: systemPrompt }, ...content], thinking: { type: 'disabled' }, stream: false, max_tokens: this.replyTokens })),",
  'chat-agent reply request');
chat = chat.replaceAll('未配置 DeepSeek API Key', '未配置模型 API Key');
await write('chat-agent.mjs', chat);

let spark = await loadVerified('spark-agent.mjs');
spark = replaceOnce(spark,
  "import { loadApiConfig, redact } from './api-agent.mjs';",
  "import { buildChatRequestBody, loadApiConfig, redact } from './api-agent.mjs';",
  'spark-agent shared request builder import');
spark = replaceOnce(spark,
  "body: JSON.stringify({ model: this.config.model, messages: [{ role: 'system', content: system }, ...messages], stream: false, thinking: { type: 'disabled' }, max_tokens: 160 }),",
  "body: JSON.stringify(buildChatRequestBody(this.config, { model: this.config.model, messages: [{ role: 'system', content: system }, ...messages], stream: false, thinking: { type: 'disabled' }, max_tokens: 160 })),",
  'spark-agent greeting request');
await write('spark-agent.mjs', spark);

let comment = await loadVerified('public-comment-agent.mjs');
comment = replaceOnce(comment,
  "import { watchDecisionMessages } from './api-agent.mjs?v=9';",
  "import { buildChatRequestBody, watchDecisionMessages } from './api-agent.mjs?v=9';",
  'public-comment shared request builder import');
comment = replaceOnce(comment,
  "body: JSON.stringify({ model: this.config.model, messages, stream: false, thinking: { type: 'disabled' }, max_tokens: 400 })",
  "body: JSON.stringify(buildChatRequestBody(this.config, { model: this.config.model, messages, stream: false, thinking: { type: 'disabled' }, max_tokens: 400 }))",
  'public-comment request');
await write('public-comment-agent.mjs', comment);

let ui = await loadVerified('desktop/ui-api/src/main.jsx');
ui = replaceOnce(ui,
  "  function edit(patch) { version.current++; dirty.current = true; current.current = { ...current.current, ...patch }; setDraft(current.current); setFailure(''); setNotice('离开输入框后自动保存。'); }",
  "  function edit(patch) { version.current++; dirty.current = true; current.current = { ...current.current, ...patch }; setDraft(current.current); setFailure(''); setNotice('离开输入框后自动保存。'); }\n  function applyPreset(baseUrl, model) { edit({ baseUrl, model }); void save(); }",
  'desktop model preset handler');
ui = replaceOnce(ui,
  "{settings.configured ? '模型与共享记忆' : '先连接你的 DeepSeek'}",
  "{settings.configured ? '模型与共享记忆' : '先连接模型服务'}",
  'desktop generic model heading');
ui = replaceOnce(ui,
  "<details className=\"advanced\"><summary>接口与模型</summary><Field title=\"API 地址\"><Input aria-label=\"API 地址\" value={draft.baseUrl} disabled={operationActive} onChange={event => edit({ baseUrl: event.target.value })} onBlur={() => { void save(); }} /></Field><Field title=\"模型名称\"><Input aria-label=\"模型名称\" value={draft.model} maxLength={120} disabled={operationActive} onChange={event => edit({ model: event.target.value })} onBlur={() => { void save(); }} /></Field></details>",
  "<details className=\"advanced\"><summary>接口与模型</summary><Field title=\"API 地址\"><Input aria-label=\"API 地址\" value={draft.baseUrl} disabled={operationActive} onChange={event => edit({ baseUrl: event.target.value })} onBlur={() => { void save(); }} /></Field><Field title=\"模型名称\"><Input aria-label=\"模型名称\" value={draft.model} maxLength={120} disabled={operationActive} onChange={event => edit({ model: event.target.value })} onBlur={() => { void save(); }} /></Field><div className=\"actions\"><Button size=\"sm\" type=\"button\" variant=\"outline\" disabled={operationActive} onClick={() => applyPreset('https://api.deepseek.com', 'deepseek-flash')}>DeepSeek 官方</Button><Button size=\"sm\" type=\"button\" variant=\"outline\" disabled={operationActive} onClick={() => applyPreset('https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash')}>OpenRouter 备用</Button></div><p className=\"muted\">OpenRouter 是第三方中转。备用线路只选择拒绝数据收集且支持零数据保留的服务商，并限制最高单价；没有符合条件的服务商时会停止请求。</p></details>",
  'desktop model settings presets');
await write('desktop/ui-api/src/main.jsx', ui);

let readme = await loadVerified('desktop/README.md');
readme += "\n\n## OpenRouter 备用模型线路\n\n独立软件的模型设置提供“DeepSeek 官方”和“OpenRouter 备用”快捷预设。选择 OpenRouter 后，API 地址为 https://openrouter.ai/api/v1，模型为 deepseek/deepseek-v4.1-flash；API Key 从 OpenRouter 官方账户生成，仍只通过桌面 IPC 保存，不能发给他人或写入聊天。\n\n软件会将 DeepSeek 的 thinking: disabled 转换为 OpenRouter 的 reasoning: { effort: none }，并要求服务商 data_collection: deny、zdr: true、require_parameters: true，按价格排序，输入最高 $0.30 / 1M tokens、输出最高 $1.20 / 1M tokens。这些是上限，不是固定报价；如果没有同时满足图片输入、参数和数据保留条件的服务商，请求会失败关闭，不会放宽隐私限制或改走其他模型。\n\nOpenRouter 是额外的路由和计费中间层，实际推理服务商可能不是 DeepSeek 自营基础设施。ZDR 是对实际推理服务商的路由要求，不代表 OpenRouter 不处理请求或计费元数据。不要把私人聊天、凭据或敏感资料发送给中转服务；先使用公开、无敏感内容测试。自动充值保持关闭。\n";
await write('desktop/README.md', readme);

let workerTest = await loadVerified('desktop/tests/api-worker.test.mjs');
workerTest += "\n\ntest('桌面 IPC 接受固定 OpenRouter DeepSeek 备用配置，并拒绝错误模型名且不回显 Key', { timeout: 20_000 }, async t => {\n  const f = await workerFixture(t);\n  const startup = await f.request('start', { options: f.options }); assert.equal(startup.ok, true, startup.error);\n  const config = { apiKey: 'synthetic-openrouter-key', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4.1-flash' };\n  const changed = await f.request('configure', { config }); assert.equal(changed.ok, true, changed.error);\n  assert.deepEqual(changed.result, { configured: true, model: config.model, keySource: '本机 API 设置' });\n  const invalid = await f.request('configure', { config: { ...config, model: 'deepseek/deepseek-v4-flash' } });\n  assert.equal(invalid.ok, false); assert.match(invalid.error, /OpenRouter 备用线路必须使用模型/);\n  assert.deepEqual((await f.request('get-config')).result, changed.result);\n  const publicOutput = JSON.stringify({ messages: f.messages, output: f.output() });\n  assert.equal(publicOutput.includes(config.apiKey), false);\n  assert.equal((await f.request('stop')).ok, true); await f.exited;\n});\n";
await write('desktop/tests/api-worker.test.mjs', workerTest);

const stage = await loadVerified('desktop/scripts/stage-api-runtime.mjs');
for (const relative of ['api-agent.mjs', 'chat-agent.mjs', 'spark-agent.mjs', 'public-comment-agent.mjs']) {
  if (!stage.includes("'" + relative + "'")) throw new Error('DESKTOP_RUNTIME_OMITS_PATCHED_MODULE: ' + relative);
}
const modified = {};
for (const relative of ['api-agent.mjs', 'chat-agent.mjs', 'spark-agent.mjs', 'public-comment-agent.mjs', 'desktop/ui-api/src/main.jsx', 'desktop/README.md', 'desktop/tests/api-worker.test.mjs']) {
  modified[relative] = sha256(await read(relative));
}
const receipt = {
  schema: 'yutang.openrouter-desktop-patch.v1',
  status: 'PATCH_APPLIED_TO_PINNED_UPSTREAM_SOURCE_ONLY',
  upstreamRepository: 'LockyBee/dsh-douyin-agent',
  upstreamCommit: BASE_COMMIT,
  originalSourceGitBlobSha1: EXPECTED,
  modifiedSourceSha256: modified,
  model: 'deepseek/deepseek-v4.1-flash',
  requestPolicy: {
    reasoning: { effort: 'none' },
    provider: { sort: 'price', max_price: { prompt: 0.30, completion: 1.20 }, data_collection: 'deny', zdr: true, require_parameters: true },
  },
  modelCallPathsPatched: ['ApiAgent.decideWatch', 'ApiAgent.runTask', 'ChatAgent.reply', 'SparkAgent.greet', 'PublicCommentAgent.generate'],
  desktopRuntimeStagingVerified: true,
  liveApiRequests: 0,
  apiKeysUsed: false,
  exeBuilt: false,
  windowsTested: false,
};
await fs.writeFile(path.join(root, 'openrouter-desktop-patch-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log('PASS_OPENROUTER_DESKTOP_PATCH_APPLIED ' + JSON.stringify(receipt));
