import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTexliveNetForm, compileWithTexliveNet, FREE_LATEX_ENGINES } from './formatex.ts';
import {
  API_ONLY_KEYLESS_TOOLS,
  EXCLUDED_LATEX_EDITORS,
  FREE_AI_LATEX_EDITORS,
  FREE_AI_LATEX_WEB_TOOLS,
  FREE_COMPILE_ENGINES,
  framePolicyAllowsEmbedding,
  freeAiWebToolIds,
  freeEngineIds,
  getFreeAiLatexStatus,
  hfSpaceRuntimeHost,
  probeAiLatexWebTool,
  probeAiLatexWebTools,
  runFreeAiLatexSelfTest,
  type FreeAiLatexStatusDeps,
  type SelfTestDeps,
  type WebToolProbeDeps,
} from './freeAiLatexTools.ts';

const OK = async () => ({ connected: true });
const DOWN = async (): Promise<{ connected: boolean; error?: string }> => ({
  connected: false,
  error: 'refused',
});

function deps(overrides: Partial<FreeAiLatexStatusDeps> = {}): FreeAiLatexStatusDeps {
  return {
    clsi: DOWN,
    latexonline: DOWN,
    texlive: DOWN,
    providers: async () => ({ providers: [] }),
    ...overrides,
  };
}

const OLLAMA_UP = async () => ({
  providers: [
    {
      id: 'ollama',
      label: 'Ollama (local)',
      configured: true,
      reachable: true,
      model: 'qwen2.5vl:7b',
      freeTier: 'Unlimited - local, no key, no quota',
    },
  ],
});

const OLLAMA_DOWN = async () => ({
  providers: [
    {
      id: 'ollama',
      label: 'Ollama (local)',
      configured: true,
      reachable: false,
      model: 'qwen2.5vl:7b',
      freeTier: 'Unlimited - local, no key, no quota',
      error: 'ECONNREFUSED',
    },
  ],
});

// --- registry integrity ---------------------------------------------------

