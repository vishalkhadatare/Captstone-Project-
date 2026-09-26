/**
 * Free AI-integrated LaTeX toolchains, as researched and verified.
 *
 * The question this answers is narrow and the answer is uncomfortable: which
 * LaTeX editors are *both* (a) genuinely free - no paywall, no metered AI tier -
 * and (b) ship an AI assistant? Almost nothing qualifies outright. Overleaf,
 * TypeTeX, Contour, Bibby, Murfy and Octree all keep their assistant behind a
 * paid tier, and the free-and-open-source editors (TeXstudio, OpalaTex,
 * LMMs-Lab Writer, ai-latex-editor, this app) are free only because their
 * assistant can be pointed at a *local* model - which is exactly what
 * `aiProviders.ts` already does through Ollama.
 *
 * So the list below is split three ways on purpose:
 *   - `FREE_AI_LATEX_EDITORS`  - both criteria met (AI assistant + no cost).
 *   - `FREE_COMPILE_ENGINES`   - the zero-key typesetters the AI output is
 *                                compiled with; this is what actually plugs into
 *                                the paper-generation pipeline.
 *   - `EXCLUDED_LATEX_EDITORS` - the near misses, each with the reason it fails,
 *                                so the research is not silently a shopping list.
 *
 * Every claim carries the source it was checked against, because "free" is the
 * kind of statement that quietly stops being true.
 */
import {
  FREE_LATEX_ENGINES,
  compileWithLatexOnline,
  compileWithLocalClsi,
  compileWithTexliveNet,
  getLatexOnlineHealth,
  getLocalClsiHealth,
  getTexliveNetHealth,
  sanitizeLatexSource,
} from './formatex.ts';
import { chatWithFailover, getProviderStatus, type ProviderId } from './aiProviders.ts';

export type FreeToolKind = 'cloud-editor' | 'desktop-editor' | 'web-editor' | 'compile-engine';

export interface FreeAiLatexEditor {
  id: string;
  name: string;
  kind: FreeToolKind;
  homepage: string;
  repo?: string;
  license: string;
  /** What its AI assistant is and how it is wired to a model. */
  ai: string;
  /** Where that AI endpoint lives, when it is a configurable one. */
  aiEndpoint?: string;
  /** Why using it costs nothing. */
  freeBasis: string;
  /** The source the license/AI/free claims were checked against. */
  evidence: string;
  /** The honest limit of the "free" claim, when it has one. */
  caveat?: string;
}

export interface FreeCompileEngine {
  /** Must be one of `FREE_LATEX_ENGINES` in formatex.ts. */
  engine: 'clsi' | 'latexonline' | 'texlive';
  name: string;
  url: string;
  license: string;
  /** Cost and quota situation. */
  freeBasis: string;
  evidence: string;
}

export interface ExcludedLatexEditor {
  id: string;
  name: string;
  homepage: string;
  /** Which of the two criteria it fails, and why. */
  reason: string;
}

/**
 * Editors that are free *and* have an AI assistant.
 *
 * Note what these have in common: not one of them buys the AI for you. The
 * assistant is free because it can talk to a model running on your own machine.
 */
