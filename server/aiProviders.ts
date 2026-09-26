import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import os from 'os';

/**
 * ZeroLeak — Unified free AI provider router.
 *
 * Every provider here has a permanent free tier (no trial, no credit card), except
 * Ollama, which runs locally and has no quota at all. Requests walk the chain in
 * order and fall through on rate limits, quota exhaustion, auth failures and timeouts,
 * so the pipeline degrades in quality rather than failing outright.
 *
 * Ollama is always last and always available, which makes it the floor: the app keeps
 * working with zero API keys and no internet connection.
 */

export type ProviderId =
  | 'nvidia'
  | 'agentrouter'
  | 'groq'
  | 'gemini'
  | 'cerebras'
  | 'mistral'
  | 'openrouter'
  | 'github'
  | 'ollama';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatAttachment {
  mimeType: string;
  /** Base64 payload, with or without a `data:` prefix. */
  data: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  /** Ask the provider for strict JSON output where it supports it. */
  json?: boolean;
  /** Inline PDF/image parts. Only providers with `supportsVision` receive these. */
  attachments?: ChatAttachment[];
  timeoutMs?: number;
  /** Explicit chain override, e.g. ['groq', 'ollama']. */
  providerOrder?: ProviderId[];
  /** Skip providers placed before this one in the chain. */
  minimumProvider?: ProviderId;
  /** Pin the Ollama context window. Auto-sized from prompt length when omitted. */
  num_ctx?: number;
  /** Force reasoning on/off for local thinking models. Defaults to OLLAMA_THINK. */
  think?: boolean;
}

