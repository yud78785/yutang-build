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
  'desktop/ui-api/tests/browser.test.mjs': '3e39c22c8a50d07578e55f3a03bf0c8e8d466c24',
  'desktop/src/main.mjs': '5296770bcb87e6a60c96cbb2959f615ff4192e5e',
  'desktop/scripts/build-api-desktop.mjs': 'b66c464f93776536e69dece46bdfedd23ce38ed1',
  'desktop/scripts/verify-packaged-api.mjs': 'f6bc5bc28a54abaeddf188c94d4caef71fa943fb',
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
  "export const OPENROUTER_PRICE_CEILING = Object.freeze({ prompt: 0.15, completion: 0.60 });\n" +
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
  "    allow_fallbacks: true,\n" +
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

let main = await loadVerified('desktop/src/main.mjs');
main = replaceOnce(main,
  "import { ApiProcess } from './api-process.mjs';",
  "import { resolveApiConfigForSave } from './model-settings-guard.mjs';\nimport { ApiProcess } from './api-process.mjs';",
  'desktop main credential guard import');
main = replaceOnce(main,
  "      const next = normalize({ apiKey: typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey : current.apiKey, baseUrl: input.baseUrl || current.baseUrl, model: input.model || current.model, keySource: '软件 API 设置' });",
  "      const { next } = resolveApiConfigForSave({ current, input, normalize });",
  'desktop main credential switch guard');
await write('desktop/src/main.mjs', main);

let desktopBuild = await loadVerified('desktop/scripts/build-api-desktop.mjs');
desktopBuild = replaceOnce(desktopBuild,
  "const entries = ['main.mjs', 'api-process.mjs',",
  "const entries = ['main.mjs', 'model-settings-guard.mjs', 'api-process.mjs',",
  'desktop main bundle includes credential guard');
await write('desktop/scripts/build-api-desktop.mjs', desktopBuild);

let packagedVerifier = await loadVerified('desktop/scripts/verify-packaged-api.mjs');
packagedVerifier = replaceOnce(packagedVerifier,
  "await page.getByRole('heading', { name: '先连接你的 DeepSeek' }).waitFor();",
  "await page.getByRole('heading', { name: '先连接模型服务' }).waitFor();",
  'packaged verifier uses provider-neutral model setup heading');
packagedVerifier = replaceOnce(packagedVerifier,
  "for (const name of ['main.mjs', 'api-process.mjs', 'prepare-api-runtime.mjs', 'media-key-store.mjs', 'startup-navigation.mjs', 'preload.cjs', 'update-service.mjs', 'update-launcher.mjs']) {",
  "for (const name of ['main.mjs', 'model-settings-guard.mjs', 'api-process.mjs', 'prepare-api-runtime.mjs', 'media-key-store.mjs', 'startup-navigation.mjs', 'preload.cjs', 'update-service.mjs', 'update-launcher.mjs']) {",
  'packaged verifier checks the new main-process guard');
const oldReady = "  await page.getByText(\`独立 API 版 · \${version}\`, { exact: true }).waitFor();";
const newReady = oldReady + "\n" +
"  const providerKeyIsolation = await page.evaluate(async () => {\n" +
"    const bridge = window.douyinDesktop;\n" +
"    const refused = await bridge.saveSettings({ apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4.1-flash', remember: false }).then(() => '', error => String(error?.message || error));\n" +
"    const before = await bridge.getSettings();\n" +
"    const switched = await bridge.saveSettings({ apiKey: 'synthetic-openrouter-check-only', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4.1-flash', remember: false });\n" +
"    const after = await bridge.getSettings();\n" +
"    await bridge.clearApiKey();\n" +
"    const cleared = await bridge.getSettings();\n" +
"    const visible = JSON.stringify({ before, switched, after, cleared });\n" +
"    return { refused, beforeConfigured: before.configured, beforeBaseUrl: before.baseUrl, switchedBaseUrl: switched.baseUrl, switchedModel: switched.model, afterConfigured: after.configured, cleared: !cleared.configured, noKeyLeak: !visible.includes('synthetic-packaged-check-only') && !visible.includes('synthetic-openrouter-check-only') };\n" +
"  });\n" +
"  assert.match(providerKeyIsolation.refused, /旧密钥不会自动转移/);\n" +
"  assert.equal(providerKeyIsolation.beforeConfigured, true);\n" +
"  assert.equal(providerKeyIsolation.beforeBaseUrl, 'https://api.deepseek.com');\n" +
"  assert.equal(providerKeyIsolation.switchedBaseUrl, 'https://openrouter.ai/api/v1');\n" +
"  assert.equal(providerKeyIsolation.switchedModel, 'deepseek/deepseek-v4.1-flash');\n" +
"  assert.equal(providerKeyIsolation.afterConfigured, true);\n" +
"  assert.equal(providerKeyIsolation.cleared, true);\n" +
"  assert.equal(providerKeyIsolation.noKeyLeak, true);";
packagedVerifier = replaceOnce(packagedVerifier, oldReady, newReady, 'packaged EXE proves cross-provider key isolation');
packagedVerifier = replaceOnce(packagedVerifier,
  "renderer: { loaded: true, privateKeyIpc: true, apiKeyBlurAutoSaved:true, syntheticKeyCleared: true,",
  "renderer: { loaded: true, privateKeyIpc: true, apiKeyBlurAutoSaved:true, syntheticKeyCleared: true, providerKeyIsolation: true,",
  'packaged verification receipt records provider key isolation');