export const FREE_AI_LATEX_EDITORS: FreeAiLatexEditor[] = [
  {
    id: 'prism',
    name: 'Prism (OpenAI)',
    kind: 'cloud-editor',
    homepage: 'https://prism.openai.com',
    license: 'Proprietary hosted service, free to use',
    ai: 'ChatGPT and Codex are built into the editor itself - drafting, proofreading and citations are first-class, not a bolt-on.',
    freeBasis: 'Free LaTeX workspace with unlimited collaborators and no per-seat pricing; costs nothing beyond a ChatGPT account.',
    evidence: 'Official site openai.com/prism: "the free LaTeX editor and scientific workspace integrating ChatGPT and Codex".',
  },
  {
    id: 'texstudio',
    name: 'TeXstudio',
    kind: 'desktop-editor',
    homepage: 'https://www.texstudio.org',
    repo: 'https://github.com/texstudio-org/texstudio',
    license: 'GPL-3.0 (free and open source)',
    ai: 'Built-in AI chat assistant under Wizards -> AI chat, with tool calls that read the open document (get_text, find_regexp, replace_selected_text) and a system prompt tuned for emitting LaTeX only.',
    aiEndpoint: 'http://localhost:8080/v1/chat/completions (llamafile/llama.cpp/Ollama), or an OpenRouter ":free" model, or Mistral free tier',
    freeBasis: 'The editor is free. Point the assistant at a local model and both the editor and its AI cost nothing - the docs call the local setup out explicitly via llamafile.',
    evidence: 'Official docs texstudio-org.github.io/advanced.html (TeXstudio 4.9.8): "supports Mistral AI, ChatGPT, Claude, OpenRouter AI or local language models as AI provider"; local models "via llamafile ... on 127.0.0.1:8080".',
    caveat: 'Cloud providers are billed per token by the provider; only the local-model path is free.',
  },
  {
    id: 'opalatex',
    name: 'OpalaTex',
    kind: 'desktop-editor',
    homepage: 'https://github.com/opalacoderdev/OpalaTex',
    repo: 'https://github.com/opalacoderdev/OpalaTex',
    license: 'MIT (free and open source)',
    ai: 'Integrated AI assistant alongside a source editor, local PDF preview, project tools and Git integration.',
    freeBasis: 'MIT-licensed source, and the assistant can run entirely against local models.',
    evidence: 'GitHub API: license MIT, pushed 2026-09-25 - "OpalaTex is a free, open-source LaTeX editor with an integrated AI assistant".',
    caveat: 'Its own description says cloud model usage is billed "for real usage"; only the local path is free.',
  },
  {
    id: 'lmms-lab-writer',
    name: 'LMMs-Lab Writer',
    kind: 'desktop-editor',
    homepage: 'https://github.com/EvolvingLMMs-Lab/lmms-lab-writer',
    repo: 'https://github.com/EvolvingLMMs-Lab/lmms-lab-writer',
    license: 'MIT (free and open source)',
    ai: 'Agentic AI writer that edits the document directly rather than suggesting snippets.',
    freeBasis: 'MIT source, local-first: files stay on the machine and the agent runs against a self-supplied model.',
    evidence: 'GitHub API: license MIT, 276 stars, "local-first, AI-native LaTeX editor ... AI agents assist with editing directly".',
  },
  {
    id: 'ai-latex-editor',
    name: 'AI LaTeX Editor (nishant9083)',
    kind: 'web-editor',
    homepage: 'https://github.com/nishant9083/ai-latex-editor',
    repo: 'https://github.com/nishant9083/ai-latex-editor',
    license: 'MIT (free and open source)',
    ai: 'Web LaTeX editor with AI assistance on any of four backends: Google Gemini, OpenAI, Anthropic, or a raw Ollama URL.',
    aiEndpoint: 'Ollama base URL (default http://localhost:11434) or the Gemini free tier',
    freeBasis: 'MIT source; the Ollama and Gemini-free-tier paths cost nothing.',
    evidence: 'GitHub API: license MIT; description "Latex Editor Assisted by AI (Use your gemini | openai | anthropic Key or Ollama Url)".',
    caveat: 'Last pushed 2025-11-14 - small and unmaintained, so treat it as a reference implementation.',
  },
];

/**
 * The zero-key typesetters the generated paper is compiled with.
 *
 * `FREE_LATEX_ENGINES` in formatex.ts is the source of truth for what the auto
 * chain actually tries; the registry test asserts these two agree.
 */
export const FREE_COMPILE_ENGINES: FreeCompileEngine[] = [
  {
    engine: 'clsi',
    name: 'Self-hosted latex-service',
    url: 'http://127.0.0.1:3013',
    license: 'Local Docker container (see latex-service/)',
    freeBasis: 'Runs on this machine. No key, no quota, no third party, cannot be rate limited.',
    evidence: 'latex-service/README.md; verified by the /health probe.',
  },
  {
    engine: 'latexonline',
    name: 'LaTeX.Online',
    url: 'https://latexonline.cc',
    license: 'Free public service (open-source latex-online)',
    freeBasis: 'No account, no API key, no published quota.',
    evidence: 'Used in production here; see getLatexOnlineHealth().',
  },
  {
    engine: 'texlive',
    name: 'TeXLive.net (LaTeX-on-HTTP)',
    url: 'https://texlive.net',
    license: 'Free public service; server source open (davidcarlisle/latexcgi)',
    freeBasis: 'No account, no API key, no documented quota. Shares no infrastructure with latexonline.cc, so the two fail independently.',
    evidence: 'Live probe from this repo: POST /cgi-bin/latexcgi -> HTTP 200, application/pdf, 14,290 bytes, %PDF- magic bytes.',
  },
];

