import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { uploadDocumentToCloudinary } from './cloudinary.ts';

const LATEX_ONLINE_BASE_URL = process.env.LATEX_ONLINE_BASE_URL || 'https://latexonline.cc';
/**
 * TeXLive.net (LaTeX-on-HTTP) - the free public compiler behind learnlatex.org.
 *
 * POST-only CGI: multipart/form-data to `/cgi-bin/latexcgi`. Two contract
 * details are enforced by the server and both fail silently rather than loudly:
 *   - the root document must be submitted under the name `document.tex`, and
 *   - *any* unexpected form field makes it reject the entire submission,
 * so the form is built in exactly one place (`buildTexliveNetForm`) instead of
 * being assembled inline at the call site.
 *
 * No API key, no account, no documented quota. Verified against the live
 * service: a POST returns HTTP 200, `application/pdf`, `%PDF-` magic bytes.
 */
const TEXLIVE_NET_BASE_URL = (process.env.TEXLIVE_NET_BASE_URL || 'https://texlive.net').replace(/\/+$/, '');
/** The only filename texlive.net treats as the root document. */
const TEXLIVE_NET_ROOT_FILE = 'document.tex';
const LATEX_SERVICE_URL = process.env.LATEX_SERVICE_URL || 'http://127.0.0.1:3013';
const TEXAPI_BASE_URL = process.env.TEXAPI_BASE_URL || 'https://texapi.ovh';
const TEXAPI_API_KEY = process.env.TEXAPI_API_KEY || '';
const FORMATEX_BASE_URL = process.env.FORMATEX_BASE_URL || 'https://api.formatex.io/api/v1';
const FORMATEX_API_KEY = process.env.FORMATEX_API_KEY || 'fex_b908adc11e4806a1c4877fb32105c1bb19e533378b3f0b4fd866148f701b061c';

/**
 * A side file compiled alongside the root document - typically a figure the
 * .tex references with \includegraphics.
 *
 * Images are binary, so they travel base64-encoded; the compiler service
 * decodes them before writing, because writing PNG bytes as utf8 corrupts them.
 */
export interface LatexCompileResource {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

export interface FormatexCompileOptions {
  latex: string;
  engine?: 'pdflatex' | 'xelatex' | 'lualatex' | 'latexmk';
  smart?: boolean;
  timeoutMs?: number;
  preferEngine?: 'clsi' | 'texapi' | 'latexonline' | 'texlive' | 'formatex' | 'auto';
  /** Side files (figures) for compilers that can accept a multi-file project. */
  resources?: LatexCompileResource[];
}

/** One engine's attempt at the document, kept so a failure can name the engine. */
export interface LatexEngineAttempt {
  engine: string;
  command: string;
  ok: boolean;
  ms: number;
  error?: string;
}

/**
 * Everything needed to debug a typesetting failure without guessing: which
 * engines ran, what the source was, and the first real compiler error.
 */
export interface LatexDiagnostics {
  /** Engine that produced the PDF, or the last one tried when everything failed. */
  engine: string;
  /** Compiler command actually executed, e.g. `pdflatex -interaction=nonstopmode`. */
  command: string;
  /** Absolute path of the source file written to disk before compiling. */
  sourcePath?: string;
  sourceLines?: number;
  sourceBytes?: number;
  attempts: LatexEngineAttempt[];
  /** First meaningful compiler error, e.g. `! Undefined control sequence.` */
  firstError?: string;
  /** Line number the compiler blamed, when it reported one. */
  firstErrorLine?: number;
  /** Raw compiler output, truncated so it can travel in a JSON response. */
  log?: string;
}

export interface FormatexCompileResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
  log?: string;
  engine?: string;
  durationMs?: number;
  jobId?: string;
  compilationsRemaining?: number;
  compilerService?:
    | 'Self-Hosted LaTeX (CLSI)'
    | 'TexAPI Cloud'
    | 'LaTeX.Online (Free)'
    | 'TeXLive.net (Free)'
    | 'FormaTeX Cloud';
  diagnostics?: LatexDiagnostics;
}

/** Where the exact document handed to the compiler is kept for inspection. */
const LATEX_DEBUG_DIR = path.join(process.cwd(), 'scratch', 'latex-debug');

/**
 * Write the document that is about to be handed to the compiler.
 *
 * A compile error is only actionable next to the source that produced it, and
 * the previous pipeline kept the LaTeX in memory only - there was nothing to
 * open or re-run by hand. Best effort: a read-only filesystem must not stop the
 * paper from compiling.
 */
function saveLatexSource(latex: string, label: string): { sourcePath?: string; lines?: number; bytes?: number } {
  try {
    if (!fs.existsSync(LATEX_DEBUG_DIR)) fs.mkdirSync(LATEX_DEBUG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sourcePath = path.join(LATEX_DEBUG_DIR, `${stamp}-${label}-generated_paper.tex`);
    fs.writeFileSync(sourcePath, latex, 'utf8');
    return { sourcePath, lines: latex.split('\n').length, bytes: Buffer.byteLength(latex, 'utf8') };
  } catch (err: any) {
    console.warn(`[PDF] Could not save the generated LaTeX source: ${err?.message || err}`);
    return {};
  }
}

/**
 * Pull the FIRST meaningful error out of a LaTeX log.
 *
 * The tail of a LaTeX log is full of cascading noise ("Fatal error occurred",
 * "Emergency stop") that all follow from one earlier fault. The first line
 * starting with `!` is the actual cause, and the following `l.<n>` carries the
 * line number.
 */
function extractFirstLatexError(log?: string): { message?: string; line?: number } {
  if (!log) return {};
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*!\s*(.+)$/);
    if (!match) continue;
    const context = lines.slice(i, i + 14).join('\n');
    const lineMatch = context.match(/^l\.(\d+)/m) || context.match(/\.tex:?(\d+):/);
    return { message: `! ${match[1].trim()}`, line: lineMatch ? Number(lineMatch[1]) : undefined };
  }
  // Some cloud services wrap the log; fall back to their own error phrasing.
  const fallback = log.match(/(?:^|\n)\s*!\s*(.+)/);
  return fallback ? { message: `! ${fallback[1].trim()}` } : {};
}

/** The command each engine runs, so the diagnostics can name it exactly. */
const ENGINE_COMMANDS: Record<string, string> = {
  clsi: 'pdflatex -interaction=nonstopmode (self-hosted CLSI service)',
  texapi: 'pdflatex -interaction=nonstopmode (TexAPI cloud)',
  latexonline: 'pdflatex -interaction=nonstopmode (LaTeX.Online)',
  texlive: 'pdflatex -interaction=nonstopmode (TeXLive.net free service)',
  formatex: 'pdflatex -interaction=nonstopmode (FormaTeX cloud)',
};

/**
 * Engines that cost nothing and need no credential.
 *
 * The auto chain tries these before any metered tier, and `freeAiLatexTools.ts`
 * asserts its own free-engine list against this one so the two cannot drift.
 */
export const FREE_LATEX_ENGINES = ['clsi', 'latexonline', 'texlive'] as const;

/** Assemble the diagnostics object for one engine result. */
function buildDiagnostics(params: {
  engine: string;
  attempts: LatexEngineAttempt[];
  source?: { sourcePath?: string; lines?: number; bytes?: number };
  log?: string;
  error?: string;
}): LatexDiagnostics {
  const log = params.log || params.error || '';
  const first = extractFirstLatexError(params.log || params.error);
  return {
    engine: params.engine,
    command: ENGINE_COMMANDS[params.engine] || params.engine,
    sourcePath: params.source?.sourcePath,
    sourceLines: params.source?.lines,
    sourceBytes: params.source?.bytes,
    attempts: params.attempts,
    firstError: first.message,
    firstErrorLine: first.line,
    log: log ? log.slice(0, 8000) : undefined,
  };
}

/**
 * Minimal in-memory POSIX ustar tarball generator for single file compilation
 */
