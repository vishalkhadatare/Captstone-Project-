import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Sparkles, ExternalLink, Play, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

/**
 * The free AI + LaTeX toolchain, and proof that it works.
 *
 * Two questions are answered here, and they are deliberately separate:
 *   1. which of the researched free AI LaTeX editors and free compilers exist,
 *      and which are usable on this machine right now, and
 *   2. whether the AI features actually work - which is not something a
 *      configuration screen can claim, so the self-test performs real requests.
 *
 * This renders wherever paper generation happens (it is used by both the paper
 * generation module and the university format generator) because being reachable
 * only from one sub-tab meant it was effectively invisible.
 */

type ToolStatus = {
  editors: { total: number; ids: string[] };
  engines: Array<{ engine: string; name: string; connected: boolean; error?: string }>;
  enginesOnline: number;
  localAi: { provider: string; reachable: boolean; model: string; error?: string };
  freeCloudAiConfigured: Array<{ id: string; label: string; freeTier: string }>;
  fullyFreePathAvailable: boolean;
  notes: string[];
};

type CatalogueEditor = {
  id: string;
  name: string;
  kind: string;
  homepage: string;
  repo?: string;
  license: string;
  ai: string;
  aiEndpoint?: string;
  freeBasis: string;
  evidence: string;
  caveat?: string;
};

type Catalogue = {
  editors: CatalogueEditor[];
  engines: Array<{ engine: string; name: string; url: string; license: string; freeBasis: string; evidence: string }>;
  excluded: Array<{ id: string; name: string; homepage: string; reason: string }>;
};

type SelfTestItem = {
  kind: 'engine' | 'ai';
  id: string;
  label: string;
  ok: boolean;
  ms: number;
  detail: string;
  error?: string;
};

type SelfTest = {
  ok: boolean;
  ranAt: string;
  items: SelfTestItem[];
  enginesWorking: number;
  enginesTested: number;
  aiWorking: number;
  aiTested: number;
  endToEnd: {
    ok: boolean;
    provider?: string;
    engine?: string;
    pdfBytes?: number;
    latex?: string;
    ms: number;
    error?: string;
  };
};