/** Near misses. Each one is here because it fails at least one of the two criteria. */
export const EXCLUDED_LATEX_EDITORS: ExcludedLatexEditor[] = [
  {
    id: 'overleaf-writefull',
    name: 'Overleaf + Writefull / TeXGPT',
    homepage: 'https://www.overleaf.com',
    reason: 'AI is free only within daily limits; TeXGPT, Paraphrase and Change Style need a paid plan (Writefull Premium ~$150/yr). Fails "100% free".',
  },
  {
    id: 'cc-latex',
    name: 'cc-latex',
    homepage: 'https://github.com/ANRGUSC/cc-latex',
    reason: 'Its assistant is "powered by Claude", so it needs a paid Anthropic key, and the repository carries no asserted license. Fails both criteria.',
  },
  {
    id: 'vscode-latex-workshop-copilot',
    name: 'VS Code + LaTeX Workshop + Copilot',
    homepage: 'https://github.com/James-Yu/LaTeX-Workshop',
    reason: 'LaTeX Workshop is free, but its AI is GitHub Copilot, a paid subscription. Fails "100% free" unless swapped for an open assistant such as Continue + Ollama.',
  },
  {
    id: 'commercial-ai-editors',
    name: 'TypeTeX / Contour / Bibby AI / Murfy / Octree',
    homepage: 'https://www.typetex.app/best-latex-editors-2026',
    reason: 'Commercial or freemium products. Their "free AI" claims are marketing pages with a paid tier behind them, so they cannot be verified as 100% free. Fails verifiability.',
  },
  {
    id: 'no-ai-editors',
    name: 'TeXmaker / LyX / Kile / TeXlyre / Emacs+AUCTeX',
    homepage: 'https://www.texstudio.org',
    reason: 'Genuinely free and open source, but they ship no AI assistant at all. Fails "AI-integrated" unless paired with a separate assistant.',
  },
];

/** Live view of which free halves of the pipeline are usable right now. */
export interface FreeAiLatexStatus {
  editors: { total: number; ids: string[] };
  engines: Array<{ engine: string; name: string; connected: boolean; error?: string }>;
  enginesOnline: number;
  localAi: { provider: 'ollama'; reachable: boolean; model: string; error?: string };
  /** Free-tier cloud AI providers that are configured (no quota spent to find out). */
  freeCloudAiConfigured: Array<{ id: string; label: string; freeTier: string }>;
  /** True when a paper can be generated and compiled without paying anything. */
  fullyFreePathAvailable: boolean;
  notes: string[];
}

export interface FreeAiLatexStatusDeps {
  clsi: () => Promise<{ connected: boolean; error?: string }>;
  latexonline: () => Promise<{ connected: boolean; error?: string }>;
  texlive: () => Promise<{ connected: boolean; error?: string }>;
  providers: () => Promise<{
    providers: Array<{
      id: string;
      label: string;
      configured: boolean;
      reachable: boolean;
      model: string;
      freeTier: string;
      error?: string;
    }>;
  }>;
}

const DEFAULT_DEPS: FreeAiLatexStatusDeps = {
  clsi: getLocalClsiHealth,
  latexonline: getLatexOnlineHealth,
  texlive: getTexliveNetHealth,
  providers: getProviderStatus,
};

const ENGINE_LABELS: Record<string, string> = {
  clsi: 'Self-Hosted LaTeX (CLSI)',
  latexonline: 'LaTeX.Online (Free)',
  texlive: 'TeXLive.net (Free)',
};

/**
 * Probe the free halves of the pipeline in parallel and report what is usable.
 *
 * Probes are injectable so the suite can exercise every branch without touching
 * the network - a status endpoint that only works when the internet is up is
 * not testable, and the failures are exactly the interesting cases.
 */
export async function getFreeAiLatexStatus(
  deps: Partial<FreeAiLatexStatusDeps> = {}
): Promise<FreeAiLatexStatus> {
  const { clsi, latexonline, texlive, providers } = { ...DEFAULT_DEPS, ...deps };

  const [clsiRes, onlineRes, texliveRes, providerRes] = await Promise.all([
    clsi().catch((err: any) => ({ connected: false, error: err?.message || 'probe failed' })),
    latexonline().catch((err: any) => ({ connected: false, error: err?.message || 'probe failed' })),
    texlive().catch((err: any) => ({ connected: false, error: err?.message || 'probe failed' })),
    providers().catch(() => ({ providers: [] })),
  ]);

  const probeByEngine: Record<string, { connected: boolean; error?: string }> = {
    clsi: clsiRes,
    latexonline: onlineRes,
    texlive: texliveRes,
  };

  const engines = FREE_LATEX_ENGINES.map(engine => ({
    engine,
    name: ENGINE_LABELS[engine] || engine,
    connected: Boolean(probeByEngine[engine]?.connected),
    error: probeByEngine[engine]?.connected ? undefined : probeByEngine[engine]?.error,
  }));
  const enginesOnline = engines.filter(e => e.connected).length;

  // Ollama is the floor: local, no key, no quota. It is the one AI path that
  // cannot be rate limited, so its reachability decides the free verdict when no
  // free-tier cloud key is configured.
  const ollama = providerRes.providers.find(p => p.id === 'ollama');
  const localAi = {
    provider: 'ollama' as const,
    reachable: Boolean(ollama?.configured && ollama?.reachable),
    model: ollama?.model || 'unknown',
    error: ollama?.error,
  };

  const freeCloudAiConfigured = providerRes.providers
    .filter(p => p.id !== 'ollama' && p.configured)
    .map(p => ({ id: p.id, label: p.label, freeTier: p.freeTier }));

  const aiAvailable = localAi.reachable || freeCloudAiConfigured.length > 0;

  const notes: string[] = [
    'Prism is the only editor here whose AI assistant is free outright; the other free AI editors are free because their assistant can be pointed at a local model.',
    'No free cloud AI LaTeX editor passed both criteria: Overleaf, TypeTeX, Contour, Bibby, Murfy and Octree all put AI behind a paid tier.',
  ];
  if (!aiAvailable) {
    notes.push('No AI backend is reachable: start Ollama (or set a free-tier provider key) before generating papers.');
  }
  if (enginesOnline === 0) {
    notes.push('No free LaTeX compiler is reachable: start the self-hosted latex-service container or restore internet access.');
  }
  if (enginesOnline > 0 && enginesOnline < engines.length) {
    notes.push(
      `Only ${enginesOnline} of ${engines.length} free compilers answered, so a paper may fall through to the metered FormaTeX tier.`
    );
  }

  return {
    editors: { total: FREE_AI_LATEX_EDITORS.length, ids: FREE_AI_LATEX_EDITORS.map(e => e.id) },
    engines,
    enginesOnline,
    localAi,
    freeCloudAiConfigured,
    fullyFreePathAvailable: aiAvailable && enginesOnline > 0,
    notes,
  };
}