function createUstarArchive(filename: string, content: string | Buffer): Buffer {
  const fileBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  const header = Buffer.alloc(512);

  header.write(filename, 0, 100, 'ascii');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  const sizeOctal = fileBuf.length.toString(8).padStart(11, '0') + '\0';
  header.write(sizeOctal, 124, 12, 'ascii');
  const mtimeOctal = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
  header.write(mtimeOctal, 136, 12, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');

  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.write(checksumOctal, 148, 8, 'ascii');

  const remainder = fileBuf.length % 512;
  const paddingLength = remainder === 0 ? 0 : 512 - remainder;
  const padding = Buffer.alloc(paddingLength);
  const eof = Buffer.alloc(1024);

  return Buffer.concat([header, fileBuf, padding, eof]);
}

/**
 * Check connectivity and status of Free LaTeX.Online Cloud Compiler (latexonline.cc)
 */
export async function getLatexOnlineHealth(): Promise<{ connected: boolean; service: string; engine?: string; error?: string }> {
  try {
    const testDoc = '\\documentclass{article}\\begin{document}ZeroLeak Health Check\\end{document}';
    const testUrl = `${LATEX_ONLINE_BASE_URL}/compile?text=${encodeURIComponent(testDoc)}&command=pdflatex`;
    const res = await fetch(testUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      return { connected: true, service: 'LaTeX.Online (Free)', engine: 'pdflatex' };
    }
    const errText = await res.text();
    return { connected: false, service: 'LaTeX.Online (Free)', error: `LaTeX.Online returned status ${res.status}: ${errText.slice(0, 150)}` };
  } catch (err: any) {
    return { connected: false, service: 'LaTeX.Online (Free)', error: err?.message || 'Failed to connect to LaTeX.Online' };
  }
}

/**
 * Compile LaTeX into PDF using Free LaTeX.Online cloud compiler (https://latexonline.cc)
 * Uses multipart tar POST to avoid URL length constraints, with GET as fallback.
 */
export async function compileWithLatexOnline(options: {
  latex: string;
  command?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
}): Promise<FormatexCompileResult> {
  const { latex, command = 'pdflatex', timeoutMs = 35000 } = options;
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();

  // 1. Try POST /data?target=main.tex with multipart tarball (No URL size limits)
  try {
    const tarBuffer = createUstarArchive('main.tex', latex);
    const formData = new FormData();
    const blob = new Blob([tarBuffer], { type: 'application/x-tar' });
    formData.append('file', blob, 'archive.tar');

    const postUrl = `${LATEX_ONLINE_BASE_URL}/data?target=main.tex&command=${command}`;
    const res = await fetch(postUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuf);
      return {
        success: true,
        pdfBuffer,
        engine: command,
        compilerService: 'LaTeX.Online (Free)',
        durationMs,
      };
    }

    const errorBody = await res.text();
    if (res.status === 400 && errorBody.includes('error:')) {
      return {
        success: false,
        error: `LaTeX.Online compilation syntax error: ${errorBody.slice(0, 300)}`,
        durationMs,
        compilerService: 'LaTeX.Online (Free)',
      };
    }
  } catch (postErr: any) {
    console.warn('[compileWithLatexOnline] POST /data failed, trying GET fallback:', postErr.message);
  }

  // 2. Fallback to GET /compile?text=... for short documents
  try {
    const compileUrl = `${LATEX_ONLINE_BASE_URL}/compile?text=${encodeURIComponent(latex)}&command=${command}`;
    const res = await fetch(compileUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuf);
      return {
        success: true,
        pdfBuffer,
        engine: command,
        compilerService: 'LaTeX.Online (Free)',
        durationMs,
      };
    }

    const errorBody = await res.text();
    return {
      success: false,
      error: `LaTeX.Online compilation failed (${res.status}): ${errorBody.slice(0, 300)}`,
      durationMs,
      compilerService: 'LaTeX.Online (Free)',
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: err?.message || 'LaTeX.Online compilation request failed',
      compilerService: 'LaTeX.Online (Free)',
      durationMs,
    };
  }
}

/**
 * Build the exact multipart form texlive.net accepts.
 *
 * Exported so the one-mistake-that-kills-a-submission (an unknown or misspelled
 * field, or a root document not named `document.tex`) is caught by a test rather
 * than discovered as an unexplained compile failure.
 */
export function buildTexliveNetForm(latex: string, command: string = 'pdflatex'): FormData {
  const engine = (['pdflatex', 'xelatex', 'lualatex'] as const).includes(command as any)
    ? command
    : 'pdflatex';
  const form = new FormData();
  form.append('engine', engine);
  // `return=pdf` asks for the raw PDF; the default is an HTML PDF.js viewer.
  form.append('return', 'pdf');
  form.append('filename[]', TEXLIVE_NET_ROOT_FILE);
  form.append('filecontents[]', latex);
  return form;
}

/**
 * Compile LaTeX with the free public TeXLive.net service.
 *
 * The second quota-free compiler in the chain: latexonline.cc and this one share
 * no infrastructure, so a paper still builds when either is down and when the
 * self-hosted container is not running at all. Neither costs a key or a quota.
 */
export async function compileWithTexliveNet(options: {
  latex: string;
  command?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
}): Promise<FormatexCompileResult> {
  const { latex, command = 'pdflatex', timeoutMs = 45000 } = options;
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${TEXLIVE_NET_BASE_URL}/cgi-bin/latexcgi`, {
      method: 'POST',
      // Content-Type is deliberately not set: fetch owns the multipart boundary,
      // and hand-setting it drops the boundary from the header.
      body: buildTexliveNetForm(latex, command),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    const buffer = Buffer.from(await res.arrayBuffer());

    // A failed compile still answers HTTP 200 with a log page, so the magic
    // bytes - not the status code - decide whether a PDF came back.
    if (res.ok && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
      return {
        success: true,
        pdfBuffer: buffer,
        engine: command,
        compilerService: 'TeXLive.net (Free)',
        durationMs,
      };
    }

    const log = buffer.toString('utf8');
    return {
      success: false,
      error: `TeXLive.net compilation failed (HTTP ${res.status}): ${
        extractFirstLatexError(log).message || log.replace(/\s+/g, ' ').slice(0, 300) || 'no response body'
      }`,
      log,
      durationMs,
      compilerService: 'TeXLive.net (Free)',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'TeXLive.net compilation request failed',
      durationMs: Date.now() - startTime,
      compilerService: 'TeXLive.net (Free)',
    };
  }
}

/**
 * Check connectivity of the free TeXLive.net compiler.
 */
export async function getTexliveNetHealth(): Promise<{
  connected: boolean;
  service: string;
  engine?: string;
  url?: string;
  error?: string;
}> {
  const probe = '\\documentclass{article}\\begin{document}ZeroLeak Health Check\\end{document}';
  try {
    const res = await fetch(`${TEXLIVE_NET_BASE_URL}/cgi-bin/latexcgi`, {
      method: 'POST',
      body: buildTexliveNetForm(probe, 'pdflatex'),
      signal: AbortSignal.timeout(30000),
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    if (res.ok && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
      return {
        connected: true,
        service: 'TeXLive.net (Free)',
        engine: 'pdflatex',
        url: TEXLIVE_NET_BASE_URL,
      };
    }
    return {
      connected: false,
      service: 'TeXLive.net (Free)',
      url: TEXLIVE_NET_BASE_URL,
      error: `HTTP ${res.status}: ${buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 200)}`,
    };
  } catch (err: any) {
    return {
      connected: false,
      service: 'TeXLive.net (Free)',
      url: TEXLIVE_NET_BASE_URL,
      error: err?.message || 'unreachable',
    };
  }
}

/**
 * Compile LaTeX using the self-hosted latex-service container.
 *
 * Runs on the local Docker network via `latex-service/server.js`, which exposes
 * a CLSI-shaped API. No quota, no API key, no third party - unlike the cloud
 * engines this cannot be rate limited or hit a monthly ceiling.
 */
export async function compileWithLocalClsi(options: {
  latex: string;
  command?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
  resources?: LatexCompileResource[];
}): Promise<FormatexCompileResult> {
  const { latex, command = 'pdflatex', timeoutMs = 60000, resources = [] } = options;
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${LATEX_SERVICE_URL}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latex,
        compiler: command,
        timeout: Math.ceil(timeoutMs / 1000),
        // Only the self-hosted engine can resolve side files; the cloud engines
        // take a single document, so figures degrade to the placeholder branch
        // the generator writes (see \IfFileExists in patternPaperComposer).
        ...(resources.length ? { resources } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });

    const durationMs = Date.now() - startTime;

    if (res.ok) {
      const pdfBuffer = Buffer.from(await res.arrayBuffer());
      // Trust the magic bytes, not the status code.
      if (pdfBuffer.length > 0 && pdfBuffer.subarray(0, 5).toString('latin1') === '%PDF-') {
        return {
          success: true,
          pdfBuffer,
          engine: command,
          compilerService: 'Self-Hosted LaTeX (CLSI)',
          durationMs,
        };
      }
      return {
        success: false,
        error: 'Self-hosted LaTeX service returned a non-PDF response.',
        durationMs,
        compilerService: 'Self-Hosted LaTeX (CLSI)',
      };
    }

    const body: any = await res.json().catch(() => ({}));
    return {
      success: false,
      error: `Self-hosted LaTeX compilation failed (${res.status}): ${String(body.error || '').slice(0, 300)}`,
      log: body.log,
      durationMs,
      compilerService: 'Self-Hosted LaTeX (CLSI)',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Self-hosted LaTeX service unreachable',
      durationMs: Date.now() - startTime,
      compilerService: 'Self-Hosted LaTeX (CLSI)',
    };
  }
}

/**
 * Check connectivity of the self-hosted latex-service container.
 */
export async function getLocalClsiHealth(): Promise<{
  connected: boolean;
  service?: string;
  url?: string;
  compilers?: string[];
  error?: string;
}> {
  try {
    const res = await fetch(`${LATEX_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { connected: false, url: LATEX_SERVICE_URL, error: `HTTP ${res.status}` };
    }
    const body: any = await res.json();
    return {
      connected: body?.status === 'ok',
      service: 'Self-Hosted LaTeX (CLSI)',
      url: LATEX_SERVICE_URL,
      compilers: body?.compilers,
    };
  } catch (err: any) {
    return {
      connected: false,
      url: LATEX_SERVICE_URL,
      error: err?.message || 'unreachable',
    };
  }
}

/**
 * Compile LaTeX via TexAPI Cloud (https://texapi.ovh).
 *
 * Uses the MULTIPART endpoint, not the JSON one. As of this writing
 * `POST /api/latex/compile` (application/json) returns HTTP 500
 * "internal-error" even for the example in TexAPI's own documentation, while
 * `POST /api/latex/compile/file` works correctly. Verified against the live
 * service: a valid key, the same LaTeX body, only the endpoint differing.
 *
 * Contract notes:
 *  - Auth is the `X-API-KEY` header, not a Bearer token.
 *  - A failed compile returns HTTP 200 with `status: "error"`, so the status
 *    code alone is not a success signal - `status` and the artefact's magic
 *    bytes are checked instead.
 *  - Artefacts expire after 10 minutes, so the PDF is fetched immediately.
 *  - Compiling costs two requests (compile + fetch) against a 20 req/min cap,
 *    so this tier is rate-limited in practice to ~10 compiles/minute.
 */