await write('desktop/scripts/verify-packaged-api.mjs', packagedVerifier);
await write('desktop/src/model-settings-guard.mjs', "export function resolveApiConfigForSave({ current, input, normalize }) {\n  if (!current || !input || typeof input !== 'object' || Array.isArray(input) || typeof normalize !== 'function') {\n    throw new Error('模型设置输入无效。');\n  }\n  const baseUrl = typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : current.baseUrl;\n  const model = typeof input.model === 'string' && input.model.trim() ? input.model : current.model;\n  const probe = normalize({ apiKey: current.apiKey, baseUrl, model, keySource: '软件 API 设置' });\n  const endpointChanged = probe.baseUrl !== current.baseUrl;\n  const suppliedKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';\n  if (endpointChanged && !suppliedKey) {\n    throw new Error('切换 API 服务商后必须重新输入新服务商的 API Key；旧密钥不会自动转移。');\n  }\n  const next = normalize({\n    apiKey: suppliedKey || current.apiKey,\n    baseUrl,\n    model,\n    keySource: '软件 API 设置',\n  });\n  return { next, endpointChanged };\n}\n");
await write('desktop/tests/model-settings-guard.test.mjs', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { normalizeApiConfig } from '../../api-agent.mjs';\nimport { resolveApiConfigForSave } from '../src/model-settings-guard.mjs';\n\nconst current = normalizeApiConfig({\n  apiKey: 'synthetic-deepseek-old-key',\n  baseUrl: 'https://api.deepseek.com',\n  model: 'deepseek-flash',\n});\n\ntest('same provider with blank key safely retains its existing credential', () => {\n  const { next, endpointChanged } = resolveApiConfigForSave({\n    current,\n    input: { apiKey: '', baseUrl: current.baseUrl, model: 'deepseek-flash' },\n    normalize: normalizeApiConfig,\n  });\n  assert.equal(endpointChanged, false);\n  assert.equal(next.apiKey, 'synthetic-deepseek-old-key');\n});\n\ntest('normalized equivalent endpoint does not trigger an unnecessary key replacement', () => {\n  const { next, endpointChanged } = resolveApiConfigForSave({\n    current,\n    input: { apiKey: '', baseUrl: 'https://api.deepseek.com/', model: 'deepseek-flash' },\n    normalize: normalizeApiConfig,\n  });\n  assert.equal(endpointChanged, false);\n  assert.equal(next.apiKey, 'synthetic-deepseek-old-key');\n});\n\ntest('changing provider without a new key fails closed and never reuses the old key', () => {\n  assert.throws(() => resolveApiConfigForSave({\n    current,\n    input: { apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4.1-flash' },\n    normalize: normalizeApiConfig,\n  }), /旧密钥不会自动转移/);\n});\n\ntest('changing provider with its own new key replaces the old credential', () => {\n  const { next, endpointChanged } = resolveApiConfigForSave({\n    current,\n    input: {\n      apiKey: 'synthetic-openrouter-new-key',\n      baseUrl: 'https://openrouter.ai/api/v1',\n      model: 'deepseek/deepseek-v4.1-flash',\n    },\n    normalize: normalizeApiConfig,\n  });\n  assert.equal(endpointChanged, true);\n  assert.equal(next.apiKey, 'synthetic-openrouter-new-key');\n  assert.notEqual(next.apiKey, current.apiKey);\n  assert.equal(next.baseUrl, 'https://openrouter.ai/api/v1');\n});\n\ntest('changing model within the same provider retains the existing key', () => {\n  const { next, endpointChanged } = resolveApiConfigForSave({\n    current,\n    input: { apiKey: '', baseUrl: current.baseUrl, model: 'deepseek-flash' },\n    normalize: normalizeApiConfig,\n  });\n  assert.equal(endpointChanged, false);\n  assert.equal(next.apiKey, current.apiKey);\n});\n");

let ui = await loadVerified('desktop/ui-api/src/main.jsx');
ui = replaceOnce(ui,
  "  function edit(patch) { version.current++; dirty.current = true; current.current = { ...current.current, ...patch }; setDraft(current.current); setFailure(''); setNotice('离开输入框后自动保存。'); }",
  "  function edit(patch) { const endpointChanged = typeof patch.baseUrl === 'string' && patch.baseUrl.trim() !== current.current.baseUrl; const next = { ...current.current, ...patch, ...(endpointChanged ? { apiKey: '' } : {}) }; version.current++; dirty.current = true; current.current = next; setDraft(next); setFailure(''); setNotice('离开输入框后自动保存。'); }\n  function applyPreset(baseUrl, model) { const endpointChanged = baseUrl !== current.current.baseUrl; edit({ baseUrl, model }); if (endpointChanged) { setNotice('服务商已切换，请输入该服务商对应的 API Key；旧密钥不会自动复用。'); return; } void save(); }",
  'desktop model preset handler');
ui = replaceOnce(ui,
  "    if (!dirty.current || (!settings.configured && !current.current.apiKey.trim()) || operationActive || !bridge?.saveSettings) return;",
  "    if (!dirty.current || operationActive || !bridge?.saveSettings) return;\n    if (current.current.baseUrl.trim() !== settings.baseUrl && !current.current.apiKey.trim()) { setNotice('服务商已切换，请输入新服务商的 API Key 后保存；旧密钥不会自动复用。'); return; }\n    if (!settings.configured && !current.current.apiKey.trim()) return;",
  'UI requires new provider key');
ui = replaceOnce(ui,
  "placeholder={settings.configured ? '留空沿用现有 API Key' : ''}",
  "placeholder={settings.configured && draft.baseUrl === settings.baseUrl ? '留空沿用现有 API Key' : '请输入当前服务商的 API Key'}",
  'UI provider-aware key placeholder');
ui = replaceOnce(ui,
  "{settings.configured ? '模型与共享记忆' : '先连接你的 DeepSeek'}",
  "{settings.configured ? '模型与共享记忆' : '先连接模型服务'}",
  'desktop generic model heading');
ui = replaceOnce(ui,
  "<details className=\"advanced\"><summary>接口与模型</summary><Field title=\"API 地址\"><Input aria-label=\"API 地址\" value={draft.baseUrl} disabled={operationActive} onChange={event => edit({ baseUrl: event.target.value })} onBlur={() => { void save(); }} /></Field><Field title=\"模型名称\"><Input aria-label=\"模型名称\" value={draft.model} maxLength={120} disabled={operationActive} onChange={event => edit({ model: event.target.value })} onBlur={() => { void save(); }} /></Field></details>",
  "<details className=\"advanced\"><summary>接口与模型</summary><Field title=\"API 地址\"><Input aria-label=\"API 地址\" value={draft.baseUrl} disabled={operationActive} onChange={event => edit({ baseUrl: event.target.value })} onBlur={() => { void save(); }} /></Field><Field title=\"模型名称\"><Input aria-label=\"模型名称\" value={draft.model} maxLength={120} disabled={operationActive} onChange={event => edit({ model: event.target.value })} onBlur={() => { void save(); }} /></Field><div className=\"actions\"><Button size=\"sm\" type=\"button\" variant=\"outline\" disabled={operationActive} onClick={() => applyPreset('https://api.deepseek.com', 'deepseek-flash')}>DeepSeek 官方</Button><Button size=\"sm\" type=\"button\" variant=\"outline\" disabled={operationActive} onClick={() => applyPreset('https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash')}>OpenRouter 备用</Button></div><p className=\"muted\">OpenRouter 是第三方中转。备用线路只选择拒绝数据收集且支持零数据保留的服务商，并限制最高单价；没有符合条件的服务商时会停止请求。</p></details>",
  'desktop model settings presets');
await write('desktop/ui-api/src/main.jsx', ui);

let browserUiTest = await loadVerified('desktop/ui-api/tests/browser.test.mjs');
browserUiTest = replaceOnce(browserUiTest,
  "await page.getByRole('heading', { name: '先连接你的 DeepSeek' }).waitFor();",
  "await page.getByRole('heading', { name: '先连接模型服务' }).waitFor();",
  'browser UI test follows generic model provider heading');
await write('desktop/ui-api/tests/browser.test.mjs', browserUiTest);

let readme = await loadVerified('desktop/README.md');
readme = readme.replace('软件不借用 DSH 或 QQ 的模型凭据。', '软件不借用 DSH 或 QQ 的模型凭据。更换 API 服务地址时，旧 Key 不会自动复用，必须重新输入新服务商的 API Key；后台会独立拒绝跨服务商沿用旧密钥。');
readme += "\n\n## OpenRouter 备用模型线路\n\n独立软件的模型设置提供“DeepSeek 官方”和“OpenRouter 备用”快捷预设。选择 OpenRouter 后，API 地址为 https://openrouter.ai/api/v1，模型为 deepseek/deepseek-v4.1-flash；API Key 从 OpenRouter 官方账户生成，仍只通过桌面 IPC 保存，不能发给他人或写入聊天。\n\n软件会将 DeepSeek 的 thinking: disabled 转换为 OpenRouter 的 reasoning: { effort: none }，并要求服务商 data_collection: deny、zdr: true、require_parameters: true，按价格排序，输入最高 $0.15 / 1M tokens、输出最高 $0.60 / 1M tokens，并允许在同一 ZDR/拒绝数据收集过滤条件内进行供应商故障切换。这些是上限，不是固定报价；如果没有同时满足图片输入、参数和数据保留条件的服务商，请求会失败关闭，不会放宽隐私限制或改走其他模型。\n\nOpenRouter 是额外的路由和计费中间层，实际推理服务商可能不是 DeepSeek 自营基础设施。ZDR 是对实际推理服务商的路由要求，不代表 OpenRouter 不处理请求或计费元数据。不要把私人聊天、凭据或敏感资料发送给中转服务；先使用公开、无敏感内容测试。自动充值保持关闭。\n";
await write('desktop/README.md', readme);

let workerTest = await loadVerified('desktop/tests/api-worker.test.mjs');
workerTest += "\n\ntest('桌面 IPC 接受固定 OpenRouter DeepSeek 备用配置，并拒绝错误模型名且不回显 Key', { timeout: 20_000 }, async t => {\n  const f = await workerFixture(t);\n  const startup = await f.request('start', { options: f.options }); assert.equal(startup.ok, true, startup.error);\n  const config = { apiKey: 'synthetic-openrouter-key', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4.1-flash' };\n  const changed = await f.request('configure', { config }); assert.equal(changed.ok, true, changed.error);\n  assert.deepEqual(changed.result, { configured: true, model: config.model, keySource: '本机 API 设置' });\n  const invalid = await f.request('configure', { config: { ...config, model: 'deepseek/deepseek-v4-flash' } });\n  assert.equal(invalid.ok, false); assert.match(invalid.error, /OpenRouter 备用线路必须使用模型/);\n  assert.deepEqual((await f.request('get-config')).result, changed.result);\n  const publicOutput = JSON.stringify({ messages: f.messages, output: f.output() });\n  assert.equal(publicOutput.includes(config.apiKey), false);\n  assert.equal((await f.request('stop')).ok, true); await f.exited;\n});\n";
await write('desktop/tests/api-worker.test.mjs', workerTest);

const stage = await loadVerified('desktop/scripts/stage-api-runtime.mjs');
for (const relative of ['api-agent.mjs', 'chat-agent.mjs', 'spark-agent.mjs', 'public-comment-agent.mjs']) {
  if (!stage.includes("'" + relative + "'")) throw new Error('DESKTOP_RUNTIME_OMITS_PATCHED_MODULE: ' + relative);
}
const desktopBuildCheck = await read('desktop/scripts/build-api-desktop.mjs');
if (!desktopBuildCheck.includes("'model-settings-guard.mjs'")) throw new Error('DESKTOP_BUNDLE_OMITS_MODEL_SETTINGS_GUARD');
const modified = {};
for (const relative of ['api-agent.mjs', 'chat-agent.mjs', 'spark-agent.mjs', 'public-comment-agent.mjs', 'desktop/src/main.mjs', 'desktop/src/model-settings-guard.mjs', 'desktop/scripts/build-api-desktop.mjs', 'desktop/scripts/verify-packaged-api.mjs', 'desktop/tests/model-settings-guard.test.mjs', 'desktop/ui-api/src/main.jsx', 'desktop/ui-api/tests/browser.test.mjs', 'desktop/README.md', 'desktop/tests/api-worker.test.mjs']) {
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
    provider: { allow_fallbacks: true, sort: 'price', max_price: { prompt: 0.15, completion: 0.60 }, data_collection: 'deny', zdr: true, require_parameters: true },
  },
  modelCallPathsPatched: ['ApiAgent.decideWatch', 'ApiAgent.runTask', 'ChatAgent.reply', 'SparkAgent.greet', 'PublicCommentAgent.generate'],
  desktopRuntimeStagingVerified: true,
  desktopMainBundleFilesVerified: true,
  desktopPackagedVerifierIncludesKeyGuard: true,
  liveApiRequests: 0,
  apiKeysUsed: false,
  exeBuilt: false,
  windowsTested: false,
};
await fs.writeFile(path.join(root, 'openrouter-desktop-patch-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log('PASS_OPENROUTER_DESKTOP_PATCH_APPLIED ' + JSON.stringify(receipt));
