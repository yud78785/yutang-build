// One-shot host entry. Reuses the existing upstream BrowserController/ApiAgent.
// Source-only: this is NOT shipped inside the already accepted 1.4.7 EXE.
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runReadOnlySourcePreflight } from './run-douyin-existing-browser-readonly.mjs';
import { runYuTangFirstTask } from './yutang-first-task.mjs';

const PINNED_API_AGENT_BLOB = 'e7c3f37ad39b29a461ecef1356c86d4de6822ff1';
export async function verifyPinnedApiAgentSource(root) {
  try {
    const bytes = await readFile(path.join(root, 'api-agent.mjs'));
    const actual = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    return actual === PINNED_API_AGENT_BLOB;
  } catch { return false; }
}

export function parseFirstTaskArgs(args) {
  if (!Array.isArray(args)) return { ok: false, reasonCode: 'FIRST_TASK_CLI_INVALID' };
  const opts = { allowModel: false };
  for (let i = 0; i < args.length; i++) {
    const v = args[i];
    if (v === '--allow-model' && !opts.allowModel) { opts.allowModel = true; continue; }
    if (!['--video-id', '--upstream-root', '--instruction'].includes(v)) return { ok: false, reasonCode: 'FIRST_TASK_CLI_INVALID' };
    if (typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--')) return { ok: false, reasonCode: 'FIRST_TASK_CLI_INVALID' };
    const key = v === '--video-id' ? 'videoId' : v === '--upstream-root' ? 'upstreamRoot' : 'instruction';
    if (opts[key] !== undefined) return { ok: false, reasonCode: 'FIRST_TASK_CLI_INVALID' };
    opts[key] = args[++i];
  }
  if (!/^\d{10,30}$/.test(opts.videoId || '') || typeof opts.upstreamRoot !== 'string' ||
      !path.isAbsolute(opts.upstreamRoot) || typeof opts.instruction !== 'string' ||
      !opts.instruction.trim() || opts.instruction.length > 1000) {
    return { ok: false, reasonCode: 'FIRST_TASK_CLI_INVALID' };
  }
  return { ok: true, ...opts };
}

export async function runYuTangSourceCli({
  argv, env = process.env, platform = process.platform,
  read = runReadOnlySourcePreflight, verifyAgent = verifyPinnedApiAgentSource,
  loadApiAgent = async root => import(pathToFileURL(path.join(root, 'api-agent.mjs')).href),
} = {}) {
  const parsed = parseFirstTaskArgs(argv);
  if (!parsed.ok) return { status: 'blocked', reasonCode: parsed.reasonCode, modelCalled: false };
  if (platform !== 'win32') return { status: 'blocked', reasonCode: 'WINDOWS_REQUIRED', modelCalled: false };
  // By default this only asks an already-running dedicated Edge for verified
  // PUBLIC evidence. The model code is not imported until after that read.
  const readEvidence = async ({ videoId }) => read({
    argv: ['--video-id', videoId, '--upstream-root', parsed.upstreamRoot],
    platform,
  });
  const authorized = parsed.allowModel === true;
  if (!authorized) {
    return runYuTangFirstTask({ videoId: parsed.videoId, instruction: parsed.instruction, readEvidence });
  }
  // A paid call must require BOTH the literal --allow-model flag and the key
  // already set outside the chat. No prompts, key output, key file or auto-setup.
  const key = typeof env.DEEPSEEK_API_KEY === 'string' ? env.DEEPSEEK_API_KEY.trim() : '';
  if (!key) return { status: 'blocked', reasonCode: 'CLOUD_MODEL_NOT_CONFIGURED', modelCalled: false };
  const baseUrl = typeof env.DEEPSEEK_BASE_URL === 'string' ? env.DEEPSEEK_BASE_URL : 'https://api.deepseek.com';
  const model = typeof env.DOUYIN_MODEL === 'string' ? env.DOUYIN_MODEL : 'deepseek-flash';
  // The upstream pinned direct-provider adapter is supported here. This is
  // deliberately not an OpenRouter bypass or arbitrary user-supplied endpoint.
  if (baseUrl !== 'https://api.deepseek.com' || model !== 'deepseek-flash') {
    return { status: 'blocked', reasonCode: 'CLOUD_MODEL_ROUTE_NOT_AUDITED', modelCalled: false };
  }
  const first = await readEvidence({ videoId: parsed.videoId });
  if (first.status !== 'read_only_evidence') {
    return runYuTangFirstTask({videoId:parsed.videoId,instruction:parsed.instruction,
      readEvidence:async()=>first});
  }
  if (!await verifyAgent(parsed.upstreamRoot)) {
    return { status: 'blocked', reasonCode: 'PINNED_UPSTREAM_AGENT_SOURCE_MISMATCH', modelCalled: false };
  }
  let modelModule;
  try {modelModule = await loadApiAgent(parsed.upstreamRoot);} catch {
    return { status: 'blocked', reasonCode: 'PINNED_UPSTREAM_AGENT_IMPORT_FAILED', modelCalled: false };
  }
  if (typeof modelModule?.ApiAgent !== 'function' || typeof modelModule?.normalizeApiConfig !== 'function') {
    return { status: 'blocked', reasonCode: 'PINNED_UPSTREAM_AGENT_UNAVAILABLE', modelCalled: false };
  }
  let config;
  try {config = modelModule.normalizeApiConfig({ apiKey: key, baseUrl, model });} catch {
    return { status: 'blocked', reasonCode: 'CLOUD_MODEL_ROUTE_INVALID', modelCalled: false };
  }
  return runYuTangFirstTask({ videoId: parsed.videoId, instruction: parsed.instruction,
    readEvidence: async() => first, AgentClass: modelModule.ApiAgent, config, enableModel: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runYuTangSourceCli({ argv: process.argv.slice(2) }).then(result => {
    const safe = result && typeof result === 'object' ? result : { status: 'blocked', reasonCode: 'FIRST_TASK_EMPTY_RESULT' };
    process.stdout.write(JSON.stringify(safe) + '\n', () => process.exit(safe.status === 'preview_only' || safe.status === 'completed_source_only' ? 0 : 2));
  }, () => process.stdout.write(JSON.stringify({status:'blocked', reasonCode:'FIRST_TASK_UNEXPECTED_FAILURE',modelCalled:false})+'\n',()=>process.exit(2)));
}