export async function compileWithTexApi(options: {
  latex: string;
  command?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
}): Promise<FormatexCompileResult> {
  const { latex, command = 'pdflatex', timeoutMs = 60000 } = options;

  if (!TEXAPI_API_KEY) {
    return {
      success: false,
      error: 'TEXAPI_API_KEY is not configured.',
      compilerService: 'TexAPI Cloud',
    };
  }
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();
  const engine = (['pdflatex', 'xelatex', 'lualatex'] as const).includes(command as any)
    ? command
    : 'pdflatex';

  try {
    // Do NOT set Content-Type: fetch assigns the multipart boundary itself.
    const form = new FormData();
    form.append('files', new Blob([latex], { type: 'text/plain' }), 'main.tex');

    const url = `${TEXAPI_BASE_URL}/api/latex/compile/file?compiler=${engine}&mainFile=main.tex`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-KEY': TEXAPI_API_KEY },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: `TexAPI rejected the API key (HTTP ${res.status}).`,
        durationMs,
        compilerService: 'TexAPI Cloud',
      };
    }
    if (res.status === 429) {
      return {
        success: false,
        error: 'TexAPI rate limit exceeded (20 requests/minute).',
        durationMs,
        compilerService: 'TexAPI Cloud',
      };
    }

    // A streamed PDF is still accepted in case they fix the JSON endpoint.
    if ((res.headers.get('content-type') || '').includes('application/pdf')) {
      const pdfBuffer = Buffer.from(await res.arrayBuffer());
      if (pdfBuffer.subarray(0, 5).toString('latin1') === '%PDF-') {
        return { success: true, pdfBuffer, engine, compilerService: 'TexAPI Cloud', durationMs };
      }
    }

    const body: any = await res.json().catch(() => null);
    if (!body) {
      return {
        success: false,
        error: `TexAPI returned an unreadable response (HTTP ${res.status}).`,
        durationMs,
        compilerService: 'TexAPI Cloud',
      };
    }

    const errors = Array.isArray(body.errors) ? body.errors.join('; ') : '';

    // HTTP 200 does NOT imply success here.
    if (body.status !== 'success' || !body.resultPath) {
      return {
        success: false,
        error: `TexAPI compilation failed: ${errors || `no detail (HTTP ${res.status})`}`,
        log: errors,
        durationMs,
        compilerService: 'TexAPI Cloud',
      };
    }

    // Fetch the artefact before it expires (10 minute retention).
    const fileRes = await fetch(`${TEXAPI_BASE_URL}${body.resultPath}`, {
      headers: { 'X-API-KEY': TEXAPI_API_KEY },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const pdfBuffer = Buffer.from(await fileRes.arrayBuffer());

    if (pdfBuffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return {
        success: false,
        error: `TexAPI artefact fetch did not return a PDF (HTTP ${fileRes.status}).`,
        durationMs,
        compilerService: 'TexAPI Cloud',
      };
    }

    return {
      success: true,
      pdfBuffer,
      engine,
      compilerService: 'TexAPI Cloud',
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'TexAPI request failed',
      durationMs: Date.now() - startTime,
      compilerService: 'TexAPI Cloud',
    };
  }
}

/**
 * Check connectivity and API key validity for TexAPI Cloud.
 */
export async function getTexApiHealth(): Promise<{
  connected: boolean;
  service?: string;
  url?: string;
  error?: string;
}> {
  if (!TEXAPI_API_KEY) {
    return { connected: false, url: TEXAPI_BASE_URL, error: 'TEXAPI_API_KEY is not configured.' };
  }
  try {
    const probe = '\\documentclass{article}\\begin{document}ZeroLeak Health Check\\end{document}';
    const form = new FormData();
    form.append('files', new Blob([probe], { type: 'text/plain' }), 'main.tex');

    const res = await fetch(
      `${TEXAPI_BASE_URL}/api/latex/compile/file?compiler=pdflatex&mainFile=main.tex`,
      {
        method: 'POST',
        headers: { 'X-API-KEY': TEXAPI_API_KEY },
        body: form,
        signal: AbortSignal.timeout(30000),
      }
    );

    if (res.status === 401 || res.status === 403) {
      return { connected: false, url: TEXAPI_BASE_URL, error: `API key rejected (HTTP ${res.status}).` };
    }
    if (res.status === 429) {
      return { connected: false, url: TEXAPI_BASE_URL, error: 'Rate limit exceeded (20 req/min).' };
    }

    const body: any = await res.json().catch(() => null);
    if (body?.status === 'success') {
      return { connected: true, service: 'TexAPI Cloud', url: TEXAPI_BASE_URL };
    }
    return {
      connected: false,
      url: TEXAPI_BASE_URL,
      error: `HTTP ${res.status}: ${(body?.errors || []).join('; ') || 'unexpected response'}`,
    };
  } catch (err: any) {
    return { connected: false, url: TEXAPI_BASE_URL, error: err?.message || 'unreachable' };
  }
}

/**
 * Check connectivity and validity of FormaTeX Cloud LaTeX API Key
 */
export async function getFormatexHealth(): Promise<{ connected: boolean; engine?: string; error?: string }> {
  try {
    const testDoc = '\\documentclass{article}\\begin{document}ZeroLeak Health Check\\end{document}';
    const res = await fetch(`${FORMATEX_BASE_URL}/compile`, {
      method: 'POST',
      headers: {
        'X-API-Key': FORMATEX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latex: testDoc,
        engine: 'pdflatex',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      return { connected: true, engine: 'pdflatex' };
    }
    const errText = await res.text();
    return { connected: false, error: `FormaTeX returned status ${res.status}: ${errText}` };
  } catch (err: any) {
    return { connected: false, error: err?.message || 'Failed to connect to FormaTeX API' };
  }
}

/**
 * Intelligent sanitization and repair for LaTeX question strings.
 * Preserves math environments ($...$, $$...$$, \[...\], \(...\)) while safely escaping unescaped special characters.
 */
/**
 * Unicode that pdflatex cannot typeset, mapped to LaTeX equivalents.
 *
 * Private-use characters (U+E000-U+F8FF) are NOT in this map on purpose: they
 * arrive from PDF symbol-font extraction (Wingdings bullets, dingbats) and
 * carry no recoverable text, so stripUnsupportedUnicode drops them instead.
 */
const UNICODE_LATEX_MAP: Record<string, string> = {
  '‘': "'", '’': "'", '‚': ',', '‛': "'",
  '“': '``', '”': "''", '„': '"', '‟': '"',
  '–': '--', '—': '---', '―': '---',
  '…': '\\ldots{}', '•': '\\textbullet{}', '·': '\\textperiodcentered{}',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '​': '', '‌': '', '‍': '', '﻿': '',
  '×': '$\\times$', '÷': '$\\div$', '±': '$\\pm$',
  '≤': '$\\leq$', '≥': '$\\geq$', '≠': '$\\neq$', '≈': '$\\approx$',
  '→': '$\\rightarrow$', '←': '$\\leftarrow$', '⇒': '$\\Rightarrow$',
  '∞': '$\\infty$', '∑': '$\\sum$', '∏': '$\\prod$',
  '∫': '$\\int$', '√': '$\\surd$', '∈': '$\\in$', '∉': '$\\notin$',
  'α': '$\\alpha$', 'β': '$\\beta$', 'γ': '$\\gamma$',
  'δ': '$\\delta$', 'ε': '$\\epsilon$', 'θ': '$\\theta$',
  'λ': '$\\lambda$', 'μ': '$\\mu$', 'π': '$\\pi$',
  'ρ': '$\\rho$', 'σ': '$\\sigma$', 'τ': '$\\tau$',
  'φ': '$\\phi$', 'ψ': '$\\psi$', 'ω': '$\\omega$',
  'Δ': '$\\Delta$', 'Σ': '$\\Sigma$', 'Φ': '$\\Phi$', 'Ω': '$\\Omega$',
};

/**
 * Drop or transliterate characters pdflatex cannot set, so a document that
 * compiled to a Unicode error in the source PDF still produces a PDF here.
 */
export function stripUnsupportedUnicode(text: string): { text: string; stripped: number } {
  if (!text) return { text: '', stripped: 0 };
  let out = '';
  let stripped = 0;

  for (const ch of text) {
    const mapped = UNICODE_LATEX_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }

    const cp = ch.codePointAt(0)!;

    // Private Use Area (BMP + supplementary planes): symbol-font extraction junk.
    if ((cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000) {
      stripped++;
      continue;
    }

    // Control characters other than tab/newline would break the run.
    if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a) || cp === 0x7f) {
      stripped++;
      continue;
    }

    out += ch;
  }

  return { text: out, stripped };
}