/** The engine ids the registry claims are free, in the order formatex.ts tries them. */
export function freeEngineIds(): string[] {
  return FREE_COMPILE_ENGINES.map(e => e.engine);
}

/** One line of proof: a real compile, or a real model reply. */
export interface SelfTestItem {
  kind: 'engine' | 'ai';
  id: string;
  label: string;
  ok: boolean;
  ms: number;
  /** Evidence of real output - PDF bytes, or the model's own words. */
  detail: string;
  error?: string;
}

export interface FreeAiLatexSelfTest {
  ok: boolean;
  ranAt: string;
  items: SelfTestItem[];
  enginesWorking: number;
  enginesTested: number;
  aiWorking: number;
  aiTested: number;
  /**
   * The only claim that matters end to end: a model wrote LaTeX and a free
   * compiler turned it into a PDF, with no paid key used at any step.
   */
  endToEnd: {
    ok: boolean;
    provider?: string;
    engine?: string;
    pdfBytes?: number;
    latex?: string;
    ms: number;
    error?: string;
  };
}

export interface SelfTestDeps {
  compile: Record<string, (latex: string) => Promise<{ success: boolean; pdfBuffer?: Buffer; error?: string; log?: string }>>;
  providers: () => Promise<{ providers: Array<{ id: string; label: string; configured: boolean; model: string }> }>;
  chat: (id: ProviderId, system: string, user: string, timeoutMs: number) => Promise<{ text: string; provider: string; model: string }>;
  now: () => number;
}

const SELF_TEST_DOC = '\\documentclass{article}\\begin{document}ZeroLeak self test\\end{document}';

/** A tiny LaTeX ask, so a free tier is charged a few tokens rather than a paper. */
const SELF_TEST_SYSTEM = 'You are a LaTeX generator. Output only LaTeX code. No prose, no markdown fences.';
const SELF_TEST_USER = 'Output a complete minimal LaTeX document that prints ZeroLeak AI plus LaTeX OK in bold. Nothing else.';
const SELF_TEST_USER_MATH = 'Reply with only the LaTeX inline math for the quadratic formula. No prose, no fences.';

const DEFAULT_SELF_TEST_DEPS: SelfTestDeps = {
  compile: {
    clsi: latex => compileWithLocalClsi({ latex, timeoutMs: 60000 }),
    latexonline: latex => compileWithLatexOnline({ latex, timeoutMs: 35000 }),
    texlive: latex => compileWithTexliveNet({ latex, timeoutMs: 45000 }),
  },
  providers: getProviderStatus,
  chat: (id, system, user, timeoutMs) =>
    chatWithFailover(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      // Pin the provider: this test is meant to say *which* engine works, so a
      // silent failover to another provider would make it lie.
      { providerOrder: [id], timeoutMs, max_tokens: 256 }
    ),
  now: () => Date.now(),
};

/**
 * Prove the free halves work, one real request at a time.
 *
 * Nothing here is inferred from configuration: each engine is handed a document
 * and must return PDF magic bytes, and each configured AI provider must answer a
 * one-line prompt on its own. A provider that only exists as an environment
 * variable is reported as broken rather than assumed working, because "the key
 * is set" and "the key works" are different statements.
 */