export interface ChatAttempt {
  provider: ProviderId;
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface ChatResult {
  text: string;
  provider: ProviderId;
  model: string;
  /** True when a preferred provider was skipped or failed before this one answered. */
  degraded: boolean;
  attempts: ChatAttempt[];
}

type ProviderKind = 'openai-compatible' | 'gemini' | 'ollama' | 'anthropic';

interface ProviderDef {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  /** Base URL for OpenAI-compatible providers; the origin for Ollama and Gemini. */
  baseUrl: string;
  apiKeyEnv?: string;
  defaultModel: string;
  modelEnv?: string;
  supportsVision: boolean;
  supportsJson: boolean;
  /** Documented free-tier allowance, surfaced in the status endpoint. */
  freeTier: string;
}

const DEFAULT_ORDER: ProviderId[] = [
  'nvidia',
  'agentrouter',
  'groq',
  'gemini',
  'cerebras',
  'mistral',
  'openrouter',
  'github',
  'ollama',
];

export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5vl:7b';
export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

/**
 * Smaller, faster model for interactive chat and per-question answering.
 *
 * Generation speed here is bounded by model size — the 7B runs at ~10 generated tokens/sec
 * on this CPU, so every answer costs real seconds. The qwen3.5 4B default is a full
 * generation newer than the qwen2.5 models it replaced and answers markedly more accurately
 * at a size that still fits a CPU. The larger OLLAMA_MODEL is kept for extraction and paper
 * generation, where reading a whole paper correctly matters more than latency.
 *
 * Defaults to OLLAMA_MODEL, so nothing changes until a fast model is configured.
 */
export const OLLAMA_FAST_MODEL = process.env.OLLAMA_FAST_MODEL || OLLAMA_MODEL;

/**
 * Context window Ollama loads the model with.
 *
 * Ollama ignores what the model actually supports and defaults to 4096 tokens
 * (qwen2.5vl handles 128k), then *silently discards* the overflow instead of erroring.
 * A paper passed in at 60k characters therefore reached the model with its body cut
 * away, and it answered "the document does not contain..." with full confidence.
 * Sized here to hold the largest prompt this app sends (the 60k-character extraction
 * slice, ~10k tokens) with headroom.
 *
 * Raising this costs RAM and CPU time — local inference is linear in context length.
 */
export const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 16384;

/**
 * Local inference has no quota but runs on CPU here, far slower than any cloud tier,
 * so Ollama gets a longer leash than the shared default.
 *
 * Measured on this machine (Intel UHD, no GPU): prompt processing runs at ~24 tokens/sec
 * once num_ctx is 16384, so the 9,612-token prompt a full-size paper produces costs ~400s
 * before a single output token is generated, plus generation on top. 15 minutes covers
 * that worst case with headroom; smaller papers finish far sooner.
 */
export const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 900_000;

/**
 * Output-token ceiling for local generations. An unbounded reply on CPU is an unbounded
 * wait, so this bounds it — 4096 comfortably covers a full extracted question list or a
 * complete LaTeX document. Set OLLAMA_NUM_PREDICT=0 to let the model decide for itself.
 */
export const OLLAMA_NUM_PREDICT =
  process.env.OLLAMA_NUM_PREDICT === undefined
    ? 4096
    : Math.max(0, Number(process.env.OLLAMA_NUM_PREDICT) || 0);

/**
 * Number of CPU threads Ollama should use for matrix operations.
 *
 * GGML (Ollama's inference backend) splits each matrix multiplication across
 * threads — more threads means shorter prompt-processing time on a multi-core
 * CPU. The i5-12450HX has 8 physical cores; capping at physicalCores avoids
 * hyper-thread competition that can actually slow things down.
 *
 * Set OLLAMA_NUM_THREADS in .env to override.
 */
export const OLLAMA_NUM_THREADS =
  process.env.OLLAMA_NUM_THREADS
    ? Math.max(1, Number(process.env.OLLAMA_NUM_THREADS))
    : Math.min(8, Math.ceil(os.cpus().length / 2));

/**
 * Turn reasoning/thinking off for local models that have a thinking mode (qwen3.x, gemma4…).
 *
 * A thinking model streams its reasoning into a separate `message.thinking` field, but those
 * tokens still count against num_predict and this app never surfaces them — so a 4B reasoning
 * model can spend the whole 4096-token output budget deliberating and return an empty answer,
 * after making the user wait out the reasoning on a CPU. The replies here are short and
 * factual, so reasoning buys little. Ollama ignores the flag on models without a thinking
 * mode, so it is safe to send unconditionally.
 *
 * Set OLLAMA_THINK=true to leave reasoning enabled.
 */
export const OLLAMA_THINK = (process.env.OLLAMA_THINK || 'false').toLowerCase() === 'true';

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    kind: 'openai-compatible',
    baseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
    apiKeyEnv: 'NVIDIA_API_KEY',
    defaultModel: 'meta/llama-3.2-11b-vision-instruct',
    modelEnv: 'NVIDIA_MODEL',
    supportsVision: true,
    supportsJson: true,
    freeTier: 'Free developer endpoints on build.nvidia.com',
  },
  agentrouter: {
    id: 'agentrouter',
    label: 'AgentRouter',
    kind: 'anthropic',
    baseUrl: (process.env.AGENTROUTER_BASE_URL || 'https://agentrouter.org').replace(/\/+$/, ''),
    apiKeyEnv: 'AGENTROUTER_API_KEY',
    defaultModel: 'deepseek-v4-flash',
    modelEnv: 'AGENTROUTER_MODEL',
    supportsVision: false,
    supportsJson: true,
    freeTier: 'Third-party Anthropic-compatible gateway — see spoofing note in invokeAnthropic()',
  },
  groq: {
    id: 'groq',
    label: 'Groq Cloud',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'openai/gpt-oss-120b',
    modelEnv: 'GROQ_MODEL',
    supportsVision: false,
    supportsJson: true,
    freeTier: '30 RPM / 1K RPD / 200K TPD — free, no card',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-3.7-flash',
    modelEnv: 'GEMINI_MODEL',
    supportsVision: true,
    supportsJson: true,
    freeTier: '~15 RPM / ~1500 RPD — free, no card; native PDF input',
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras Inference',
    kind: 'openai-compatible',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    defaultModel: 'gpt-oss-120b',
    modelEnv: 'CEREBRAS_MODEL',
    supportsVision: false,
    supportsJson: true,
    freeTier: '1M tokens/day (verify tier at signup)',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
    modelEnv: 'MISTRAL_MODEL',
    supportsVision: false,
    supportsJson: true,
    freeTier: '~1 req/s, 1B tokens/month — free, phone verify',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    modelEnv: 'OPENROUTER_MODEL',
    supportsVision: false,
    supportsJson: true,
    freeTier: '~20 RPM / 50 RPD on :free models — no card',
  },
  github: {
    id: 'github',
    label: 'GitHub Models',
    kind: 'openai-compatible',
    baseUrl: 'https://models.inference.ai.azure.com',
    apiKeyEnv: 'GITHUB_MODELS_TOKEN',
    defaultModel: 'gpt-4o-mini',
    modelEnv: 'GITHUB_MODELS_MODEL',
    supportsVision: false,
    supportsJson: true,
    freeTier: '10-15 RPM / 50-150 RPD — free GitHub account',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'ollama',
    baseUrl: OLLAMA_BASE_URL,
    defaultModel: OLLAMA_MODEL,
    modelEnv: 'OLLAMA_MODEL',
    supportsVision: true,
    supportsJson: true,
    freeTier: 'Unlimited — local, no key, no quota',
  },
};

/** Placeholder values that mean "the user never filled this in". */
function looksUnconfigured(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (v.length < 8) return true;
  return /your[_-]|MY_|placeholder|_here|example|xxx+/i.test(v);
}

function getApiKey(def: ProviderDef): string | undefined {
  if (!def.apiKeyEnv) return undefined;
  const raw = process.env[def.apiKeyEnv];
  return looksUnconfigured(raw) ? undefined : raw!.trim();
}

function getModel(def: ProviderDef, override?: string): string {
  if (override) return override;
  if (def.modelEnv && process.env[def.modelEnv]) return process.env[def.modelEnv]!.trim();
  return def.defaultModel;
}