export function cleanAndSanitizeLatex(rawText: string): string {
  if (!rawText) return '';
  let text = String(rawText).trim();

  // Normalise unsupported Unicode before anything else so the math-protection
  // placeholders and escaping below only ever see typesettable characters.
  const unicodeResult = stripUnsupportedUnicode(text);
  text = unicodeResult.text;
  if (unicodeResult.stripped > 0) {
    console.warn(
      `[cleanAndSanitizeLatex] dropped ${unicodeResult.stripped} untypesettable character(s) from question text`
    );
  }

  const mathSegments: string[] = [];
  const placeholder = (i: number) => `ZZMATHBLOCK${i}ZZ`;

  // Protect whole LaTeX environments before escaping anything. A `tabular` or a
  // `tikzpicture` carries its own `&`, `_` and `%` syntax; escaping those turned
  // working tables and diagrams into broken ones, which is a large part of why
  // no extracted table or diagram ever reached the PDF.
  const envRegex = /\\begin\{(tabularx?|tabular\*|array|matrix|pmatrix|bmatrix|vmatrix|tikzpicture|align\*?)\}[\s\S]*?\\end\{\1\}/g;
  text = text.replace(envRegex, (match) => {
    const idx = mathSegments.length;
    mathSegments.push(match);
    return placeholder(idx);
  });

  // Protect all LaTeX math environments
  const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^$\r\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  text = text.replace(mathRegex, (match) => {
    const idx = mathSegments.length;
    mathSegments.push(match);
    return placeholder(idx);
  });

  // Safely escape special LaTeX characters that are unescaped in text
  text = text.replace(/(?<!\\)&/g, '\\&');
  text = text.replace(/(?<!\\)%/g, '\\%');
  text = text.replace(/(?<!\\)#/g, '\\#');
  text = text.replace(/(?<!\\)_/g, '\\_');
  text = text.replace(/(?<!\\)~/g, '\\textasciitilde{}');
  text = text.replace(/(?<!\\)\^/g, '\\textasciicircum{}');

  // Restore protected math environments
  for (let i = 0; i < mathSegments.length; i++) {
    text = text.split(placeholder(i)).join(mathSegments[i]);
  }

  return text;
}

/** A question as the AI/parser reported it, including any LaTeX it carries. */
export interface UniversityLatexQuestion {
  number?: string;
  text?: string;
  marks?: string | number;
  options?: string[];
  table?: string;
  tikz?: string;
  orText?: string;
  orMarks?: string | number;
  orTikz?: string;
}

/** One printed section of the pattern detected in the uploaded papers. */
export interface UniversityLatexSection {
  title?: string;
  instructions?: string;
  totalMarks?: string | number;
  questions?: UniversityLatexQuestion[];
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Print a marks value the way the paper does, without doubling the word "Marks". */
function formatMarks(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/mark/i.test(raw)) return raw;
  return raw === '1' ? '1 Mark' : `${raw} Marks`;
}

/**
 * Split a question body into its prose and the LaTeX table/diagram blocks it
 * carries, so the extras can be centred instead of running into the sentence.
 */
/**
 * A reference to a figure that was lifted out of the source paper, written by
 * the model as `[FIGURE:1]`. The examiner's rule is that an existing diagram is
 * reused unchanged rather than redrawn, so the model points at the extracted
 * asset instead of producing TikZ for it.
 */
const FIGURE_MARKER = /\[\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]\]|\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]/gi;

export function splitLatexExtras(text: string): {
  body: string;
  tables: string[];
  diagrams: string[];
  figureRefs: number[];
} {
  let body = String(text ?? '');
  const tables: string[] = [];
  const diagrams: string[] = [];
  const figureRefs: number[] = [];

  body = body.replace(/\\begin\{tabularx?\}[\s\S]*?\\end\{tabularx?\}/gi, (match) => {
    tables.push(match);
    return '';
  });
  body = body.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/gi, (match) => {
    diagrams.push(match);
    return '';
  });
  body = body.replace(FIGURE_MARKER, (_match, braced, plain) => {
    const value = Number(braced || plain);
    if (Number.isFinite(value) && value > 0 && !figureRefs.includes(value)) figureRefs.push(value);
    return '';
  });

  return {
    body: body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    tables,
    diagrams,
    figureRefs,
  };
}

/**
 * Print an extracted source figure where the model pointed at it.
 *
 * The file is looked up with `\IfFileExists` so a figure the compiler never
 * received cannot abort the whole paper; it degrades to a labelled box instead.
 */
export function renderSourceFigureLatex(figureNumber: number): string {
  const file = `figure-${figureNumber}.png`;
  return [
    '\\begin{center}',
    `  \\IfFileExists{${file}}{\\includegraphics[width=0.72\\textwidth]{${file}}}` +
      `{\\fbox{\\parbox{0.6\\textwidth}{\\centering\\small [Diagram ${figureNumber} from the source paper]}}}`,
    '\\end{center}',
  ].join('\n');
}

/**
 * Render a supplied pattern as the paper body.
 *
 * Every section, every question and every mark the source declared is printed -
 * nothing is capped, sliced or re-labelled - because a paper that silently
 * drops half its questions and invents its own marking scheme is worse than one
 * that refuses to build. Question text is treated as LaTeX so `tabular` tables
 * and `tikzpicture` diagrams travel straight through to the compiler.
 */
export function renderPatternSectionsLatex(sections: UniversityLatexSection[]): string {
  const blocks: string[] = [];

  sections.forEach((section, sIdx) => {
    const questions = Array.isArray(section?.questions) ? section.questions.filter(Boolean) : [];
    const title = cleanAndSanitizeLatex(
      String(section?.title || `SECTION ${ROMAN_NUMERALS[sIdx] || sIdx + 1}`).trim()
    );
    const sectionMarks = formatMarks(section?.totalMarks);
    const instructions = section?.instructions ? cleanAndSanitizeLatex(String(section.instructions).trim()) : '';

    const lines: string[] = [
      '\\vspace{2mm}',
      '\\begin{center}',
      `  {\\large \\textbf{\\color{boardblue}${title}}}${sectionMarks ? ` \\hfill \\textbf{[${sectionMarks}]}` : ''}`,
      '\\end{center}',
    ];

    if (instructions) {
      // Every block is closed with an explicit paragraph break: LaTeX joins
      // consecutive source lines into one paragraph, which made the section
      // instruction run straight into Q.1 and split the option table in half.
      lines.push('\\vspace{1mm}', `\\noindent \\textbf{${instructions}}\\par`, '\\vspace{1mm}');
    }

    if (questions.length === 0) {
      lines.push('\\vspace{1mm}', '\\noindent \\textit{[No questions were extracted for this section.]}');
    }

    questions.forEach((question, qIdx) => {
      const label = cleanAndSanitizeLatex(String(question?.number || `Q.${qIdx + 1}`).trim());
      const { body, tables, diagrams, figureRefs } = splitLatexExtras(String(question?.text || ''));
      const marks = formatMarks(question?.marks);

      const rendered: string[] = [
        `\\noindent \\textbf{${label}} ${cleanAndSanitizeLatex(body)}${marks ? ` \\hfill \\textbf{[${marks}]}` : ''}\\par`,
      ];

      // A question's own table or diagram is typeset as real LaTeX, not prose.
      for (const table of [...tables, String(question?.table || '')]) {
        if (table.trim()) rendered.push('', '\\begin{center}', '\\small', table.trim(), '\\end{center}');
      }
      for (const diagram of [...diagrams, String(question?.tikz || '')]) {
        if (diagram.trim()) rendered.push('', '\\begin{center}', diagram.trim(), '\\end{center}');
      }
      // A diagram the source paper already contains is reused as the pixels that
      // were lifted out of it: never redrawn, never approximated.
      for (const figureNumber of figureRefs) {
        rendered.push('', renderSourceFigureLatex(figureNumber));
      }

      const options = Array.isArray(question?.options)
        ? question.options
            .map((opt) => cleanAndSanitizeLatex(String(opt).replace(/^\(?[a-dA-D]\)\s*/, '').trim()))
            .filter(Boolean)
        : [];
      if (options.length > 0) {
        rendered.push('', '\\vspace{1mm}', '{\\small', '\\begin{tabularx}{\\linewidth}{@{}X X@{}}');
        for (let i = 0; i < options.length; i += 2) {
          const left = `\\textbf{${String.fromCharCode(97 + i)})} ${options[i]}`;
          const right = options[i + 1] ? `\\textbf{${String.fromCharCode(97 + i + 1)})} ${options[i + 1]}` : '';
          rendered.push(`  ${left} & ${right} \\\\[1mm]`);
        }
        rendered.push('\\end{tabularx}', '}');
      }

      if (question?.orText) {
        const orMarks = formatMarks(question?.orMarks);
        rendered.push(
          '',
          '\\begin{center}\\textbf{--- OR ---}\\end{center}',
          `\\noindent ${cleanAndSanitizeLatex(String(question.orText))}${orMarks ? ` \\hfill \\textbf{[${orMarks}]}` : ''}`
        );
        if (question?.orTikz && String(question.orTikz).trim()) {
          rendered.push('\\begin{center}', String(question.orTikz).trim(), '\\end{center}');
        }
      }

      lines.push(rendered.join('\n'), '\\vspace{2mm}', '');
    });

    lines.push('\\vspace{3mm}', '\\hrule', '\\vspace{3mm}');
    blocks.push(lines.join('\n'));
  });

  return blocks.join('\n');
}

/**
 * Generate a complete, publication-grade university/board question paper in clean LaTeX.
 *
 * Pass `sections` to print a specific pattern; `mcqs`/`theorySec1`/`theorySec2`
 * stay supported for callers that only have the three-way split.
 */
