import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENROUTER_VISION_PROFILE,
  resolveVisionProvider,
  createProviderTransport,
} from '../tools/live-vision-acceptance.mjs';

test('auto prefers official DeepSeek when both credentials exist', () => {
  const result = resolveVisionProvider({
    DEEPSEEK_API_KEY: 'deepseek-test-secret',
    OPENROUTER_API_KEY: 'openrouter-test-secret',
  });
  assert.equal(result.id, 'deepseek');
  assert.equal(result.model, 'deepseek-flash');
  assert.equal(result.baseUrl, 'https://api.deepseek.com');
});

test('auto selects OpenRouter only when official DeepSeek key is absent', () => {
  const result = resolveVisionProvider({ OPENROUTER_API_KEY: 'openrouter-test-secret' });
  assert.equal(result.id, 'openrouter');
  assert.equal(result.model, 'deepseek/deepseek-v4.1-flash');
  assert.equal(result.baseUrl, 'https://openrouter.ai/api/v1');
});

test('no credential means no selected provider', () => {
  assert.equal(resolveVisionProvider({}), null);
});

test('explicit selector can choose OpenRouter when both credentials exist', () => {
  const result = resolveVisionProvider({
    YUTANG_VISION_PROVIDER: 'openrouter',
    DEEPSEEK_API_KEY: 'deepseek-test-secret',
    OPENROUTER_API_KEY: 'openrouter-test-secret',
  });
  assert.equal(result.id, 'openrouter');
});

test('explicit selector with no matching key fails closed', () => {
  assert.equal(resolveVisionProvider({ YUTANG_VISION_PROVIDER: 'openrouter' }), null);
  assert.throws(() => resolveVisionProvider({ YUTANG_VISION_PROVIDER: 'third-party' }));
});

test('OpenRouter transport strips DeepSeek-only field and enforces ZDR + price ceiling', async () => {
  const provider = resolveVisionProvider({ OPENROUTER_API_KEY: 'not-a-real-key' });
  let calls = 0;
  let captured;
  const mockFetch = async (url, init) => {
    calls++;
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      model: OPENROUTER_VISION_PROFILE.model,
      provider: 'test-provider',
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const transport = createProviderTransport(provider, mockFetch);
  const response = await transport.fetchImpl(provider.baseUrl + '/chat/completions', {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: 'Bearer not-a-real-key', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      stream: false,
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe this still.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/2Q==' } },
      ] }],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal('thinking' in captured.body, false);
  assert.deepEqual(captured.body.provider, {
    sort: 'price',
    max_price: { prompt: 0.30, completion: 1.20 },
    data_collection: 'deny',
    zdr: true,
    require_parameters: true,
  });
  assert.equal(transport.getRequestCount(), 1);
  assert.deepEqual(transport.getRouteMetadata(), {
    servedModel: OPENROUTER_VISION_PROFILE.model,
    servedProvider: 'test-provider',
  });
  await assert.rejects(() => transport.fetchImpl(provider.baseUrl + '/chat/completions', {
    method: 'POST', redirect: 'error', body: '{}',
  }), /禁止重复模型请求/);
});

test('OpenRouter transport refuses an unpinned model or missing image', async () => {
  const provider = resolveVisionProvider({ OPENROUTER_API_KEY: 'not-a-real-key' });
  const transport = createProviderTransport(provider, async () => {
    throw new Error('network must not be reached');
  });
  await assert.rejects(() => transport.fetchImpl(provider.baseUrl + '/chat/completions', {
    method: 'POST', redirect: 'error',
    body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash-0731', stream: false,
      max_tokens: 1200, messages: [{ role: 'user', content: 'text only' }] }),
  }), /固定模型/);
});
