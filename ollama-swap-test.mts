import 'dotenv/config';
import { ollamaStream } from './server/aiProviders.ts';

/**
 * The app will alternate models: 3B for chat/answering, 7B for extraction. On a CPU-only
 * host Ollama keeps only ONE model loaded by default, so each switch forces an eviction and
 * reload — the exact condition in which one earlier request stalled for 900s.
 *
 * This alternates deliberately to find out whether that stall is reproducible or was a fluke.
 */
const BIG = 'qwen2.5vl:7b';
const FAST = 'qwen2.5:3b';
const ROUNDS = 3;

async function ask(model: string, prompt: string, timeoutMs = 240_000) {
  const started = Date.now();
  try {
    const text = await ollamaStream([{ role: 'user', content: prompt }], { model, max_tokens: 24, timeoutMs });
    return { ok: true, ms: Date.now() - started, text: text.trim().slice(0, 40) };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - started, text: e.message };
  }
}

// Warm both so the first round is not a cold load.
await ask(BIG, 'Say OK');
await ask(FAST, 'Say OK');
console.log('both models warmed; alternating now\n');

let slowest = 0;
for (let round = 1; round <= ROUNDS; round++) {
  for (const model of [BIG, FAST]) {
    const r = await ask(model, 'Reply with just the word READY.');
    slowest = Math.max(slowest, r.ms);
    const secs = (r.ms / 1000).toFixed(1);
    const flag = r.ok ? '' : '  <-- FAILED';
    // A swap costs a full reload (~11-14s); a warm answer is ~1-4s.
    const kind = !r.ok ? 'FAILED' : r.ms > 8000 ? 'RELOAD' : 'warm';
    console.log(`round ${round} ${model.padEnd(14)} ${secs.padStart(6)}s  ${kind.padEnd(7)} ${JSON.stringify(r.text)}${flag}`);
  }
}

console.log(`\nslowest single request: ${(slowest / 1000).toFixed(1)}s`);
console.log(slowest > 120_000 ? 'VERDICT: alternation is NOT safe — a request stalled badly.' : 'VERDICT: alternation is safe, only reload cost.');