test('every qualifying editor proves both criteria: a license, an AI, and a reason it is free', () => {
  assert.ok(FREE_AI_LATEX_EDITORS.length > 0, 'the registry must not be empty');
  for (const editor of FREE_AI_LATEX_EDITORS) {
    assert.ok(editor.id, 'editor needs an id');
    assert.ok(editor.name, `${editor.id} needs a name`);
    assert.ok(editor.license.length > 3, `${editor.id} must name its license`);
    assert.ok(editor.ai.length > 30, `${editor.id} must describe its AI integration`);
    assert.ok(editor.freeBasis.length > 20, `${editor.id} must justify being free`);
    assert.ok(editor.evidence.length > 20, `${editor.id} must cite where the claim was checked`);
    assert.match(editor.homepage, /^https:\/\//, `${editor.id} homepage must be https`);
    // "Free" is the claim that rots, so nothing may be listed without a source.
    assert.ok(!/unknown|todo|tbd/i.test(editor.evidence), `${editor.id} evidence is a placeholder`);
  }
});

test('editor ids are unique across the included and excluded lists', () => {
  const included = FREE_AI_LATEX_EDITORS.map(e => e.id);
  const excluded = EXCLUDED_LATEX_EDITORS.map(e => e.id);
  assert.equal(new Set(included).size, included.length, 'duplicate included id');
  assert.equal(new Set(excluded).size, excluded.length, 'duplicate excluded id');
  for (const id of included) {
    assert.ok(!excluded.includes(id), `${id} is both included and excluded`);
  }
});

test('every excluded editor states which criterion it fails', () => {
  assert.ok(EXCLUDED_LATEX_EDITORS.length >= 4, 'the near-misses are the honest half of the research');
  for (const editor of EXCLUDED_LATEX_EDITORS) {
    assert.ok(editor.reason.length > 40, `${editor.id} needs a substantive reason`);
    assert.match(editor.reason, /fail|paid|free|unclear|no AI|unverifiab/i, `${editor.id} reason is not a verdict`);
  }
});

// --- drift between the registry and the compiler chain --------------------

test('the free compile engines the registry advertises are exactly the ones formatex.ts tries first', () => {
  assert.deepEqual(
    freeEngineIds(),
    [...FREE_LATEX_ENGINES],
    'FREE_COMPILE_ENGINES and FREE_LATEX_ENGINES have drifted apart'
  );
});

test('every advertised free engine is documented as keyless', () => {
  for (const engine of FREE_COMPILE_ENGINES) {
    assert.match(engine.name, /\S/, `${engine.engine} needs a name`);
    assert.match(engine.url, /^https?:\/\//, `${engine.engine} needs a url`);
    assert.match(engine.freeBasis, /no key|no account|no api key|no quota|on this machine/i,
      `${engine.engine} must state why it costs nothing`);
    assert.ok(engine.evidence.length > 10, `${engine.engine} must cite evidence`);
  }
});

test('the wall-clock chain puts every free engine ahead of the metered one', () => {
  // The metered tier is FormaTeX; free engines must precede it in the auto path.
  const order = [...FREE_LATEX_ENGINES];
  assert.ok(order.includes('clsi') && order.includes('latexonline') && order.includes('texlive'));
  assert.ok(!order.includes('formatex' as never), 'the metered tier must not be in the free list');
});

// --- texlive.net form contract -------------------------------------------

test('the texlive.net form carries exactly the four accepted fields', () => {
  const form = buildTexliveNetForm('\\documentclass{article}\\begin{document}x\\end{document}');
  // texlive.net rejects the *entire* submission when it sees an unknown field,
  // so an extra field is a silent total failure rather than a warning.
  assert.deepEqual([...form.keys()].sort(), ['engine', 'filecontents[]', 'filename[]', 'return']);
  assert.equal(form.get('engine'), 'pdflatex');
  assert.equal(form.get('return'), 'pdf');
  assert.equal(form.get('filename[]'), 'document.tex', 'the root document must be named document.tex');
  assert.match(String(form.get('filecontents[]')), /documentclass/);
});

test('the texlive.net form maps each supported engine and refuses to invent one', () => {
  assert.equal(buildTexliveNetForm('x', 'xelatex').get('engine'), 'xelatex');
  assert.equal(buildTexliveNetForm('x', 'lualatex').get('engine'), 'lualatex');
  assert.equal(buildTexliveNetForm('x', 'latexmk').get('engine'), 'pdflatex');
  assert.equal(buildTexliveNetForm('x', 'nonsense').get('engine'), 'pdflatex');
});

test('empty LaTeX is rejected before any request is made', async () => {
  const res = await compileWithTexliveNet({ latex: '   ' });
  assert.equal(res.success, false);
  assert.match(res.error || '', /No LaTeX source/i);
  assert.equal(res.compilerService, undefined, 'a rejected request must not claim a compiler');
});

// --- free-path status ----------------------------------------------------

test('a paper can be built entirely for free when one free compiler and local AI answer', async () => {
  const status = await getFreeAiLatexStatus(deps({ texlive: OK, providers: OLLAMA_UP }));
  assert.equal(status.fullyFreePathAvailable, true);
  assert.equal(status.enginesOnline, 1);
  assert.equal(status.localAi.reachable, true);
  assert.equal(status.engines.length, 3, 'all three free engines are reported, online or not');
  assert.equal(status.editors.total, FREE_AI_LATEX_EDITORS.length);
});

test('the free verdict is false when nothing answers', async () => {
  const status = await getFreeAiLatexStatus(deps({ providers: OLLAMA_DOWN }));
  assert.equal(status.fullyFreePathAvailable, false);
  assert.equal(status.enginesOnline, 0);
  assert.ok(status.notes.some(n => /No free LaTeX compiler is reachable/.test(n)));
  assert.ok(status.notes.some(n => /No AI backend is reachable/.test(n)));
});

test('free engines do not need local AI when a free-tier cloud provider is configured', async () => {
  const status = await getFreeAiLatexStatus(
    deps({
      clsi: OK,
      providers: async () => ({
        providers: [
          {
            id: 'gemini',
            label: 'Google Gemini',
            configured: true,
            reachable: true,
            model: 'gemini-3.7-flash',
            freeTier: '~15 RPM / ~1500 RPD - free, no card',
          },
        ],
      }),
    })
  );
  assert.equal(status.fullyFreePathAvailable, true);
  assert.equal(status.localAi.reachable, false, 'a cloud-only setup must not claim local AI');
  assert.deepEqual(status.freeCloudAiConfigured.map(p => p.id), ['gemini']);
});

test('Ollama is reported as local AI and never as a cloud provider', async () => {
  const status = await getFreeAiLatexStatus(deps({ providers: OLLAMA_UP }));
  assert.equal(status.localAi.model, 'qwen2.5vl:7b');
  assert.deepEqual(status.freeCloudAiConfigured, [], 'Ollama is local, not a cloud key');
});

test('a partial free fleet is called out instead of silently falling through to a paid tier', async () => {
  const status = await getFreeAiLatexStatus(deps({ clsi: OK, providers: OLLAMA_UP }));
  assert.equal(status.enginesOnline, 1);
  assert.equal(status.fullyFreePathAvailable, true);
  assert.ok(
    status.notes.some(n => /Only 1 of 3 free compilers answered/.test(n)),
    'the degraded fleet must be visible'
  );
});

test('a probe that throws is reported as down rather than failing the whole status', async () => {
  const status = await getFreeAiLatexStatus(
    deps({
      texlive: async () => {
        throw new Error('socket hang up');
      },
      clsi: OK,
      providers: OLLAMA_UP,
    })
  );
  const texlive = status.engines.find(e => e.engine === 'texlive');
  assert.equal(texlive?.connected, false);
  assert.match(texlive?.error || '', /socket hang up/);
  assert.equal(status.enginesOnline, 1);
});

test('a provider registry failure does not take the engine report down with it', async () => {
  const status = await getFreeAiLatexStatus(
    deps({
      clsi: OK,
      providers: async () => {
        throw new Error('provider registry exploded');
      },
    })
  );
  assert.equal(status.enginesOnline, 1);
  assert.equal(status.localAi.reachable, false);
  assert.equal(status.fullyFreePathAvailable, false);
});

// --- the AI + LaTeX self-test ---------------------------------------------

const PDF = Buffer.from('%PDF-1.7 fake');
const MATH_REPLY = 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}';

function pdfEngine() {
  return async () => ({ success: true, pdfBuffer: PDF });
}

function selfTestDeps(overrides: Partial<SelfTestDeps> = {}): Partial<SelfTestDeps> {
  const compile: Record<string, SelfTestDeps['compile'][string]> = {
    clsi: async () => ({ success: false, error: 'docker is not running' }),
    latexonline: pdfEngine(),
    texlive: pdfEngine(),
  };
  return {
    compile,
    providers: async () => ({
      providers: [
        { id: 'gemini', label: 'Google Gemini', configured: true, model: 'gemini-3.7-flash' },
        { id: 'ollama', label: 'Ollama (local)', configured: true, model: 'qwen2.5vl:7b' },
      ],
    }),
    chat: async () => ({ text: MATH_REPLY, provider: 'gemini', model: 'gemini-3.7-flash' }),
    now: (() => {
      let t = 0;
      return () => (t += 10);
    })(),
    ...overrides,
  };
}

const SELF_TEST_INTENT = 'Output a complete minimal LaTeX document';

/** The end-to-end pass must return a document, not the one-line math answer. */
const SELF_TEST_CHAT = async (id: string, _system: string, user: string) => ({
  text: user.includes(SELF_TEST_INTENT) ? '````latex\n\\documentclass{article}\n\\\\begin{document}ZeroLeak\\end{document}\n```' : MATH_REPLY,
  provider: id,
  model: 'test-model',
});

test('the self-test proves each free engine compiled and each configured provider answered', async () => {
  const result = await runFreeAiLatexSelfTest(selfTestDeps({ chat: SELF_TEST_CHAT }));
  assert.equal(result.enginesTested, 3);
  assert.equal(result.enginesWorking, 2, 'clsi is down in this fixture');
  assert.equal(result.aiTested, 2);
  assert.equal(result.aiWorking, 2);
  assert.equal(result.ok, true, 'the end-to-end path succeeded so the suite passes');
  assert.equal(result.endToEnd.ok, true);
  assert.equal(result.endToEnd.engine, 'latexonline', 'the first working free engine is used');
  assert.equal(result.endToEnd.provider, 'gemini');
  assert.equal(result.endToEnd.pdfBytes, PDF.length);
});

test('the self-test renders with a model round trip: a real compile must have happened', async () => {
  const compiled: string[] = [];
  const result = await runFreeAiLatexSelfTest(
    selfTestDeps({
      compile: {
        clsi: async () => ({ success: false, error: 'down' }),
        latexonline: async (latex: string) => {
          compiled.push(latex);
          return { success: true, pdfBuffer: PDF };
        },
        texlive: async () => ({ success: false, error: 'down' }),
      },
      chat: SELF_TEST_CHAT,
    })
  );
  assert.equal(result.endToEnd.ok, true);
  // The code fences came off and the promoted document reached the compiler.
  assert.ok(compiled.some(l => l.includes('ZeroLeak') && !l.includes('``')));
  assert.ok(result.endToEnd.latex?.includes('documentclass'));
});

test('a PDF-less response is a failed engine, not a success', async () => {
  const result = await runFreeAiLatexSelfTest(
    selfTestDeps({
      compile: {
        clsi: async () => ({ success: false, error: 'down' }),
        latexonline: async () => ({ success: true, pdfBuffer: Buffer.from('<html>error log</html>') }),
        texlive: async () => ({ success: false, error: 'down' }),
      },
      chat: SELF_TEST_CHAT,
    })
  );
  const online = result.items.find(i => i.id === 'latexonline');
  assert.equal(online?.ok, false);
  assert.equal(result.enginesWorking, 0);
  assert.equal(result.endToEnd.ok, false, 'no engine works, so nothing can be proven end to end');
  assert.match(result.endToEnd.error || '', /no working AI provider and free compiler/i);
});

test('an engine that throws is reported with its error rather than crashing the run', async () => {
  const result = await runFreeAiLatexSelfTest(
    selfTestDeps({
      compile: {
        clsi: async () => {
          throw new Error('ECONNREFUSED 127.0.0.1:3013');
        },
        latexonline: pdfEngine(),
        texlive: pdfEngine(),
      },
      chat: SELF_TEST_CHAT,
    })
  );
  const clsi = result.items.find(i => i.id === 'clsi');
  assert.equal(clsi?.ok, false);
  assert.match(clsi?.error || '', /ECONNREFUSED/);
  assert.equal(result.ok, true, 'the other engines still carried the run');
});

test('a provider that returns prose instead of an answer is marked broken', async () => {
  const result = await runFreeAiLatexSelfTest(
    selfTestDeps({
      chat: async (id: string, _s: string, user: string) => ({
        text: user.includes(SELF_TEST_INTENT) ? '\\documentclass{article}' : 'I am unable to help with that request.',
        provider: id,
        model: 'test-model',
      }),
    })
  );
  assert.equal(result.aiWorking, 0);
  const gemini = result.items.find(i => i.kind === 'ai' && i.id === 'gemini');
  assert.equal(gemini?.ok, false);
  assert.match(gemini?.error || '', /usable characters/);
  assert.equal(result.endToEnd.ok, false, 'no provider answered, so nothing is promoted to end to end');
});

test('a provider that throws surfaces its error and does not abort the engines', async () => {
  const result = await runFreeAiLatexSelfTest(
    selfTestDeps({
      chat: async () => {
        throw new Error('401 invalid api key');
      },
    })
  );
  assert.equal(result.enginesWorking, 2, 'engine results survive an AI failure');
  assert.equal(result.aiWorking, 0);
  assert.match(result.items.find(i => i.kind === 'ai')?.error || '', /401 invalid api key/);
});

test('with no AI provider configured the self-test says so instead of passing', async () => {
  const result = await runFreeAiLatexSelfTest(
    selfTestDeps({
      providers: async () => ({ providers: [{ id: 'ollama', label: 'Ollama (local)', configured: false, model: 'none' }] }),
    })
  );
  assert.equal(result.aiTested, 0);
  assert.equal(result.aiWorking, 0);
  assert.equal(result.ok, false);
  assert.match(result.endToEnd.error || '', /no working AI provider/i);
});

test('each provider is asked on its own so a failover cannot fake a pass', async () => {
  const asked: string[] = [];
  await runFreeAiLatexSelfTest(
    selfTestDeps({
      chat: async (id: string) => {
        asked.push(id);
        return { text: MATH_REPLY, provider: id, model: 'test-model' };
      },
    })
  );
  assert.ok(asked.includes('gemini'), 'gemini must be asked directly');
  assert.ok(asked.includes('ollama'), 'ollama must be asked directly');
});

test('local inference is given a longer budget than a cloud tier', async () => {
  const budgets: Record<string, number> = {};
  await runFreeAiLatexSelfTest(
    selfTestDeps({
      chat: async (id: string, _s: string, _u: string, timeoutMs: number) => {
        budgets[id] = timeoutMs;
        return { text: MATH_REPLY, provider: id, model: 'test-model' };
      },
    })
  );
  assert.ok(budgets.ollama > budgets.gemini, 'CPU inference needs the longer leash');
});

// --- browser-usable, key-free AI tools ------------------------------------

/** Headers as a fetch Response exposes them, so the policy rule can be tested alone. */
const headers = (values: Record<string, string> = {}) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

const webToolProbeDeps = (overrides: Partial<WebToolProbeDeps> = {}): WebToolProbeDeps => ({
  fetch: async () => ({ status: 200, headers: headers() }),
  now: () => 1000,
  ...overrides,
});

test('every browser AI tool names a model, a key-free basis and an evidence line', () => {
  assert.ok(FREE_AI_LATEX_WEB_TOOLS.length > 0, 'the browser tool list must not be empty');
  for (const tool of FREE_AI_LATEX_WEB_TOOLS) {
    assert.ok(tool.id, 'tool needs an id');
    assert.match(tool.url, /^https:\/\//, `${tool.id} must be bookmarked over https`);
    assert.ok(tool.model.length > 5, `${tool.id} must name the model that answers`);
    assert.ok(tool.ai.length > 30, `${tool.id} must describe the AI feature`);
    assert.ok(tool.keylessBasis.length > 20, `${tool.id} must justify needing no API key`);
    assert.ok(tool.evidence.length > 20, `${tool.id} must cite where the claim was checked`);
    assert.ok(tool.embedEvidence.length > 20, `${tool.id} must record how embeddability was measured`);
    assert.ok(!/unknown|todo|tbd/i.test(tool.evidence), `${tool.id} evidence is a placeholder`);
  }
});

test('no browser bookmark is a source repository', () => {
  // A github.com link in the pane shows source code to someone who wanted to
  // write a paper. Desktop editors stay in the research list, not the browser.
  for (const tool of FREE_AI_LATEX_WEB_TOOLS) {
    assert.ok(
      !/github\.com|gitlab\.com|bitbucket\.org/i.test(tool.url),
      `${tool.id} is bookmarked at a repository instead of a usable tool`
    );
  }
});

test('a Hugging Face Space is bookmarked at its runtime host, never its page', () => {
  // huggingface.co/spaces/... sends X-Frame-Options: DENY, so that exact URL
  // renders as an empty frame. The Space's own *.hf.space host does not.
  const hfTools = FREE_AI_LATEX_WEB_TOOLS.filter(t => !t.url.includes('openai.com'));
  assert.ok(hfTools.length > 0, 'expected at least one hosted model bookmark');
  for (const tool of hfTools) {
    assert.match(tool.url, /^https:\/\/[a-z0-9.-]+\.hf\.space\/$/, `${tool.id} must use the Space runtime host`);
    assert.ok(!tool.url.includes('huggingface.co'), `${tool.id} points at the page that refuses framing`);
  }
});

test('every browser bookmark is declared embeddable, because a blocked one is a blank pane', () => {
  for (const tool of FREE_AI_LATEX_WEB_TOOLS) {
    assert.equal(tool.embed, 'verified', `${tool.id} must not be shipped with a blocked embed verdict`);
  }
});

test('browser tool ids are unique and any editor overlap is the same product', () => {
  const ids = freeAiWebToolIds();
  assert.equal(new Set(ids).size, ids.length, 'duplicate browser tool id');

  // An overlap is allowed - Prism is both a free AI editor and a browser
  // bookmark - but only when the two entries really are one product, so a
  // careless id reuse cannot silently point a bookmark at the wrong tool.
  const editorsById = new Map(FREE_AI_LATEX_EDITORS.map(e => [e.id, e]));
  for (const tool of FREE_AI_LATEX_WEB_TOOLS) {
    const editor = editorsById.get(tool.id);
    if (!editor) continue;
    assert.equal(
      new URL(tool.url).origin,
      new URL(editor.homepage).origin,
      `${tool.id} is listed as a bookmark and an editor, but they are different products`
    );
  }
});

test('a Space id maps to the runtime host Hugging Face actually serves', () => {
  assert.equal(hfSpaceRuntimeHost('lukbl/LaTeX-OCR'), 'https://lukbl-latex-ocr.hf.space/');
  assert.equal(hfSpaceRuntimeHost('nvidia/nemotron-ocr-v2'), 'https://nvidia-nemotron-ocr-v2.hf.space/');
});

test('the framing rule allows an absent policy and refuses everything else', () => {
  assert.equal(framePolicyAllowsEmbedding(headers()).embeddable, true);
  assert.equal(framePolicyAllowsEmbedding(headers({ 'x-frame-options': 'DENY' })).embeddable, false);
  assert.equal(framePolicyAllowsEmbedding(headers({ 'x-frame-options': 'SAMEORIGIN' })).embeddable, false);
  assert.equal(
    framePolicyAllowsEmbedding(headers({ 'content-security-policy': "frame-ancestors 'self'" })).embeddable,
    false
  );
  assert.equal(
    framePolicyAllowsEmbedding(headers({ 'content-security-policy': "default-src 'self'; frame-ancestors *" })).embeddable,
    true
  );
  // A scheme-wide policy still excludes a localhost pane, so it must not pass as allowed.
  assert.equal(
    framePolicyAllowsEmbedding(headers({ 'content-security-policy': 'frame-ancestors https:' })).embeddable,
    false
  );
});

test('the framing rule prefers frame-ancestors when both headers are present', () => {
  const verdict = framePolicyAllowsEmbedding(
    headers({ 'content-security-policy': 'frame-ancestors *', 'x-frame-options': 'DENY' })
  );
  assert.equal(verdict.embeddable, true);
  assert.match(verdict.reason, /frame-ancestors/);
});

test('a probe reports a 200 HTML page with no framing policy as usable', async () => {
  const probe = await probeAiLatexWebTool(
    { id: 'x', url: 'https://example.test/' },
    webToolProbeDeps({ fetch: async () => ({ status: 200, headers: headers({ 'content-type': 'text/html; charset=utf-8' }) }) })
  );
  assert.equal(probe.reachable, true);
  assert.equal(probe.embeddable, true);
  assert.equal(probe.interactive, true);
  assert.equal(probe.sleeping, false);
  assert.equal(probe.error, undefined);
});

test('a JSON API is not interactive even though it answers 200 and may be framed', async () => {
  // This is the exact shape that slipped through a status-only check: two TikZ
  // Spaces returned 200 application/json, 41 bytes, with no framing policy.
  const probe = await probeAiLatexWebTool(
    { id: 'x', url: 'https://example.test/' },
    webToolProbeDeps({
      fetch: async () => ({ status: 200, headers: headers({ 'content-type': 'application/json' }) }),
    })
  );
  assert.equal(probe.reachable, true);
  assert.equal(probe.embeddable, true);
  assert.equal(probe.interactive, false);
  assert.match(probe.error || '', /application\/json/);
});

test('a probe reports a framing refusal as not embeddable even when the host is up', async () => {
  const probe = await probeAiLatexWebTool(
    { id: 'x', url: 'https://example.test/' },
    webToolProbeDeps({
      fetch: async () => ({ status: 200, headers: headers({ 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN' }) }),
    })
  );
  assert.equal(probe.reachable, true);
  assert.equal(probe.embeddable, false);
  assert.match(probe.embedReason, /sameorigin/i);
});

test('a 503 is reported as a sleeping Space rather than a broken tool', async () => {
  const probe = await probeAiLatexWebTool(
    { id: 'x', url: 'https://example.test/' },
    webToolProbeDeps({ fetch: async () => ({ status: 503, headers: headers() }) })
  );
  assert.equal(probe.sleeping, true);
  assert.equal(probe.reachable, false);
});

test('a host that never answers is reported with its error instead of throwing', async () => {
  const probe = await probeAiLatexWebTool(
    { id: 'x', url: 'https://example.test/' },
    webToolProbeDeps({
      fetch: async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      },
    })
  );
  assert.equal(probe.reachable, false);
  assert.equal(probe.embeddable, false);
  assert.match(probe.error || '', /ENOTFOUND/);
});

test('the bookmark probe covers every registered tool and counts only usable ones', async () => {
  const probed: string[] = [];
  const report = await probeAiLatexWebTools({
    fetch: async (url: string) => {
      probed.push(url);
      // Half the fleet asleep, half awake: the count must reflect that.
      const sleeping = probed.length % 2 === 0;
      return { status: sleeping ? 503 : 200, headers: headers({ 'content-type': 'text/html' }) };
    },
    now: () => 1000,
  });

  assert.equal(report.tools.length, FREE_AI_LATEX_WEB_TOOLS.length);
  assert.deepEqual(probed.sort(), FREE_AI_LATEX_WEB_TOOLS.map(t => t.url).sort());
  assert.ok(report.usableNow > 0 && report.usableNow < report.tools.length, 'count must not assume every tool is up');
});

test('an API-only backend is recorded as excluded with the measurement that caught it', () => {
  assert.ok(API_ONLY_KEYLESS_TOOLS.length > 0, 'the excluded browser tools must be recorded, not deleted');
  for (const tool of API_ONLY_KEYLESS_TOOLS) {
    assert.ok(tool.reason.length > 30, `${tool.id} must say why it cannot be a bookmark`);
    assert.match(tool.url, /^https:\/\//, `${tool.id} needs the measured URL`);
    // The whole point of the list is that a 200 + framable host was not enough.
    assert.match(tool.reason, /json|api/i, `${tool.id} must name the API-only shape`);
  }
});

test('nothing excluded as API-only is also shipped as a bookmark', () => {
  const bookmarked = new Set(FREE_AI_LATEX_WEB_TOOLS.map(t => t.url));
  for (const tool of API_ONLY_KEYLESS_TOOLS) {
    assert.ok(!bookmarked.has(tool.url), `${tool.id} is both excluded and bookmarked`);
  }
});