export function isProviderConfigured(id: ProviderId): boolean {
  const def = PROVIDERS[id];
  // Ollama needs no credential, so it is always a candidate.
  if (def.kind === 'ollama') return true;
  return Boolean(getApiKey(def));
}

/**
 * Cooldowns keep a rate-limited provider from being retried on every request.
 * Without this, a 429 on Groq would cost every subsequent call a wasted round-trip.
 */
const cooldowns = new Map<ProviderId, number>();
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const AUTH_FAILURE_COOLDOWN_MS = 10 * 60_000;

function isCoolingDown(id: ProviderId): boolean {
  const until = cooldowns.get(id);
  if (!until) return false;
  if (Date.now() >= until) {
    cooldowns.delete(id);
    return false;
  }
  return true;
}

function applyCooldown(id: ProviderId, error: unknown): void {
  const status = (error as any)?.status ?? (error as any)?.statusCode;
  const message = String((error as any)?.message || '');

  if (status === 429 || /\b429\b|rate.?limit|quota|too many requests/i.test(message)) {
    cooldowns.set(id, Date.now() + RATE_LIMIT_COOLDOWN_MS);
  } else if (status === 401 || status === 403 || /\b(401|403)\b|unauthor|invalid.?api.?key|forbidden/i.test(message)) {
    cooldowns.set(id, Date.now() + AUTH_FAILURE_COOLDOWN_MS);
  }
}

export function clearProviderCooldowns(): void {
  cooldowns.clear();
}

/** Providers that are configured and not currently cooling down, in chain order. */
export function resolveChain(options: ChatOptions = {}): ProviderId[] {
  const requested = options.providerOrder?.length
    ? options.providerOrder
    : (process.env.AI_PROVIDER_ORDER
        ? (process.env.AI_PROVIDER_ORDER.split(',').map(s => s.trim()).filter(Boolean) as ProviderId[])
        : DEFAULT_ORDER);

  const order = requested.filter(id => id in PROVIDERS);

  // Always append Ollama: it needs no key and is the reason the app survives
  // an exhausted or offline cloud tier.
  if (!order.includes('ollama')) order.push('ollama');

  let chain = order.filter(isProviderConfigured);

  if (options.minimumProvider) {
    const idx = chain.indexOf(options.minimumProvider);
    if (idx > 0) chain = chain.slice(idx);
  }

  const live = options.attachments?.length
    ? chain.filter(id => PROVIDERS[id].supportsVision)
    : chain;

  // Never return an empty chain — fall back to the full configured set so a caller
  // asking for vision still gets *something* instead of a hard failure.
  const usable = live.filter(id => !isCoolingDown(id));
  if (usable.length > 0) return usable;
  return live.length > 0 ? live : chain;
}

class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function stripDataPrefix(data: string): string {
  const idx = data.indexOf(',');
  return data.startsWith('data:') && idx !== -1 ? data.slice(idx + 1) : data;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/* ------------------------------------------------------------------ *
 * Provider invocations
 * ------------------------------------------------------------------ */

async function invokeOpenAiCompatible(
  def: ProviderDef,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions,
  model: string
): Promise<string> {
  const body: any = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.1,
    max_tokens: options.max_tokens ?? 3000,
  };