export function generateUniversityLatexDocument(params: {
  exam: any;
  setLetter?: string;
  mcqs?: any[];
  theorySec1?: any[];
  theorySec2?: any[];
  sections?: UniversityLatexSection[];
  durationMinutes?: number;
  totalMarks?: number;
}): string {
  const {
    exam = {},
    setLetter = 'P',
    mcqs = [],
    theorySec1 = [],
    theorySec2 = [],
    durationMinutes = exam.duration_minutes || exam.time_limit_mins || 180,
    totalMarks = exam.total_marks || exam.max_marks || 70,
  } = params;

  const universityName = cleanAndSanitizeLatex(exam.university_name || 'AUTONOMOUS STATE EXAMINATION BOARD');
  const examTitle = cleanAndSanitizeLatex(exam.name || 'ANNUAL UNIVERSITY EXAMINATION 2026');
  const subjectName = cleanAndSanitizeLatex(exam.subject || 'Core Engineering & Technology');
  const paperCode = cleanAndSanitizeLatex(exam.code || exam.paper_code || 'SLR-HL-475');
  const blueprintPattern = cleanAndSanitizeLatex(exam.blueprint_pattern || 'CBCS Pattern');
  const markingScheme = cleanAndSanitizeLatex(exam.marking_scheme || 'Standard University Marking Scheme');

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const stripItemPrefix = (str: string): string => {
    if (!str) return '';
    return str.replace(/^(?:Q\.?\s*\d+[\.\)]\s*|[a-zA-Z0-9][\.\)]\s*|\([a-zA-Z0-9]\)\s*)+/i, '').trim();
  };

  // Prepare MCQs Section
  const mcqLines: string[] = [];
  mcqs.forEach((mcq, mIdx) => {
    const rawText = stripItemPrefix(mcq.text || mcq.content_text || mcq.question_text || mcq.question || `Question ${mIdx + 1}`);
    const qText = cleanAndSanitizeLatex(rawText);
    let opts = mcq.options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { opts = []; }
    }
    if (!Array.isArray(opts)) opts = [];

    mcqLines.push(`  \\item ${qText}`);
    if (opts.length > 0) {
      mcqLines.push(`  \\begin{enumerate}[label={\\textbf{\\alph*)}}]`);
      opts.forEach((opt: any) => {
        const optText = typeof opt === 'object' ? (opt.text || opt.label || '') : String(opt);
        mcqLines.push(`    \\item ${cleanAndSanitizeLatex(stripItemPrefix(optText))}`);
      });
      mcqLines.push(`  \\end{enumerate}`);
    }
    mcqLines.push(`  \\vspace{1.5mm}`);
  });

  // Prepare Theory Section I
  const theory1Lines: string[] = [];
  theorySec1.forEach((tq, tIdx) => {
    const rawText = stripItemPrefix(tq.text || tq.content_text || tq.question_text || tq.question || `Theory question ${tIdx + 1}`);
    const tText = cleanAndSanitizeLatex(rawText);
    const marks = tq.marks || 7;
    theory1Lines.push(`  \\item ${tText} \\hfill \\textbf{[${marks}]} \\vspace{1.5mm}`);
  });

  // Prepare Theory Section II
  const theory2Lines: string[] = [];
  theorySec2.forEach((tq, tIdx) => {
    const rawText = stripItemPrefix(tq.text || tq.content_text || tq.question_text || tq.question || `Analytical problem ${tIdx + 1}`);
    const tText = cleanAndSanitizeLatex(rawText);
    const marks = tq.marks || 7;
    theory2Lines.push(`  \\item ${tText} \\hfill \\textbf{[${marks}]} \\vspace{1.5mm}`);
  });

  const hasMcqs = mcqLines.length > 0;
  const qSec1A = hasMcqs ? 'Q.2' : 'Q.1';
  const qSec1B = hasMcqs ? 'Q.3' : 'Q.2';
  const qSec2A = hasMcqs ? 'Q.4' : 'Q.3';
  const qSec2B = hasMcqs ? 'Q.5' : 'Q.4';

  const mcqSectionLatex = hasMcqs ? `
% --- Section: Q.1 MCQs ---
\\noindent
\\textbf{\\large Q.1 Choose the correct alternatives for the following questions.} \\hfill \\textbf{[${mcqs.length} Marks]}

\\begin{enumerate}[label=\\textbf{\\arabic*.} , leftmargin=6mm, itemsep=2mm]
${mcqLines.join('\n')}
\\end{enumerate}
\\vspace{4mm}
\\hrule
\\vspace{4mm}
` : '';

  const section1Latex = theory1Lines.length > 0 ? `
% --- Section I: Theory & Concepts ---
\\begin{center}
  {\\large \\textbf{\\color{boardblue}SECTION -- I (Theory \\& Core Concepts)}} \\hfill \\textbf{[${Math.round(totalMarks * 0.4)} Marks]}
\\end{center}
\\vspace{2mm}

\\noindent
\\textbf{${qSec1A} Answer the following questions (Attempt Any Four):} \\hfill \\textbf{[16 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory1Lines.slice(0, 5).length > 0 ? theory1Lines.slice(0, 5) : theory1Lines).join('\n')}
\\end{enumerate}

\\vspace{3mm}
\\noindent
\\textbf{${qSec1B} Answer the following questions in detail (Attempt Any Two):} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory1Lines.slice(5).length > 0 ? theory1Lines.slice(5) : theory1Lines.slice(0, 2)).join('\n')}
\\end{enumerate}
\\vspace{4mm}
\\hrule
\\vspace{4mm}
` : '';

  const section2Latex = theory2Lines.length > 0 ? `
% --- Section II: Analysis & Applications ---
\\begin{center}
  {\\large \\textbf{\\color{boardblue}SECTION -- II (Analysis, Design \\& Applications)}} \\hfill \\textbf{[${Math.round(totalMarks * 0.4)} Marks]}
\\end{center}
\\vspace{2mm}

\\noindent
\\textbf{${qSec2A} Answer the following questions (Attempt Any Four):} \\hfill \\textbf{[16 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory2Lines.slice(0, 5).length > 0 ? theory2Lines.slice(0, 5) : theory2Lines).join('\n')}
\\end{enumerate}

\\vspace{3mm}
\\noindent
\\textbf{${qSec2B} Solve / Explain the following technical problems:} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)} , leftmargin=6mm, itemsep=2mm]
${(theory2Lines.slice(5).length > 0 ? theory2Lines.slice(5) : theory2Lines.slice(0, 2)).join('\n')}
\\end{enumerate}
` : '';

  // Safe fallback if no question lines exist
  const fallbackQuestions = (!mcqSectionLatex && !section1Latex && !section2Latex) ? `
\\noindent
\\textbf{\\large Examination Questions}
\\begin{enumerate}[label=\\textbf{\\arabic*.} , leftmargin=6mm, itemsep=3mm]
  \\item Explain the fundamental concepts, system architecture, and design methodology of ${subjectName}. \\hfill \\textbf{[10]}
  \\item Differentiate between primary algorithms and evaluate their performance characteristics. \\hfill \\textbf{[10]}
\\end{enumerate}
` : '';

  // A detected or supplied pattern wins outright. The legacy three-slot template
  // above caps each section at five questions and hardcodes "Answer any four"
  // with fixed 16/12 mark blocks, so running pattern data through it silently
  // shrank the paper - a 70-mark paper that carried five questions and 5 marks.
  const patternSections = Array.isArray(params.sections) ? params.sections : [];
  const usesPattern = patternSections.some(
    (section) => Array.isArray(section?.questions) && section.questions.length > 0
  );
  const bodyLatex = usesPattern
    ? renderPatternSectionsLatex(patternSections)
    : [mcqSectionLatex, section1Latex, section2Latex, fallbackQuestions].join('\n');

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[top=20mm,bottom=20mm,left=18mm,right=18mm]{geometry}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{array}
\\usepackage{graphicx}
\\usepackage{tikz}
\\usetikzlibrary{arrows.meta,positioning,shapes.geometric,calc,decorations.pathreplacing,fit,backgrounds}
\\usepackage{microtype}
\\usepackage{xcolor}

% Color definitions
\\definecolor{boardblue}{RGB}{15, 23, 42}
\\definecolor{accentcrimson}{RGB}{190, 18, 60}
\\definecolor{watermarkgray}{RGB}{148, 163, 184}

% Page style & Confidential Watermark
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\footrulewidth}{0.5pt}
% Left/centre/right heads share one line. The left head was colliding with the
% centre head under the current margins, so the paper code now rides on the
% right with the set label and the centre head is left empty.
\\lhead{\\small\\textbf{\\color{accentcrimson}ZEROLEAK} $\\cdot$ \\textsf{CONFIDENTIAL}}
\\chead{}
\\rhead{\\small\\textsf{\\textbf{${paperCode}}} $\\cdot$ \\textbf{\\color{boardblue}SET: ${setLetter}}}
\\lfoot{\\footnotesize Generated via FormaTeX \\& ZeroLeak Cryptographic Engine}
\\rfoot{\\footnotesize Page \\textbf{\\thepage}}

\\begin{document}

% --- Seat Number Box & Paper Header ---
\\noindent
\\begin{tabularx}{\\textwidth}{@{}l X r@{}}
  \\fbox{\\textbf{Seat No:}\\hspace{3.5cm}} & & 
  \\begin{tabular}{|c|c|}
    \\hline
    \\textbf{SET} & \\textbf{${setLetter}} \\\\
    \\hline
  \\end{tabular}
\\end{tabularx}

\\vspace{3mm}

\\begin{center}
  {\\Large \\textbf{\\color{boardblue}${universityName}}}\\\\[1.5mm]
  {\\large \\textbf{${examTitle}}}\\\\[1.5mm]
  {\\normalsize \\textbf{Subject: ${subjectName}} \\quad $\\cdot$ \\quad \\textbf{Pattern: ${blueprintPattern}}}\\\\[2mm]
  \\hrule height 1.2pt
  \\vspace{1.5mm}
  \\begin{tabularx}{\\textwidth}{@{}l X r@{}}
    \\textbf{Day \\& Date:} ${todayStr} & 
    \\centering \\textbf{Duration:} ${durationMinutes} Minutes & 
    \\textbf{Max. Marks:} ${totalMarks} Marks
  \\end{tabularx}
  \\vspace{1mm}
  \\hrule height 0.6pt