export async function runFreeAiLatexSelfTest(
  deps: Partial<SelfTestDeps> = {}
): Promise<FreeAiLatexSelfTest> {
  const { compile, providers, chat, now } = { ...DEFAULT_SELF_TEST_DEPS, ...deps };
  const items: SelfTestItem[] = [];

  // 1. Every free compiler, compiled for real.
  for (const engine of FREE_LATEX_ENGINES) {
    const label = ENGINE_LABELS[engine] || engine;
    const runner = compile[engine];
    if (!runner) {
      items.push({ kind: 'engine', id: engine, label, ok: false, ms: 0, detail: '', error: 'no runner registered' });
      continue;
    }
    const started = now();
    try {
      const res = await runner(SELF_TEST_DOC);
      const bytes = res.pdfBuffer?.length || 0;
      const isPdf = res.pdfBuffer?.subarray(0, 5).toString('latin1') === '%PDF-';
      const ok = Boolean(res.success && isPdf && bytes > 0);
      items.push({
        kind: 'engine',
        id: engine,
        label,
        ok,
        ms: now() - started,
        detail: ok ? `${bytes} byte PDF` : '',
        error: ok ? undefined : res.error || 'did not return a PDF',
      });
    } catch (err: any) {
      items.push({ kind: 'engine', id: engine, label, ok: false, ms: now() - started, detail: '', error: err?.message || 'threw' });
    }
  }

  // 2. Every configured AI provider, asked something only a model can answer.
  const providerList = await providers().catch(() => ({ providers: [] }));
  const configured = providerList.providers.filter(p => p.configured);
  const aiItems: SelfTestItem[] = [];

  for (const provider of configured) {
    const id = provider.id as ProviderId;
    // Local inference runs on a CPU here, so it gets the long leash the app
    // already gives it; a cloud tier that has not answered in 45s is broken.
    const budget = id === 'ollama' ? 180000 : 45000;
    const started = now();
    try {
      const res = await chat(id, SELF_TEST_SYSTEM, SELF_TEST_USER_MATH, budget);
      const text = (res?.text || '').trim();
      // A model that echoes the prompt or returns nothing has not answered.
      const answered = text.length > 0 && /\\|frac|x\^2|\^2|=/.test(text);
      aiItems.push({
        kind: 'ai',
        id,
        label: provider.label,
        ok: answered,
        ms: now() - started,
        detail: text.slice(0, 140),
        error: answered ? undefined : `model returned ${text.length} usable characters`,
      });
    } catch (err: any) {
      aiItems.push({
        kind: 'ai',
        id,
        label: provider.label,
        ok: false,
        ms: now() - started,
        detail: '',
        error: (err?.message || 'threw').slice(0, 300),
      });
    }
  }
  items.push(...aiItems);

  // 3. The claim the user actually cares about: AI writes LaTeX, a free compiler
  //    renders it. Uses the first provider and engine that passed above.
  const workingEngine = FREE_LATEX_ENGINES.find(e => items.some(i => i.kind === 'engine' && i.id === e && i.ok));
  const workingProvider = aiItems.find(i => i.ok);
  let endToEnd: FreeAiLatexSelfTest['endToEnd'] = {
    ok: false,
    ms: 0,
    error: 'Skipped: no working AI provider and free compiler pair to test with.',
  };

  if (workingEngine && workingProvider) {
    const started = now();
    try {
      const generated = await chat(
        workingProvider.id as ProviderId,
        SELF_TEST_SYSTEM,
        SELF_TEST_USER,
        workingProvider.id === 'ollama' ? 300000 : 60000
      );
      const latex = sanitizeLatexSource(generated.text || '');
      const res = await compile[workingEngine](latex);
      const bytes = res.pdfBuffer?.length || 0;
      const ok = Boolean(res.success && res.pdfBuffer?.subarray(0, 5).toString('latin1') === '%PDF-' && bytes > 0);
      endToEnd = {
        ok,
        provider: workingProvider.id,
        engine: workingEngine,
        pdfBytes: bytes,
        latex: latex.slice(0, 600),
        ms: now() - started,
        error: ok ? undefined : res.error || 'the generated LaTeX did not compile',
      };
    } catch (err: any) {
      endToEnd = {
        ok: false,
        provider: workingProvider.id,
        engine: workingEngine,
        ms: now() - started,
        error: (err?.message || 'threw').slice(0, 300),
      };
    }
  }

  const enginesWorking = items.filter(i => i.kind === 'engine' && i.ok).length;
  const aiWorking = items.filter(i => i.kind === 'ai' && i.ok).length;

  return {
    // The bar is the end-to-end claim, not "some piece responded".
    ok: endToEnd.ok,
    ranAt: new Date().toISOString(),
    items,
    enginesWorking,
    enginesTested: FREE_LATEX_ENGINES.length,
    aiWorking,
    aiTested: configured.length,
    endToEnd,
  };
}

// ---------------------------------------------------------------------------
// Browser-usable, key-free AI LaTeX surfaces
// ---------------------------------------------------------------------------

