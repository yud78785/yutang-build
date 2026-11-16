import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('desktop settings provide explicit official and OpenRouter presets without exposing the API Key', () => {
  assert.match(source, /DeepSeek 官方/);
  assert.match(source, /OpenRouter 备用/);
  assert.match(source, /https:\/\/api\.deepseek\.com/);
  assert.match(source, /https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(source, /deepseek\/deepseek-v4\.1-flash/);
  assert.match(source, /applyPreset\(baseUrl, model\)/);
  assert.match(source, /OpenRouter 是第三方中转/);
  assert.match(source, /Key 只通过桌面进程保存/);
  assert.match(source, /endpointChanged.*apiKey: ''/);
  assert.match(source, /旧密钥不会自动复用/);
  assert.match(source, /draft.baseUrl === settings.baseUrl/);
});