export function FreeLatexToolchainPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [status, setStatus] = useState<ToolStatus | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<SelfTest | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.getLatexToolStatus(), api.getLatexToolCatalogue()]);
      setStatus(s);
      setCatalogue(c);
    } catch {
      // The panel simply stays hidden; paper generation does not depend on it.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runSelfTest = async () => {
    setTesting(true);
    setTestError(null);
    try {
      setTest(await api.runLatexToolSelfTest());
    } catch (err: any) {
      setTestError(err?.message || 'The self-test could not run.');
    } finally {
      setTesting(false);
    }
  };

  if (!status) return null;

  const testByKey = new Map<string, SelfTestItem>(
    (test?.items || []).map(i => [`${i.kind}:${i.id}`, i] as [string, SelfTestItem])
  );
  const aiRows = (test?.items || []).filter(i => i.kind === 'ai');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left cursor-pointer hover:bg-slate-50/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700 border border-emerald-200/80">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900 tracking-tight">Free AI + LaTeX Toolchain</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                  status.fullyFreePathAvailable
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {status.fullyFreePathAvailable ? 'Zero-cost path ready' : 'Paid tier may be used'}
              </span>
              {test && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                    test.ok
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {test.ok ? 'AI + LaTeX verified working' : 'AI + LaTeX self-test failed'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {status.enginesOnline}/{status.engines.length} free compilers online
              {' • '}
              {status.localAi.reachable ? `local AI: ${status.localAi.model}` : 'local AI offline'}
              {' • '}
              {status.freeCloudAiConfigured.length} free cloud AI key
              {status.freeCloudAiConfigured.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span className="text-[11px] font-bold text-emerald-700">
          {open ? 'Hide' : `Show ${status.editors.total} free AI editors`}
        </span>
      </button>

      <div className="px-4 pb-4 space-y-3">
        {/* Compilers: the TeXLive.net entry is the one this research added. */}
        <div className="flex flex-wrap gap-2">
          {status.engines.map(engine => (
            <span
              key={engine.engine}
              title={engine.error || 'Answering'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                engine.connected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${engine.connected ? 'bg-emerald-600' : 'bg-slate-400'}`} />
              {engine.name}
              {engine.engine === 'texlive' && (
                <span className="ml-1 px-1.5 py-px rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] uppercase">
                  added
                </span>
              )}
            </span>
          ))}
        </div>

        {/* The self-test is the answer to "does the AI actually work?" */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-900">Test the AI features</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Compiles a document on every free engine, asks every configured AI provider a real question, then has a
                model write LaTeX and a free engine render it.
              </p>
            </div>
            <button
              type="button"
              onClick={runSelfTest}
              disabled={testing}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-[11px] shadow-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{testing ? 'Running real requests…' : 'Run self-test'}</span>
            </button>
          </div>

          {testError && (
            <p className="text-[11px] text-rose-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {testError}
            </p>
          )}

          {test && (
            <div className="space-y-2">
              <div
                className={`rounded-lg border p-2.5 ${
                  test.endToEnd.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                }`}
              >
                <p className="text-[11px] font-bold flex items-center gap-1.5">
                  {test.endToEnd.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-700" />
                  )}
                  <span className={test.endToEnd.ok ? 'text-emerald-900' : 'text-rose-900'}>
                    End to end: {test.endToEnd.ok ? 'AI wrote LaTeX and a free compiler produced the PDF' : 'not verified'}
                  </span>
                </p>
                <p className="text-[10px] text-slate-600 mt-1">
                  {test.endToEnd.ok
                    ? `${test.endToEnd.provider} → ${test.endToEnd.engine} → ${test.endToEnd.pdfBytes} byte PDF in ${test.endToEnd.ms} ms`
                    : test.endToEnd.error}
                </p>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {test.items.map(item => (
                  <div
                    key={`${item.kind}:${item.id}`}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    title={item.error || item.detail}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-800 truncate">
                        {item.kind === 'ai' ? '🤖 ' : '⚙️ '}
                        {item.label}
                      </span>
                      <span className={`text-[10px] font-bold ${item.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {item.ok ? `${item.ms} ms` : 'failed'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{item.error || item.detail || '—'}</p>
                  </div>
                ))}
              </div>

              {aiRows.length === 0 && (
                <p className="text-[10px] text-amber-700">
                  No AI provider is configured, so no model could be asked anything. Start Ollama or add a free-tier key.
                </p>
              )}
            </div>
          )}
        </div>

        {open && catalogue && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-700">
              Free AI-integrated LaTeX editors ({catalogue.editors.length}) — verified against licenses and official docs
            </p>
            {catalogue.editors.map(editor => {
              const item = testByKey.get(`ai:${editor.id}`);
              return (
                <div key={editor.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {editor.name}
                      {item && (
                        <span className={`ml-2 text-[10px] font-bold ${item.ok ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {item.ok ? 'tested ✓' : 'not tested here'}
                        </span>
                      )}
                    </span>
                    <a
                      href={editor.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">{editor.ai}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    <span className="font-semibold">{editor.license}</span> — {editor.freeBasis}
                  </p>
                  {editor.aiEndpoint && (
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">endpoint: {editor.aiEndpoint}</p>
                  )}
                  {editor.caveat && <p className="text-[10px] text-amber-700 mt-1">Caveat: {editor.caveat}</p>}
                </div>
              );
            })}

            <p className="text-[11px] font-bold text-slate-700 pt-1">Free compilers behind the generated paper</p>
            {catalogue.engines.map(engine => (
              <div key={engine.engine} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-bold text-slate-900">
                  {engine.name}
                  {engine.engine === 'texlive' && (
                    <span className="ml-2 px-1.5 py-px rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] uppercase">
                      added by this research
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  <span className="font-semibold">{engine.license}</span> — {engine.freeBasis}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">{engine.evidence}</p>
              </div>
            ))}

            <details className="pt-1">
              <summary className="text-[11px] font-bold text-slate-700 cursor-pointer">
                Rejected candidates and why ({catalogue.excluded.length})
              </summary>
              <div className="space-y-1.5 mt-2">
                {catalogue.excluded.map(item => (
                  <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50/50 p-2.5">
                    <p className="text-[11px] font-bold text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-rose-800 mt-0.5">{item.reason}</p>
                  </div>
                ))}
              </div>
            </details>

            {status.notes.map((note, i) => (
              <p key={i} className="text-[10px] text-slate-500">
                • {note}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