/*
 * What can actually be put IN the in-app browser, as opposed to researched.
 *
 * The criteria are (a) an AI feature, (b) free with NO API key at all, and
 * (c) loadable in the paper-generation pane. (c) is the one that quietly kills
 * most candidates, and it is easy to get wrong twice over:
 *
 *   1. A source repository is not a tool. TeXstudio, OpalaTex, LMMs-Lab Writer
 *      and ai-latex-editor are desktop programs; a github.com URL in the pane
 *      shows source code to someone who wanted to write a paper. They stay in
 *      `FREE_AI_LATEX_EDITORS` as research and are deliberately NOT bookmarked.
 *
 *   2. A hosted tool can still refuse to be framed, and then the pane is simply
 *      blank. Measured from this repo by reading X-Frame-Options and CSP
 *      frame-ancestors on a plain GET:
 *
 *        prism.openai.com             no policy            -> renders in the pane
 *        *.hf.space (a Space runtime) no policy            -> renders in the pane
 *        huggingface.co/spaces/...    X-Frame-Options DENY -> blank pane
 *        overleaf.com                 SAMEORIGIN           -> blank pane
 *        inkwhale.io.vn               SAMEORIGIN           -> blank pane
 *        trybibby.com                 frame-ancestors 'self' -> blank pane
 *
 *      Which is why a Hugging Face Space is bookmarked at its own `*.hf.space`
 *      runtime host and never at its `huggingface.co/spaces/...` page: the page
 *      is the one address that cannot be embedded.
 *
 * What is left is genuinely keyless AI that produces LaTeX. Two shapes survive:
 * Prism, where the model is bought by a free ChatGPT account, and the Space
 * runtimes, where the model runs on Hugging Face's hardware and asks for nothing
 * at all - no account, no key, no payment.
 */

export type WebToolKind = 'cloud-editor' | 'model-demo';

export interface FreeAiLatexWebTool {
  id: string;
  name: string;
  kind: WebToolKind;
  /** The address to load in the pane: the live app, never a source repository. */
  url: string;
  /** The model that answers there, named so the claim is checkable. */
  model: string;
  /** What the AI does for a LaTeX author. */
  ai: string;
  /** Why no API key and no payment are involved. */
  keylessBasis: string;
  evidence: string;
  /** Framing verdict measured against this URL, not assumed from the kind. */
  embed: 'verified' | 'blocked';
  embedEvidence: string;
  caveat?: string;
}

/**
 * Why a Space's own runtime host is the only embeddable address for it.
 * Encoded as a constant so the test suite can assert the registry never
 * regresses to the page URL.
 */
export const HF_SPACE_PAGE_X_FRAME_POLICY = 'DENY';

/** `lukbl/LaTeX-OCR` -> `https://lukbl-latex-ocr.hf.space/`. */
export function hfSpaceRuntimeHost(spaceId: string): string {
  return `https://${spaceId.replace('/', '-').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.hf.space/`;
}

/**
 * Free AI that writes or reads LaTeX, with no API key anywhere in the flow.
 *
 * Every URL below answered `200` on a plain GET from this repo and sent neither
 * X-Frame-Options nor a restrictive frame-ancestors, so each one renders inside
 * the paper-generation pane rather than showing an empty frame.
 */