\\end{center}

\\vspace{2mm}

% --- General Instructions ---
\\noindent
\\textbf{\\underline{Instructions for Candidates:}}
\\begin{enumerate}[label=\\textbf{\\arabic*.} , itemsep=0.5mm, topsep=1mm]
  \\item Q.1 is compulsory. Mention the question paper set \\textbf{(${setLetter})} clearly on top of the answer booklet.
  \\item Figures to the right indicate full marks assigned to each question.
  \\item Assume suitable data wherever necessary and state your assumptions explicitly.
  \\item Use of programmable calculators or unauthorized electronic communication devices is strictly prohibited.
  \\item ${markingScheme}
\\end{enumerate}

\\vspace{4mm}
\\hrule
\\vspace{3mm}

${bodyLatex}

\\vspace{6mm}
\\begin{center}
  \\textsf{\\footnotesize --- END OF QUESTION PAPER (${setLetter}) ---}
\\end{center}

\\end{document}`;
}

/**
 * Compile LaTeX into PDF using FormaTeX REST API
 */
export async function compileLatexWithFormatex(options: FormatexCompileOptions): Promise<FormatexCompileResult> {
  const { latex, engine = 'pdflatex', smart = true, timeoutMs = 30000 } = options;
  if (!latex || !latex.trim()) {
    return { success: false, error: 'No LaTeX source provided for compilation.' };
  }

  const startTime = Date.now();
  const endpoint = smart ? `${FORMATEX_BASE_URL}/compile/smart` : `${FORMATEX_BASE_URL}/compile`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-Key': FORMATEX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latex,
        engine,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - startTime;
    const jobId = res.headers.get('x-job-id') || undefined;
    const remainingHeader = res.headers.get('x-compilations-remaining') || res.headers.get('x-ratelimit-remaining');
    const compilationsRemaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/pdf')) {
        const arrayBuf = await res.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuf);
        return {
          success: true,
          pdfBuffer,
          engine,
          durationMs,
          jobId,
          compilationsRemaining,
        };
      }

      // JSON response
      const jsonRes = (await res.json()) as any;
      if (jsonRes.pdfBase64) {
        return {
          success: true,
          pdfBuffer: Buffer.from(jsonRes.pdfBase64, 'base64'),
          engine,
          durationMs,
          jobId,
          compilationsRemaining,
        };
      }
    }

    // Try fallback to standard /compile if /compile/smart returned non-200
    if (smart) {
      return await compileLatexWithFormatex({ ...options, smart: false });
    }

    const errorBody = await res.text();
    return {
      success: false,
      error: `FormaTeX compilation failed (${res.status}): ${errorBody.slice(0, 300)}`,
      durationMs,
      jobId,
      compilationsRemaining,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: err?.message || 'FormaTeX compilation request failed',
      durationMs,
    };
  }
}

/**
 * Universal LaTeX Compiler tiers:
 * 1. Primary: Self-hosted latex-service container (CLSI-shaped API) - no quota, no API key
 * 2. Fallback: TexAPI Cloud (https://texapi.ovh) - X-API-KEY auth, 20 req/min, skipped when no key
 * 3. Fallback: Free LaTeX.Online cloud compiler (https://latexonline.cc)
 * 4. Fallback: Free TeXLive.net compiler (https://texlive.net) - no key, no quota
 * 5. Last resort: FormaTeX Cloud REST API (https://api.formatex.io) - metered
 */
export function isolateAndFormatLatexTablesAndDiagrams(latex: string): string {
  if (!latex) return '';
  let out = latex;

  // 1. Ensure Preamble has all necessary packages and TikZ libraries
  if (out.includes('\\documentclass')) {
    const requiredPackages = [
      '\\usepackage{amsmath,amssymb,amsfonts}',
      '\\usepackage{tabularx}',
      '\\usepackage{booktabs}',
      '\\usepackage{array}',
      '\\usepackage{xcolor}',
      '\\usepackage{tikz}',
      '\\usetikzlibrary{arrows.meta,positioning,shapes.geometric,calc,decorations.pathreplacing}',
      '\\usepackage{adjustbox}',
      '\\usepackage{enumitem}',
    ];

    for (const pkg of requiredPackages) {
      const pkgName = pkg.match(/\\usepackage(?:\[.*?\])?\{([^}]+)\}/)?.[1];
      if (pkgName && !out.includes(`{${pkgName}}`)) {
        out = out.replace(/\\begin\{document\}/i, `${pkg}\n\\begin{document}`);
      } else if (pkg.startsWith('\\usetikzlibrary') && !out.includes('\\usetikzlibrary')) {
        out = out.replace(/\\begin\{document\}/i, `${pkg}\n\\begin{document}`);
      }
    }
  }

  // 2. Isolate and center tabular/tabularx blocks in question body so they never inline inside paragraphs
  out = out.replace(/(\\begin\{tabular\}\s*\{([^}]+)\}[\s\S]*?\\end\{tabular\})/g, (match, tableBody) => {
    // Preserve the header SET box without breaking header tabularx
    if (tableBody.includes('\\textbf{SET}') || tableBody.includes('Seat No')) {
      return tableBody;
    }
    return `\n\\par\\vspace{1.5mm}\n{\\centering\\small\n${tableBody}\n\\par}\n\\vspace{1.5mm}\n`;
  });

  // Clean duplicate center wraps
  out = out.replace(/\\begin\{center\}\s*\\begin\{center\}/g, '\\begin{center}');
  out = out.replace(/\\end\{center\}\s*\\end\{center\}/g, '\\end{center}');

  // 3. Isolate and center tikzpicture blocks with responsive scaling
  out = out.replace(/(\\begin\{tikzpicture\}(?:\[[\s\S]*?\])?[\s\S]*?\\end\{tikzpicture\})/g, (match, tikzBody) => {
    let scaledTikz = tikzBody;
    if (!scaledTikz.includes('scale=')) {
      scaledTikz = scaledTikz.replace(/\\begin\{tikzpicture\}/, '\\begin{tikzpicture}[scale=0.88, every node/.style={transform shape}]');
    }
    return `\n\\par\\vspace{2mm}\n\\begin{center}\n${scaledTikz}\n\\end{center}\n\\vspace{2mm}\\par\n`;
  });

  // Clean duplicate center wraps for tikz
  out = out.replace(/\\begin\{center\}\s*\\begin\{center\}/g, '\\begin{center}');
  out = out.replace(/\\end\{center\}\s*\\end\{center\}/g, '\\end{center}');

  return out;
}

export function repairLatexErrors(latex: string, errorLog: string = ''): string {
  let healed = isolateAndFormatLatexTablesAndDiagrams(latex);

  // 1. Fix unescaped % outside of comments
  healed = healed.replace(/(?<!\\)%/g, '\\%');

  // 2. Fix unescaped & outside of tabular/matrix/tabularx/align
  if (errorLog.includes('Misplaced alignment tab character') || errorLog.includes('&')) {
    const lines = healed.split('\n');
    let insideTableOrMath = false;
    healed = lines.map(line => {
      if (line.includes('\\begin{tabular') || line.includes('\\begin{matrix') || line.includes('\\begin{align')) {
        insideTableOrMath = true;
      }
      if (line.includes('\\end{tabular') || line.includes('\\end{matrix') || line.includes('\\end{align')) {
        insideTableOrMath = false;
        return line;
      }
      if (!insideTableOrMath) {
        return line.replace(/(?<!\\)&/g, '\\&');
      }
      return line;
    }).join('\n');
  }

  // 3. Fix unescaped _ or #
  healed = healed.replace(/(?<!\\)_/g, '\\_');
  healed = healed.replace(/(?<!\\)#/g, '\\#');

  // 4. If TikZ is fatally broken in log, replace the broken tikzpicture with a clean schematic box
  if (errorLog.toLowerCase().includes('tikz') || errorLog.toLowerCase().includes('pgf') || errorLog.toLowerCase().includes('dimension too large')) {
    healed = healed.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, () => {
      return `\\begin{center}\\fbox{\\parbox{0.85\\linewidth}{\\centering \\textbf{[ SYSTEM ARCHITECTURE / SCHEMATIC DIAGRAM ]}\\\\\\vspace{2mm}{\\small Refer to question specification for schematic nodes and state transitions. }}}\\end{center}`;
    });
  }

  // 5. Ensure \\end{document} is present
  if (!healed.includes('\\end{document}')) {
    healed += '\n\\end{document}';
  }

  return healed;
}

export function sanitizeLatexSource(rawLatex: string): string {
  if (!rawLatex) return '';
  let clean = rawLatex.trim();
  // Strip markdown code fences if present
  clean = clean.replace(/^```(?:latex|tex)?\s*/i, '').replace(/```\s*$/i, '');
  // Fix model emitting \[[3pt] or \\[3pt] instead of spacing
  // `\\[3pt]` is valid LaTeX - a line break plus vertical space - and must
  // survive untouched. The rule that used to live here consumed one of its two
  // backslashes, leaving a dangling `\\par`; TeX then typeset the literal word
  // "par" in the middle of the paper header. Only a lone `\[3pt]` is a mistake.
  clean = clean.replace(/(?<!\\)\\\[\s*(\d+(?:pt|mm|cm|ex|in))\s*\]/g, '\n\\par\\vspace{$1}\n');
  // Fix accidental \\[ [Marks] or \\ [Marks]
  clean = clean.replace(/\\+\s*\[\s*(\d+)\s*(?:Marks?|marks?)?\s*\]/g, ' \\hfill [$1 Marks]');
  return clean;
}

export async function compileLatexUniversal(options: FormatexCompileOptions): Promise<FormatexCompileResult> {
  const { preferEngine = 'auto' } = options;
  const targetEngine = (options.engine === 'xelatex' || options.engine === 'lualatex') ? options.engine : 'pdflatex';
  options.latex = sanitizeLatexSource(options.latex);

  // Persist the exact document before any engine sees it.
  const source = saveLatexSource(options.latex, 'v1');
  const attempts: LatexEngineAttempt[] = [];
  const record = (engine: string, ok: boolean, ms: number, error?: string) => {
    attempts.push({ engine, command: ENGINE_COMMANDS[engine] || engine, ok, ms, error });
  };
  /** Attach the collected evidence to whatever this call returns. */
  const withDiagnostics = (
    result: FormatexCompileResult,
    engine: string
  ): FormatexCompileResult => ({
    ...result,
    diagnostics:
      result.diagnostics ||
      buildDiagnostics({ engine, attempts, source, log: result.log || result.error, error: result.error }),
  });

  if (preferEngine === 'formatex') {
    const r = await compileLatexWithFormatex(options);
    record('formatex', r.success, r.durationMs || 0, r.error);
    return withDiagnostics(r, 'formatex');
  }

  if (preferEngine === 'latexonline') {
    const r = await compileWithLatexOnline({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 35000,
    });
    record('latexonline', r.success, r.durationMs || 0, r.error);
    return withDiagnostics(r, 'latexonline');
  }

  if (preferEngine === 'clsi') {
    const r = await compileWithLocalClsi({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 60000,
      resources: options.resources,
    });
    record('clsi', r.success, r.durationMs || 0, r.error);
    return withDiagnostics(r, 'clsi');
  }

  if (preferEngine === 'texlive') {
    const r = await compileWithTexliveNet({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 45000,
    });
    record('texlive', r.success, r.durationMs || 0, r.error);
    return withDiagnostics(r, 'texlive');
  }

  if (preferEngine === 'texapi') {
    const r = await compileWithTexApi({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 60000,
    });
    record('texapi', r.success, r.durationMs || 0, r.error);
    return withDiagnostics(r, 'texapi');
  }

  // Auto tier 1: self-hosted engine. The only tier with no quota to exhaust.
  const tier1Start = Date.now();
  try {
    const local = await compileWithLocalClsi({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 60000,
      resources: options.resources,
    });
    if (local.success && local.pdfBuffer && local.pdfBuffer.length > 0) {
      console.log(`[PDF] Engine clsi produced the paper in ${Date.now() - tier1Start}ms`);
      record('clsi', true, Date.now() - tier1Start);
      return withDiagnostics(local, 'clsi');
    }
    console.warn(`[PDF] Engine clsi failed in ${Date.now() - tier1Start}ms: ${local.error}. Trying texapi...`);
    record('clsi', false, Date.now() - tier1Start, local.log || local.error);
  } catch (err: any) {
    console.warn(`[PDF] Engine clsi threw in ${Date.now() - tier1Start}ms: ${err.message}. Trying texapi...`);
    record('clsi', false, Date.now() - tier1Start, err.message);
  }

  // Auto tier 2: TexAPI Cloud (20 req/min; skipped when no key is configured)
  if (TEXAPI_API_KEY) {
    const tier2Start = Date.now();
    try {
      const texapi = await compileWithTexApi({
        latex: options.latex,
        command: targetEngine,
        timeoutMs: options.timeoutMs || 60000,
      });
      if (texapi.success && texapi.pdfBuffer && texapi.pdfBuffer.length > 0) {
        console.log(`[PDF] Engine texapi produced the paper in ${Date.now() - tier2Start}ms`);
        record('texapi', true, Date.now() - tier2Start);
        return withDiagnostics(texapi, 'texapi');
      }
      console.warn(`[PDF] Engine texapi failed in ${Date.now() - tier2Start}ms: ${texapi.error}. Trying latexonline...`);
      record('texapi', false, Date.now() - tier2Start, texapi.log || texapi.error);
    } catch (err: any) {
      console.warn(`[PDF] Engine texapi threw in ${Date.now() - tier2Start}ms: ${err.message}. Trying latexonline...`);
      record('texapi', false, Date.now() - tier2Start, err.message);
    }
  } else {
    console.warn('[PDF] Engine texapi skipped: TEXAPI_API_KEY is not configured.');
  }

  // Auto tier 3: free cloud compiler
  const tier3Start = Date.now();
  try {
    const online = await compileWithLatexOnline({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 30000,
    });

    if (online.success && online.pdfBuffer && online.pdfBuffer.length > 0) {
      console.log(`[PDF] Engine latexonline produced the paper in ${Date.now() - tier3Start}ms`);
      record('latexonline', true, Date.now() - tier3Start);
      return withDiagnostics(online, 'latexonline');
    }
    console.warn(`[PDF] Engine latexonline failed in ${Date.now() - tier3Start}ms: ${online.error}. Trying formatex...`);
    record('latexonline', false, Date.now() - tier3Start, online.log || online.error);
  } catch (err: any) {
    console.warn(`[PDF] Engine latexonline threw in ${Date.now() - tier3Start}ms: ${err.message}. Trying formatex...`);
    record('latexonline', false, Date.now() - tier3Start, err.message);
  }

  // Auto tier 3b: free TeXLive.net. Shares no infrastructure with
  // latexonline.cc, so the two free tiers fail independently and neither needs
  // a key or has a quota to exhaust.
  const tier3bStart = Date.now();
  try {
    const texlive = await compileWithTexliveNet({
      latex: options.latex,
      command: targetEngine,
      timeoutMs: options.timeoutMs || 45000,
    });
    if (texlive.success && texlive.pdfBuffer && texlive.pdfBuffer.length > 0) {
      console.log(`[PDF] Engine texlive.net produced the paper in ${Date.now() - tier3bStart}ms`);
      record('texlive', true, Date.now() - tier3bStart);
      return withDiagnostics(texlive, 'texlive');
    }
    console.warn(`[PDF] Engine texlive.net failed in ${Date.now() - tier3bStart}ms: ${texlive.error}. Trying formatex...`);
    record('texlive', false, Date.now() - tier3bStart, texlive.log || texlive.error);
  } catch (err: any) {
    console.warn(`[PDF] Engine texlive.net threw in ${Date.now() - tier3bStart}ms: ${err.message}. Trying formatex...`);
    record('texlive', false, Date.now() - tier3bStart, err.message);
  }

  // Auto tier 4: metered cloud API
  const tier4Start = Date.now();
  const formatexResult = await compileLatexWithFormatex(options);
  console.log(
    `[PDF] Engine formatex ${formatexResult.success ? 'produced the paper' : 'failed'} in ${Date.now() - tier4Start}ms`
  );
  record('formatex', formatexResult.success, Date.now() - tier4Start, formatexResult.log || formatexResult.error);
  return withDiagnostics(formatexResult, 'formatex');
}

/**
 * High-level helper: Generate complete LaTeX for exam, compile with Universal LaTeX engine (LaTeX.Online primary, FormaTeX fallback), and upload to Cloudinary & local cache
 */
export async function generateAndUploadFormatexPdf(params: {
  exam: any;
  setLetter: string;
  mcqs: any[];
  theorySec1?: any[];
  theorySec2?: any[];
  customLatex?: string;
  preferEngine?: 'clsi' | 'texapi' | 'latexonline' | 'texlive' | 'formatex' | 'auto';
}): Promise<{
  success: boolean;
  pdfUrl?: string;
  cloudinaryPublicId?: string;
  latex: string;
  sizeBytes?: number;
  checksumSha256?: string;
  compilerService?: string;
  error?: string;
}> {
  const { exam, setLetter, customLatex, preferEngine = 'auto' } = params;
  const latex = customLatex && customLatex.trim() ? customLatex : generateUniversityLatexDocument(params);

  const compilation = await compileLatexUniversal({
    latex,
    engine: 'pdflatex',
    smart: true,
    preferEngine,
  });

  if (!compilation.success || !compilation.pdfBuffer) {
    return {
      success: false,
      latex,
      error: compilation.error || 'Failed to compile PDF with LaTeX online engine',
    };
  }

  const pdfBuffer = compilation.pdfBuffer;
  const checksumSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const engineSuffix = preferEngine === 'latexonline' ? 'LaTeXOnline' : preferEngine === 'formatex' ? 'FormaTeX' : 'Official';
  const filename = `${exam.code || exam.paper_code || 'EXAM'}_Set_${setLetter}_${engineSuffix}.pdf`;

  // Save to local cache
  const localOutputDir = path.join(process.cwd(), 'public', 'compiled_papers');
  if (!fs.existsSync(localOutputDir)) {
    fs.mkdirSync(localOutputDir, { recursive: true });
  }
  const localFilePath = path.join(localOutputDir, filename);
  fs.writeFileSync(localFilePath, pdfBuffer);

  const localUrl = `/compiled_papers/${filename}`;
  let cloudinaryUrl = localUrl;
  let cloudinaryPublicId: string | undefined;

  // Upload to Cloudinary
  try {
    const uploadRes = await uploadDocumentToCloudinary(
      `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
      filename,
      'zeroleak/formatex-papers'
    );
    if (uploadRes?.secure_url) {
      cloudinaryUrl = uploadRes.secure_url;
      cloudinaryPublicId = uploadRes.public_id;
    }
  } catch (cErr) {
    console.warn('Could not upload PDF to Cloudinary, using local cache:', cErr);
  }

  return {
    success: true,
    pdfUrl: cloudinaryUrl,
    cloudinaryPublicId,
    latex,
    sizeBytes: pdfBuffer.length,
    checksumSha256,
    compilerService: compilation.compilerService || 'LaTeX.Online (Free)',
  };
}