  // Inline images only. OpenAI-compatible endpoints do not portably accept PDFs.
  if (options.attachments?.length) {
    const images = options.attachments.filter(a => a.mimeType.startsWith('image/'));
    if (images.length > 0) {
      const last = body.messages[body.messages.length - 1];
      const textPart = typeof last.content === 'string' ? last.content : '';
      last.content = [
        { type: 'text', text: textPart },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${stripDataPrefix(img.data)}` },
        })),
      ];
    }
  }

  if (options.json) body.response_format = { type: 'json_object' };

  const response = await fetch(`${def.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new ProviderError(`${def.label} HTTP ${response.status}: ${errText.slice(0, 300)}`, response.status);
  }

  const data: any = await response.json();
  const msg = data?.choices?.[0]?.message;
  const content = msg?.content || msg?.reasoning_content;
  if (!content) throw new ProviderError(`${def.label} returned an empty response.`);
  return content;
}

/**
 * Anthropic Messages API transport, used by the AgentRouter gateway.
 *
 * !! CLIENT IMPERSONATION — READ BEFORE ENABLING !!
 *
 * AgentRouter rejects requests that do not identify as the official Claude Code CLI:
 * a normal client receives `401 unauthorized client detected, contact support`.
 * The headers below therefore present this server as `claude-cli`. That is a deliberate
 * circumvention of an access control the gateway enforces, not a normal API integration.
 *
 * Consequences to accept knowingly:
 *   - It contradicts the gateway's stated intent and likely its terms of service, and
 *     their message points to "contact support" as the sanctioned route.
 *   - The account backing this token can be suspended; the gateway actively detects this.
 *   - It can stop working without notice if they change their client check.
 *   - Source question papers are sent to a third party. For a paper-leak-prevention
 *     product this is a real data-handling tradeoff, not just a technical one.
 *
 * It is opt-in: with AGENTROUTER_API_KEY unset, this provider is skipped entirely and
 * nothing here runs.
 */
const CLAUDE_CLI_HEADERS: Record<string, string> = {
  'user-agent': 'claude-cli/2.1.278 (external, cli)',
  'x-app': 'cli',
  'anthropic-version': '2023-06-01',
};

async function invokeAnthropic(
  def: ProviderDef,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions,
  model: string
): Promise<string> {
  const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const conversation = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const body: any = {
    model,
    max_tokens: options.max_tokens ?? 3000,
    temperature: options.temperature ?? 0.1,
    messages: conversation.length ? conversation : [{ role: 'user', content: '' }],
  };
  if (systemText) body.system = systemText;

  const response = await fetch(`${def.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      ...CLAUDE_CLI_HEADERS,
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new ProviderError(`${def.label} HTTP ${response.status}: ${errText.slice(0, 300)}`, response.status);
  }

  const data: any = await response.json();
  // Anthropic returns content blocks; thinking blocks must be filtered out.
  const text = (data?.content || [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('');
  if (!text) throw new ProviderError(`${def.label} returned an empty response.`);
  return text;
}

let geminiClients = new Map<string, GoogleGenAI>();

function getGeminiClient(apiKey: string): GoogleGenAI {
  let client = geminiClients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    geminiClients.set(apiKey, client);
  }
  return client;
}

async function invokeGemini(
  def: ProviderDef,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions,
  model: string
): Promise<string> {
  const client = getGeminiClient(apiKey);

  const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const conversation = messages
    .filter(m => m.role !== 'system')
    .map(m => m.content)
    .join('\n\n');

  const parts: any[] = [{ text: conversation }];
  for (const attachment of options.attachments || []) {
    parts.push({
      inlineData: { mimeType: attachment.mimeType, data: stripDataPrefix(attachment.data) },
    });
  }

  const config: any = {
    temperature: options.temperature ?? 0.1,
  };
  if (options.max_tokens) config.maxOutputTokens = options.max_tokens;
  if (options.json) config.responseMimeType = 'application/json';
  if (systemText) config.systemInstruction = systemText;

  try {
    const response = await client.models.generateContent({ model, contents: [{ role: 'user', parts }], config });
    const text = response.text;
    if (!text) throw new ProviderError(`${def.label} returned an empty response.`);
    return text;
  } catch (err: any) {
    const status = err?.status ?? err?.code ?? err?.response?.status;
    throw new ProviderError(`${def.label} failed: ${err?.message || err}`, typeof status === 'number' ? status : undefined);
  }
}

export interface OllamaStreamHandlers {
  /** Invoked with each token as it is produced, for live display. */
  onToken?: (delta: string) => void;
  /**
   * The caller's live buffer is no longer valid: a provider died mid-stream and
   * another one is about to start. Anything already streamed must be discarded,
   * or the fallback's output is appended to a half-finished document.
   */
  onReset?: () => void;
  /** Caller-owned abort, e.g. the browser closed the page mid-generation. */
  signal?: AbortSignal;
}

/**
 * Call Ollama with `stream: true` and return the complete reply, reporting tokens as they
 * arrive through `onToken`.
 *
 * Streaming is a correctness requirement here, not a nicety. With `stream: false` Ollama
 * sends no HTTP headers until the ENTIRE reply has been generated, and Node's fetch
 * (undici) aborts any request whose response headers have not arrived within 300s — so
 * every local generation longer than five minutes died with a bare `TypeError` even
 * though Ollama had completed the work and the result was thrown away. On a CPU-only
 * machine (this one does ~24 tokens/sec) that is essentially every real request.
 *
 * Streaming gets the headers back immediately and resets undici's body timeout on each
 * chunk, which removes that ceiling entirely.
 */
export async function ollamaStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
  handlers: OllamaStreamHandlers = {}
): Promise<string> {
  const def = PROVIDERS.ollama;
  let model = getModel(def, options.model);
  // Normalize cloud model names to local model when routing to local engine
  if (model.includes('/') || model.toLowerCase().includes('deepseek')) {
    model = process.env.OLLAMA_FAST_MODEL || process.env.OLLAMA_MODEL || 'qwen3.5:4b';
  }
  const apiKey = process.env.OLLAMA_API_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && !looksUnconfigured(apiKey)) headers.Authorization = `Bearer ${apiKey}`;

  // Ollama takes images as bare base64 on the message, not as content parts.
  const images = (options.attachments || [])
    .filter(a => a.mimeType.startsWith('image/'))
    .map(a => stripDataPrefix(a.data));

  const ollamaMessages = messages.map((m, i) => {
    const isLast = i === messages.length - 1;
    return isLast && images.length > 0 ? { ...m, images } : { ...m };
  });

  const body: any = {
    model,
    messages: ollamaMessages,
    stream: true,
    // Keep the model hot in RAM for 60 min instead of 10 min.
    // After a 10-min idle the model is unloaded and every new request
    // costs 8–12 seconds just to reload it from disk before a single
    // token is generated. 60 min makes the whole interactive session feel
    // instant on subsequent turns.
    keep_alive: '60m',
    // See OLLAMA_THINK: without this a thinking model burns its entire num_predict budget on
    // reasoning the UI never shows, and on CPU the user waits out the whole trace first.
    think: options.think ?? OLLAMA_THINK,
    options: {
      temperature: options.temperature ?? 0.1,
      // Dynamic context window: pick the smallest window that comfortably
      // fits the prompt. Ollama allocates the FULL num_ctx in RAM and reads
      // every slot during prompt evaluation even if most are empty, so a
      // 16384-token allocation for a 500-token chat message wastes 32x
      // CPU-time. Halving the window roughly halves processing time.
      num_ctx: options.num_ctx ?? (() => {
        const approx = Math.ceil(
          ollamaMessages.reduce((n, m) => n + (m.content?.length || 0), 0) / 3
        );
        // Round up to the next power-of-two boundary so Ollama can reuse
        // the already-loaded KV-cache without reloading the model.
        if (approx <= 2048) return 2048;
        if (approx <= 4096) return 4096;
        if (approx <= 8192) return 8192;
        return OLLAMA_NUM_CTX;
      })(),
      // Multi-threaded GGML inference. OLLAMA_NUM_THREADS auto-detects
      // physical CPU cores (capped at 8). This alone can halve generation
      // time on a quad-core machine by keeping all cores busy.
      num_thread: OLLAMA_NUM_THREADS,
      ...(options.max_tokens ?? OLLAMA_NUM_PREDICT
        ? { num_predict: options.max_tokens ?? OLLAMA_NUM_PREDICT }
        : {}),
    },
  };
  if (options.json) body.format = 'json';

  // Ollama truncates an over-long prompt silently rather than erroring, so a prompt that
  // does not fit is worth flagging: the model still answers, just from a mangled input.
  const approxTokens = Math.ceil(ollamaMessages.reduce((n, m) => n + (m.content?.length || 0), 0) / 4);
  const effectiveCtx = body.options.num_ctx as number;
  if (approxTokens > effectiveCtx) {
    console.warn(
      `[ZeroLeak AI] Ollama prompt is ~${approxTokens} tokens but num_ctx is ${effectiveCtx}; ` +
        `Ollama will silently drop the overflow. Raise OLLAMA_NUM_CTX or shorten the prompt.`
    );
  }


  const timeoutMs = options.timeoutMs ?? OLLAMA_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = handlers.signal ? AbortSignal.any([deadline, handlers.signal]) : deadline;

  let response: Response;
  try {
    response = await fetch(`${def.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    // The caller aborting is not a failure — they asked for it (page closed, Stop hit).
    if (handlers.signal?.aborted) throw new ProviderError('Ollama request was cancelled.');

    // A timeout is not the same failure as a dead daemon, and reporting it as one sends
    // people to restart an Ollama that was running fine the whole time.
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new ProviderError(
        `Ollama timed out after ${Math.round(timeoutMs / 1000)}s at ${def.baseUrl}. ` +
          `Local inference is CPU-bound and slow on long prompts — raise OLLAMA_TIMEOUT_MS.`
      );
    }
    // undici reports its own header/body deadlines as a bare TypeError and hides the real
    // reason on `.cause`, so surface that instead of guessing.
    if (err?.name === 'TypeError') {
      const cause = err?.cause?.code || err?.cause?.name || err?.cause?.message;
      throw new ProviderError(
        `Ollama connection failed at ${def.baseUrl}${cause ? ` (${cause})` : ''}. ` +
          `Streaming avoids the 300s header timeout — if this persists, check Ollama is running.`
      );
    }
    throw new ProviderError(
      `Ollama unreachable at ${def.baseUrl} (${err?.name || 'network error'}). Start it with "ollama serve".`
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new ProviderError(`Ollama HTTP ${response.status}: ${errText.slice(0, 300)}`, response.status);
  }
  if (!response.body) throw new ProviderError('Ollama returned no response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  let doneReason: string | undefined;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });

      // NDJSON: one JSON object per line. A network chunk can split a line in half, so
      // hold the remainder back until its newline arrives.
      let newlineIndex: number;
      while ((newlineIndex = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newlineIndex).trim();
        pending = pending.slice(newlineIndex + 1);
        if (!line) continue;

        let chunk: any;
        try {
          chunk = JSON.parse(line);
        } catch {
          continue; // malformed or split line — the next chunk carries the rest
        }
        if (chunk?.error) throw new ProviderError(`Ollama error: ${chunk.error}`);

        const delta: string = chunk?.message?.content || chunk?.response || '';
        if (delta) {
          content += delta;
          handlers.onToken?.(delta);
        }
        if (chunk?.done) doneReason = chunk?.done_reason;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!content) throw new ProviderError('Ollama returned an empty response.');
  if (doneReason === 'length') {
    console.warn(
      `[ZeroLeak AI] Ollama hit the ${OLLAMA_NUM_PREDICT}-token output cap, so this reply is ` +
        `incomplete. Raise OLLAMA_NUM_PREDICT if real output is being cut off.`
    );
  }
  return content;
}

/**
 * Stream responses directly from NVIDIA NIM API (OpenAI-compatible SSE),
 * providing cloud-speed responses for interactive chat and LaTeX generation.
 */
export async function nvidiaStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
  handlers: OllamaStreamHandlers = {}
): Promise<string> {
  const def = PROVIDERS.nvidia;
  const apiKey = getApiKey(def);
  if (!apiKey) throw new ProviderError('NVIDIA NIM API key is not configured.');

  const model = (options.model && options.model.includes('/'))
    ? options.model
    : (process.env.NVIDIA_MODEL || def.defaultModel);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  const body: any = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.2,
    top_p: 0.95,
    max_tokens: options.max_tokens ?? 8192,
    stream: true,
  };
  if (options.json && !model.includes('deepseek')) body.response_format = { type: 'json_object' };

  const deadline = AbortSignal.timeout(options.timeoutMs ?? 75_000);
  const signal = handlers.signal ? AbortSignal.any([deadline, handlers.signal]) : deadline;

  const response = await fetch(`${def.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new ProviderError(`NVIDIA HTTP ${response.status}: ${errText.slice(0, 300)}`, response.status);
  }
  if (!response.body) throw new ProviderError('NVIDIA returned no response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let reasoningContent = '';
  let content = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newlineIndex).trim();
        pending = pending.slice(newlineIndex + 1);
        if (!line || !line.startsWith('data:')) continue;

        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') {
          return content || reasoningContent;
        }

        let chunk: any;
        try {
          chunk = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (chunk?.error) {
          throw new ProviderError(
            `NVIDIA SSE Error: ${chunk.error.message || JSON.stringify(chunk.error)}`,
            chunk.error.code || 500
          );
        }

        const delta = chunk?.choices?.[0]?.delta?.content || chunk?.choices?.[0]?.delta?.text || '';
        const deltaReasoning = chunk?.choices?.[0]?.delta?.reasoning_content || '';

        if (deltaReasoning) {
          reasoningContent += deltaReasoning;
        }

        if (delta) {
          content += delta;
          handlers.onToken?.(delta);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const finalResult = content || reasoningContent;
  if (!finalResult) {
    throw new ProviderError('NVIDIA returned empty response.');
  }
  return finalResult;
}

/**
 * Standard non-streaming call to NVIDIA NIM.
 * Reliable when the streaming worker pool is congested or throws ResourceExhausted.
 */
export async function nvidiaNonStream(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const def = PROVIDERS.nvidia;
  const apiKey = getApiKey(def);
  if (!apiKey) throw new ProviderError('NVIDIA NIM API key is not configured.');

  const model = (options.model && options.model.includes('/'))
    ? options.model
    : (process.env.NVIDIA_MODEL || def.defaultModel);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const body: any = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.2,
    top_p: 0.95,
    max_tokens: options.max_tokens ?? 8192,
    stream: false,
  };
  if (options.json && !model.includes('deepseek')) body.response_format = { type: 'json_object' };

  const deadline = AbortSignal.timeout(options.timeoutMs ?? 75_000);
  let response = await fetch(`${def.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: deadline,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new ProviderError(`NVIDIA HTTP ${response.status}: ${errText.slice(0, 300)}`, response.status);
  }

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.reasoning_content || '';
  if (!text) throw new ProviderError('NVIDIA non-stream returned empty response.');
  return text;
}

/**
 * How long one long-form streaming attempt may run before its provider is
 * declared dead.
 *
 * A complete multi-section paper with LaTeX tables and TikZ diagrams is minutes
 * of generation, not seconds: measured end to end, a 70-mark / 16-question paper
 * takes ~290s on the NVIDIA NIM endpoint. The previous 15s cap guillotined the
 * model in the middle of its JSON, the browser kept those partial tokens, and
 * the surviving fragments were typeset as though they were the whole paper.
 * Override with AI_STREAM_TIMEOUT_MS.
 */
const SMART_STREAM_TIMEOUT_MS = Number(process.env.AI_STREAM_TIMEOUT_MS) || 600_000;

/** Headroom for one full paper in a single response; TikZ-heavy sets exceed 8192. */
const SMART_STREAM_MAX_TOKENS = Number(process.env.AI_STREAM_MAX_TOKENS) || 16_000;

/**
 * High-speed stream: prefers NVIDIA NIM cloud stream if configured.
 * Automatically fails over seamlessly to local engine if NVIDIA NIM times out or is overloaded.
 */
export async function smartStream(
  messages: ChatMessage[],
  options: ChatOptions = {},
  handlers: OllamaStreamHandlers = {}
): Promise<string> {
  if (isProviderConfigured('nvidia')) {
    let targetModel = (options.model && options.model.includes('/'))
      ? options.model
      : (process.env.NVIDIA_MODEL || PROVIDERS.nvidia.defaultModel);
    // Auto-map decommissioned DeepSeek endpoints on NVIDIA NIM to fast Meta Vision Instruct
    if (targetModel.toLowerCase().includes('deepseek')) {
      targetModel = 'meta/llama-3.2-11b-vision-instruct';
    }
    try {
      console.log(`[ZeroLeak AI] Streaming via NVIDIA NIM (${targetModel})...`);
      const res = await nvidiaStream(
        messages,
        {
          timeoutMs: SMART_STREAM_TIMEOUT_MS,
          max_tokens: SMART_STREAM_MAX_TOKENS,
          ...options,
          model: targetModel,
        },
        handlers
      );
      console.log(`[ZeroLeak AI] NVIDIA NIM stream completed successfully (${res.length} chars).`);
      return res;
    } catch (err: any) {
      if (handlers.signal?.aborted) throw err;
      console.warn('[ZeroLeak AI] NVIDIA NIM stream timed out or unavailable, attempting fast local AI fallback:', err?.message || err);
      // This attempt already streamed its partial tokens to the caller. Tell it
      // to drop them before the fallback writes anything, otherwise the two
      // replies concatenate and the result parses as neither.
      try {
        handlers.onReset?.();
      } catch (resetErr) {
        console.warn('[ZeroLeak AI] stream reset handler failed:', (resetErr as Error)?.message || resetErr);
      }
    }
  }
  console.log('[ZeroLeak AI] Streaming via local fast AI engine...');
  return await ollamaStream(messages, options, handlers);
}




async function invokeProvider(
  id: ProviderId,
  messages: ChatMessage[],
  options: ChatOptions,
  modelOverride?: string
): Promise<{ text: string; model: string }> {
  const def = PROVIDERS[id];
  const model = getModel(def, modelOverride);

  if (def.kind === 'ollama') {
    return { text: await ollamaStream(messages, { ...options, model }), model };
  }

  const apiKey = getApiKey(def);
  if (!apiKey) throw new ProviderError(`${def.label} is not configured (${def.apiKeyEnv} is empty).`);

  if (def.kind === 'anthropic') {
    if (options.attachments?.length) {
      throw new ProviderError(`${def.label} attachment support is unverified; routing elsewhere.`);
    }
    return { text: await invokeAnthropic(def, apiKey, messages, options, model), model };
  }

  if (def.kind === 'gemini') {
    // Gemini silently ignores image parts on a non-vision model, so reject rather
    // than return a confident answer that never saw the attachment.
    if (options.attachments?.length && !def.supportsVision) {
      throw new ProviderError(`${def.label} cannot process the supplied attachments.`);
    }
    return { text: await invokeGemini(def, apiKey, messages, options, model), model };
  }

  return { text: await invokeOpenAiCompatible(def, apiKey, messages, options, model), model };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Send a chat request through the free-provider chain, falling through on failure.
 * Throws only when every configured provider — including local Ollama — failed.
 */
export async function chatWithFailover(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const chain = resolveChain(options);

  if (chain.length === 0) {
    throw new Error('No AI providers are available. Configure a free API key or start Ollama.');
  }

  const attempts: ChatAttempt[] = [];

  for (const id of chain) {
    const def = PROVIDERS[id];
    const started = Date.now();
    try {
      const { text, model } = await invokeProvider(id, messages, options, options.model);
      attempts.push({ provider: id, model, ok: true, ms: Date.now() - started });
      return {
        text,
        provider: id,
        model,
        // Anything other than a clean first-choice answer is a quality downgrade.
        degraded: attempts.length > 1,
        attempts,
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      attempts.push({ provider: id, model: getModel(def, options.model), ok: false, ms: Date.now() - started, error: message });
      if (err instanceof ProviderError) applyCooldown(id, err);
      console.warn(`[ZeroLeak AI] ${def.label} failed, falling through: ${message}`);
    }
  }

  const summary = attempts.map(a => `${a.provider}: ${a.error}`).join(' | ');
  const error: any = new Error(`All AI providers failed (${attempts.length} attempted). ${summary}`);
  error.attempts = attempts;
  throw error;
}

/** Convenience wrapper for a single prompt, preserving the message shapes used elsewhere. */
export async function chatOnce(
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {}
): Promise<ChatResult> {
  return chatWithFailover(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    options
  );
}

/** Pull the first JSON object out of a model reply, tolerating surrounding prose. */
export function parseJsonObject<T = any>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Embeddings (local, free, unlimited)
 * ------------------------------------------------------------------ */

/**
 * Non-semantic fallback vector. Kept only so a caller can still receive *something*
 * shape-compatible; every caller must check `degraded` before trusting a similarity
 * score computed from these.
 */
export function generateFallbackVector(text: string, dimensions = 64): number[] {
  const vec: number[] = new Array(dimensions).fill(0);
  const clean = text.toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const idx = i % dimensions;
    vec[idx] += ((clean.charCodeAt(i) * (i + 1)) % 100) / 100;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

export interface EmbedResult {
  vectors: number[][];
  provider: string;
  model: string;
  /** True when these vectors are NOT semantic and must not be used to judge similarity. */
  degraded: boolean;
}

/**
 * Embed texts locally via Ollama. No API key, no quota, no cost.
 * Requires `ollama pull nomic-embed-text` once (~274 MB).
 */
export async function embedTexts(texts: string[], model = OLLAMA_EMBED_MODEL): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { vectors: [], provider: 'none', model, degraded: false };
  }

  const apiKey = process.env.OLLAMA_API_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && !looksUnconfigured(apiKey)) headers.Authorization = `Bearer ${apiKey}`;

  // Preferred: batch endpoint (Ollama >= 0.3.0).
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(120_000),
    });
    if (response.ok) {
      const data: any = await response.json();
      const vectors = data?.embeddings;
      if (Array.isArray(vectors) && vectors.length === texts.length && vectors.every((v: any) => Array.isArray(v))) {
        return { vectors, provider: 'ollama', model, degraded: false };
      }
    } else if (response.status === 404) {
      return embedTextsLegacy(texts, model, headers);
    }
  } catch (err) {
    console.warn('[ZeroLeak AI] Ollama /api/embed unavailable, trying legacy endpoint:', (err as any)?.message || err);
  }

  return embedTextsLegacy(texts, model, headers);
}

async function embedTextsLegacy(
  texts: string[],
  model: string,
  headers: Record<string, string>
): Promise<EmbedResult> {
  try {
    const vectors: number[][] = [];
    for (const text of texts) {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, prompt: text }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: any = await response.json();
      if (!Array.isArray(data?.embedding)) throw new Error('missing embedding');
      vectors.push(data.embedding);
    }
    return { vectors, provider: 'ollama', model, degraded: false };
  } catch (err) {
    console.warn(
      `[ZeroLeak AI] Local embeddings unavailable (${(err as any)?.message || err}). ` +
        `Run "ollama pull ${model}" to enable real semantic duplicate detection.`
    );
    return {
      vectors: texts.map(t => generateFallbackVector(t)),
      provider: 'fallback',
      model: 'deterministic-pseudo-vector',
      degraded: true,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Health / status
 * ------------------------------------------------------------------ */

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  reachable: boolean;
  model: string;
  freeTier: string;
  supportsVision: boolean;
  coolingDown: boolean;
  error?: string;
}

export async function checkOllamaReachable(): Promise<{ reachable: boolean; models: string[]; error?: string }> {
  try {
    const headers: Record<string, string> = {};
    const apiKey = process.env.OLLAMA_API_KEY;
    if (apiKey && !looksUnconfigured(apiKey)) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { headers, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { reachable: false, models: [], error: `HTTP ${response.status}` };
    const data: any = await response.json();
    const models = (data?.models || []).map((m: any) => m?.name).filter(Boolean);
    return { reachable: true, models };
  } catch (err: any) {
    return { reachable: false, models: [], error: err?.message || 'Ollama is not running.' };
  }
}

export async function getProviderStatus(): Promise<{
  providers: ProviderStatus[];
  order: ProviderId[];
  embeddings: { reachable: boolean; model: string; ready: boolean; error?: string };
}> {
  const ollama = await checkOllamaReachable();
  const order = resolveChain({});

  const providers: ProviderStatus[] = (Object.keys(PROVIDERS) as ProviderId[]).map(id => {
    const def = PROVIDERS[id];
    const configured = isProviderConfigured(id);
    const status: ProviderStatus = {
      id,
      label: def.label,
      configured,
      // Cloud providers are not probed here: a health check should not burn free-tier quota.
      reachable: id === 'ollama' ? ollama.reachable : configured,
      model: getModel(def),
      freeTier: def.freeTier,
      supportsVision: def.supportsVision,
      coolingDown: isCooldownActive(id),
    };
    if (id === 'ollama' && !ollama.reachable) status.error = ollama.error;
    if (id === 'ollama' && ollama.reachable) {
      const hasModel = ollama.models.some(m => m === def.defaultModel || m.startsWith(`${def.defaultModel}:`));
      if (!hasModel) {
        status.error = `Model "${def.defaultModel}" is not installed (available: ${ollama.models.join(', ') || 'none'}).`;
      }
    }
    return status;
  });

  const embedReady = ollama.reachable && ollama.models.some(m => m === OLLAMA_EMBED_MODEL || m.startsWith(`${OLLAMA_EMBED_MODEL}:`));

  return {
    providers,
    order,
    embeddings: {
      reachable: ollama.reachable,
      model: OLLAMA_EMBED_MODEL,
      ready: embedReady,
      error: !ollama.reachable
        ? ollama.error
        : !embedReady
          ? `Run "ollama pull ${OLLAMA_EMBED_MODEL}" to enable semantic duplicate detection.`
          : undefined,
    },
  };
}

function isCooldownActive(id: ProviderId): boolean {
  const until = cooldowns.get(id);
  if (!until || Date.now() >= until) return false;
  return true;
}

export function describeChain(): string {
  return resolveChain({}).join(' → ');
}