export const FREE_AI_LATEX_WEB_TOOLS: FreeAiLatexWebTool[] = [
  {
    id: 'prism',
    name: 'OpenAI Prism',
    kind: 'cloud-editor',
    url: 'https://prism.openai.com/',
    model: 'OpenAI GPT-5.2 (ChatGPT + Codex)',
    ai: 'AI-native LaTeX workspace: drafts, proofreads, reasons over the document and edits the .tex source directly.',
    keylessBasis: 'No API key is ever requested. The model is covered by a free ChatGPT account, which is also the sign-in.',
    evidence: 'openai.com/index/introducing-prism: "a free LaTeX-native workspace with GPT-5.2 built in".',
    embed: 'verified',
    embedEvidence: 'GET https://prism.openai.com/ -> 200, no X-Frame-Options, no frame-ancestors.',
  },
  {
    id: 'latex-ocr',
    name: 'LaTeX-OCR (image to LaTeX)',
    kind: 'model-demo',
    url: hfSpaceRuntimeHost('lukbl/LaTeX-OCR'),
    model: 'pix2tex - ViT image-to-LaTeX (lukbl/LaTeX-OCR)',
    ai: 'Reads a photo or screenshot of a formula and returns the LaTeX, so a question printed on paper can be turned back into source.',
    keylessBasis: 'Runs on Hugging Face hardware. No account, no API key, no token, no quota to buy.',
    evidence: 'Hugging Face Space lukbl/LaTeX-OCR (54 stars), the reference deployment of the pix2tex model.',
    embed: 'verified',
    embedEvidence: `GET ${hfSpaceRuntimeHost('lukbl/LaTeX-OCR')} -> 200, no X-Frame-Options, no frame-ancestors. Its huggingface.co/spaces/... page sends X-Frame-Options: ${HF_SPACE_PAGE_X_FRAME_POLICY} and would render blank.`,
    caveat: 'Free Spaces sleep when idle; the first request after a nap can take a few seconds to wake it.',
  },
  {
    id: 'latex-ocr-mirror',
    name: 'LaTeX-OCR (mirror)',
    kind: 'model-demo',
    url: hfSpaceRuntimeHost('Ranhui/LaTeX-OCR'),
    model: 'pix2tex - ViT image-to-LaTeX (Ranhui mirror)',
    ai: 'A second deployment of the same image-to-LaTeX model, kept so one Space sleeping does not remove the capability.',
    keylessBasis: 'Runs on Hugging Face hardware. No account, no API key, no token.',
    evidence: 'Hugging Face Space Ranhui/LaTeX-OCR, reachable 200 on probe.',
    embed: 'verified',
    embedEvidence: `GET ${hfSpaceRuntimeHost('Ranhui/LaTeX-OCR')} -> 200, no X-Frame-Options, no frame-ancestors.`,
    caveat: 'Same model as the main LaTeX-OCR Space; use whichever is awake.',
  },
  {
    id: 'glm-ocr',
    name: 'GLM-OCR (formulas, tables)',
    kind: 'model-demo',
    url: hfSpaceRuntimeHost('prithivMLmods/GLM-OCR-Demo'),
    model: 'GLM-OCR (prithivMLmods)',
    ai: 'Reads an image and can be asked for plain text, mathematical formulas or table data - the table path is what turns a printed table into LaTeX tabular.',
    keylessBasis: 'Runs on Hugging Face hardware. No account, no API key, no token.',
    evidence: 'Hugging Face Space prithivMLmods/GLM-OCR-Demo, reachable 200 on probe.',
    embed: 'verified',
    embedEvidence: `GET ${hfSpaceRuntimeHost('prithivMLmods/GLM-OCR-Demo')} -> 200, no X-Frame-Options, no frame-ancestors.`,
    caveat: 'Free Spaces sleep when idle; expect a short wake-up on the first request.',
  },
  {
    id: 'nemotron-ocr',
    name: 'Nemotron OCR v2 (NVIDIA)',
    kind: 'model-demo',
    url: hfSpaceRuntimeHost('nvidia/nemotron-ocr-v2'),
    model: 'NVIDIA Nemotron OCR v2',
    ai: 'Detects and extracts every text run in a page image - useful for lifting a whole question paper, not just one formula.',
    keylessBasis: 'Runs on Hugging Face hardware. No account, no API key, no token, and no NVIDIA account needed.',
    evidence: 'Hugging Face Space nvidia/nemotron-ocr-v2, reachable 200 on probe.',
    embed: 'verified',
    embedEvidence: `GET ${hfSpaceRuntimeHost('nvidia/nemotron-ocr-v2')} -> 200, no X-Frame-Options, no frame-ancestors.`,
    caveat: 'OCR, not LaTeX: it returns text, which still needs a model to typeset.',
  },
];

/**
 * Key-free AI that answered 200 and could be framed, yet still cannot be
 * bookmarked — because it is not a page a person can use.
 *
 * These two were caught by checking the *body*, not the status: both return
 * `200 application/json`, 41 bytes, `{"message":"M2W SVG Factory is running!"}`.
 * They are uvicorn API backends, so the pane would show a line of JSON where an
 * editor belongs. Recorded here rather than deleted so the next search for TikZ
 * AI does not have to rediscover it — and so `probeAiLatexWebTool`'s content-type
 * check has a named reason to exist.
 */
export const API_ONLY_KEYLESS_TOOLS: Array<{ id: string; name: string; url: string; reason: string }> = [
  {
    id: 'math-to-tikz',
    name: 'M2W TikZ compiler (Hong-2)',
    url: hfSpaceRuntimeHost('Hong-2/m2w-tikz-compiler'),
    reason: 'Answers 200 with application/json ("M2W SVG Factory is running!") - an API, not a usable page. Would render as JSON in the pane.',
  },
  {
    id: 'tikz-render',
    name: 'TikZ render service (Carot2026)',
    url: hfSpaceRuntimeHost('Carot2026/Tikz'),
    reason: 'Same API-only Space shape: 200 application/json, 41 bytes. Nothing to interact with in a browser.',
  },
];

/** Ids of the browser-usable, key-free AI tools, in bookmark order. */
export function freeAiWebToolIds(): string[] {
  return FREE_AI_LATEX_WEB_TOOLS.map(t => t.id);
}

/** One live answer about whether a bookmark will actually render. */
export interface WebToolProbe {
  id: string;
  url: string;
  /** The host answered with a 2xx/3xx. */
  reachable: boolean;
  status?: number;
  /** The response headers permit this page inside an embedded pane. */
  embeddable: boolean;
  /** Why it can or cannot be embedded, in one line. */
  embedReason: string;
  /**
   * The response is HTML, i.e. something a pane can render.
   *
   * A 200 is not enough: Spaces that are API backends answer `200
   * application/json`, which frames perfectly and still shows JSON to the user.
   */
  interactive: boolean;
  /** A waking Hugging Face Space answers 503 - that is a wait, not a failure. */
  sleeping: boolean;
  ms: number;
  error?: string;
}