export interface ValidatedLatexCompilationResult {
  success: boolean;
  pdfBuffer?: Buffer;
  latex: string;
  passCount: number;
  compilerService?: string;
  durationMs: number;
  error?: string;
  /** Which engines ran, what source they got, and the first real compiler error. */
  diagnostics?: LatexDiagnostics;
  /** Every pass's diagnostics, most recent last. */
  passDiagnostics?: LatexDiagnostics[];
}

/**
 * Merge the evidence from every pass into one report.
 *
 * A failure is usually only visible on one pass, so the caller gets the union:
 * every engine attempt in order, the first error seen anywhere, and the source
 * file of the pass whose error is being reported.
 */
function mergeDiagnostics(runs: LatexDiagnostics[]): LatexDiagnostics | undefined {
  if (runs.length === 0) return undefined;
  const attempts = runs.flatMap(run => run.attempts);
  const withError = runs.find(run => run.firstError);
  const last = runs[runs.length - 1];
  const blamed = withError || last;
  return {
    engine: blamed.engine,
    command: blamed.command,
    sourcePath: blamed.sourcePath,
    sourceLines: blamed.sourceLines,
    sourceBytes: blamed.sourceBytes,
    attempts,
    firstError: withError?.firstError,
    firstErrorLine: withError?.firstErrorLine,
    log: blamed.log,
  };
}