/**
 * Decide embeddability from the two headers that control framing.
 *
 * The rule is deliberately strict: absent policy means yes, an explicit wildcard
 * means yes, and *anything else* means no. A pane here is a `localhost` iframe,
 * so a `frame-ancestors https:` policy - which looks permissive - still refuses
 * us in the dev server, and "looks allowed" is exactly the wrong way to guess.
 */
export function framePolicyAllowsEmbedding(headers: {
  get(name: string): string | null;
}): { embeddable: boolean; reason: string } {
  const csp = headers.get('content-security-policy');
  const ancestors = csp ? /frame-ancestors([^;]*)/i.exec(csp) : null;
  if (ancestors) {
    const value = ancestors[1].trim().toLowerCase();
    if (value === '*' || value.split(/\s+/).includes('*')) {
      return { embeddable: true, reason: 'CSP frame-ancestors allows any origin' };
    }
    return { embeddable: false, reason: `CSP frame-ancestors ${value || '(empty)'} refuses this pane` };
  }

  const xfo = headers.get('x-frame-options');
  if (!xfo) return { embeddable: true, reason: 'no X-Frame-Options and no frame-ancestors' };
  const value = xfo.trim().toLowerCase();
  if (value.includes('deny') || value.includes('sameorigin')) {
    return { embeddable: false, reason: `X-Frame-Options ${value} refuses this pane` };
  }
  return { embeddable: false, reason: `X-Frame-Options ${value} is not an explicit allow` };
}

export interface WebToolProbeDeps {
  fetch: (
    url: string,
    init: { redirect: 'follow'; headers: Record<string, string>; signal?: AbortSignal }
  ) => Promise<{ status: number; headers: { get(name: string): string | null } }>;
  now: () => number;
  timeoutMs?: number;
}

const DEFAULT_WEB_TOOL_PROBE_DEPS: WebToolProbeDeps = {
  fetch: (url, init) =>
    fetch(url, init) as unknown as Promise<{
      status: number;
      headers: { get(name: string): string | null };
    }>,
  now: () => Date.now(),
  timeoutMs: 8000,
};

/**
 * Ask one tool's host whether it is up and whether it may be framed.
 *
 * A dead or sleeping Space is reported rather than hidden, because a bookmark
 * that reliably shows a blank pane is worse than a bookmark that says it is
 * asleep - the user learns the difference in the pane itself either way.
 */
export async function probeAiLatexWebTool(
  tool: Pick<FreeAiLatexWebTool, 'id' | 'url'>,
  deps: Partial<WebToolProbeDeps> = {}
): Promise<WebToolProbe> {
  const { fetch: fetchImpl, now, timeoutMs } = { ...DEFAULT_WEB_TOOL_PROBE_DEPS, ...deps };
  const started = now();
  try {
    const res = await fetchImpl(tool.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (ZeroLeak embeddability probe)' },
      signal: AbortSignal.timeout(timeoutMs ?? 8000),
    });
    const { embeddable, reason } = framePolicyAllowsEmbedding(res.headers);
    // Only HTML renders in the pane. A JSON backend frames fine and is useless.
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const interactive = contentType.startsWith('text/html');
    return {
      id: tool.id,
      url: tool.url,
      reachable: res.status >= 200 && res.status < 400,
      status: res.status,
      embeddable,
      embedReason: reason,
      interactive,
      sleeping: res.status === 503,
      ms: now() - started,
      error: interactive
        ? undefined
        : `host answered ${contentType || 'without a content type'} instead of an HTML page`,
    };
  } catch (err: any) {
    return {
      id: tool.id,
      url: tool.url,
      reachable: false,
      embeddable: false,
      embedReason: 'the host did not answer, so framing could not be measured',
      interactive: false,
      sleeping: false,
      ms: now() - started,
      error: (err?.message || 'probe failed').slice(0, 200),
    };
  }
}

export interface WebToolProbeReport {
  probedAt: string;
  tools: WebToolProbe[];
  /**
   * Bookmarked tools that are awake, framable *and* serving a real page right
   * now. All three are required: each one alone has already been wrong once.
   */
  usableNow: number;
}

/** Probe every bookmark in parallel; one slow host cannot hold up the rest. */
export async function probeAiLatexWebTools(
  deps: Partial<WebToolProbeDeps> = {}
): Promise<WebToolProbeReport> {
  const tools = await Promise.all(FREE_AI_LATEX_WEB_TOOLS.map(tool => probeAiLatexWebTool(tool, deps)));
  return {
    probedAt: new Date().toISOString(),
    tools,
    usableNow: tools.filter(t => t.reachable && t.embeddable && t.interactive).length,
  };
}