/** Keep the compiler's own output beside the source that produced it. */
function saveCompilerLog(sourcePath: string | undefined, log: string | undefined, label: string) {
  if (!sourcePath || !log) return;
  try {
    fs.writeFileSync(`${sourcePath}.${label}.log`, log, 'utf8');
  } catch {
    /* diagnostics are best effort */
  }
}

/**
 * Multi-pass backend verification & self-healing LaTeX compilation engine.
 * Pass 1: Isolates and formats all tables and TikZ diagrams with responsive layout constraints.
 * Pass 2: Inspects compilation errors (unescaped math/tabs/dimension limits) and automatically applies self-healing transforms.
 * Pass 3: Recompiles with structured standard template if AI raw syntax had structural corruption.
 */
/**
 * Print the failure as a compiler report rather than a shrug.
 *
 * The log carries the command, the source file, the first real error and its
 * line number, so the next reader does not have to reproduce the run to find
 * out what TeX objected to.
 */
function reportCompilerFailure(passName: string, result: FormatexCompileResult, runs: LatexDiagnostics[]) {
  const merged = mergeDiagnostics(runs);
  if (!merged) return;
  saveCompilerLog(merged.sourcePath, merged.log, passName.replace(/\s+/g, '-'));
  console.error(
    [
      '[PDF COMPILER]',
      `Pass: ${passName}`,
      `Compiler: ${merged.engine}`,
      `Command: ${merged.command}`,
      `Source: ${merged.sourcePath || '(not saved)'} (${merged.sourceLines || '?'} lines, ${merged.sourceBytes || '?'} bytes)`,
      `First error: ${merged.firstError || result.error || 'unknown'}`,
      `Line: ${merged.firstErrorLine ?? 'unknown'}`,
      'Engines tried:',
      ...merged.attempts.map(a => `  - ${a.engine}: ${a.ok ? 'ok' : 'failed'} in ${a.ms}ms${a.error ? ` - ${String(a.error).slice(0, 400)}` : ''}`),
      'Compiler output:',
      (merged.log || '(none)').slice(0, 4000),
    ].join('\n')
  );
}

export async function compileValidatedLatexWithSelfHealing(options: {
  latex: string;
  title?: string;
  structuredFallback?: any;
  preferEngine?: 'clsi' | 'texapi' | 'latexonline' | 'texlive' | 'formatex' | 'auto';
  timeoutMs?: number;
  /** Figure files the document references, for compilers that accept them. */
  resources?: LatexCompileResource[];
}): Promise<ValidatedLatexCompilationResult> {
  const startTime = Date.now();
  const { preferEngine = 'auto', timeoutMs = 60000 } = options;
  const passDiagnostics: LatexDiagnostics[] = [];

  // Pass 1: Layout Isolation & Normalization
  let currentLatex = isolateAndFormatLatexTablesAndDiagrams(options.latex);
  currentLatex = sanitizeLatexSource(currentLatex);

  console.log('[PDF] Compile pass 1 starting (layout isolation + normalization)...');
  let pass1Res = await compileLatexUniversal({
    latex: currentLatex,
    engine: 'pdflatex',
    smart: true,
    preferEngine,
    timeoutMs,
    resources: options.resources,
  });

  if (pass1Res.diagnostics) passDiagnostics.push(pass1Res.diagnostics);

  if (pass1Res.success && pass1Res.pdfBuffer && pass1Res.pdfBuffer.length > 0) {
    console.log(`[PDF] Compile pass 1 succeeded in ${Date.now() - startTime}ms via ${pass1Res.compilerService}`);
    return {
      success: true,
      pdfBuffer: pass1Res.pdfBuffer,
      latex: currentLatex,
      passCount: 1,
      compilerService: pass1Res.compilerService,
      durationMs: Date.now() - startTime,
      diagnostics: pass1Res.diagnostics,
      passDiagnostics,
    };
  }

  console.warn(`[PDF] Compile pass 1 failed after ${Date.now() - startTime}ms (${pass1Res.error}). Triggering pass 2 self-healing repair...`);
  reportCompilerFailure('pass 1', pass1Res, passDiagnostics);

  // Pass 2: Error-guided regex & structure healing
  const healedLatex = repairLatexErrors(currentLatex, pass1Res.error || pass1Res.log || '');
  let pass2Res = await compileLatexUniversal({
    latex: healedLatex,
    engine: 'pdflatex',
    smart: true,
    preferEngine,
    timeoutMs,
    resources: options.resources,
  });
  if (pass2Res.diagnostics) passDiagnostics.push(pass2Res.diagnostics);

  if (pass2Res.success && pass2Res.pdfBuffer && pass2Res.pdfBuffer.length > 0) {
    console.log(`[PDF] Compile pass 2 self-healing succeeded in ${Date.now() - startTime}ms via ${pass2Res.compilerService}`);
    return {
      success: true,
      pdfBuffer: pass2Res.pdfBuffer,
      latex: healedLatex,
      passCount: 2,
      compilerService: pass2Res.compilerService,
      durationMs: Date.now() - startTime,
      diagnostics: pass2Res.diagnostics,
      passDiagnostics,
    };
  }

  console.warn(`[PDF] Compile pass 2 failed after ${Date.now() - startTime}ms (${pass2Res.error}). Triggering pass 3 fallback template...`);
  reportCompilerFailure('pass 2', pass2Res, passDiagnostics);

  // Pass 3: Fallback using clean university template
  if (options.structuredFallback && options.structuredFallback.sections) {
    const rawStructureLatex = generateUniversityLatexDocument({
      exam: {
        university_name: options.structuredFallback.universityName,
        name: options.structuredFallback.examName,
        subject: options.structuredFallback.subject || options.title,
        paper_code: options.structuredFallback.paperCode,
        duration_minutes: 180,
        total_marks: options.structuredFallback.totalMarks || 70,
      },
      // The set letter belongs to the source paper; only fall back when the
      // structure carries none.
      setLetter: options.structuredFallback.setLetter || '4',
      // Hand over the whole pattern: the three-slot split dropped every section
      // past the third and capped the rest at five questions each.
      sections: options.structuredFallback.sections,
    });

    const pass3Latex = isolateAndFormatLatexTablesAndDiagrams(rawStructureLatex);
    let pass3Res = await compileLatexUniversal({
      latex: pass3Latex,
      engine: 'pdflatex',
      smart: true,
      preferEngine,
      timeoutMs,
      resources: options.resources,
    });
    if (pass3Res.diagnostics) passDiagnostics.push(pass3Res.diagnostics);

    if (pass3Res.success && pass3Res.pdfBuffer && pass3Res.pdfBuffer.length > 0) {
      console.log(`[PDF] Compile pass 3 succeeded in ${Date.now() - startTime}ms via ${pass3Res.compilerService}`);
      return {
        success: true,
        pdfBuffer: pass3Res.pdfBuffer,
        latex: pass3Latex,
        passCount: 3,
        compilerService: pass3Res.compilerService,
        durationMs: Date.now() - startTime,
        diagnostics: pass3Res.diagnostics,
        passDiagnostics,
      };
    }
    reportCompilerFailure('pass 3', pass3Res, passDiagnostics);
  }

  const merged = mergeDiagnostics(passDiagnostics);
  console.error(
    `[PDF] All 3 compile passes failed after ${Date.now() - startTime}ms. First error: ${merged?.firstError || pass2Res.error || pass1Res.error}`
  );
  return {
    success: false,
    latex: healedLatex || currentLatex,
    passCount: 3,
    durationMs: Date.now() - startTime,
    error: merged?.firstError || pass2Res.error || pass1Res.error || 'All LaTeX compilation passes failed.',
    diagnostics: merged,
    passDiagnostics,
  };
}


