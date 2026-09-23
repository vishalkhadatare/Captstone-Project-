// Minimal self-hosted LaTeX compile service.
//
// Node builtins only - no npm install, so the image stays small and there is
// no dependency supply chain to audit.
//
// Endpoints
//   GET  /health                        -> { status, compilers }
//   POST /compile                       -> { latex } => application/pdf
//   POST /project/:id/compile           -> CLSI-shaped JSON compile
//   GET  /project/:id/output/:file      -> compiled artifact
//   DELETE /project/:id                 -> drop a project's files
//
// Compiles are confined to a per-project temp dir and run with
// -no-shell-escape so a malicious .tex cannot shell out.

import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3013);
const HOST = process.env.HOST || '0.0.0.0';
const WORK_ROOT = process.env.WORK_ROOT || path.join(os.tmpdir(), 'latex-service');
const DEFAULT_TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS || 60000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);

const COMPILERS = {
  pdflatex: ['-pdf'],
  xelatex: ['-xelatex'],
  lualatex: ['-lualatex'],
  latexmk: ['-pdf'],
};

/** Read and JSON-parse a request body, refusing anything oversized. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function projectDir(projectId) {
  // Hash the id: it arrives from the network and must never shape a path.
  const safe = crypto.createHash('sha256').update(String(projectId)).digest('hex').slice(0, 32);
  return path.join(WORK_ROOT, safe);
}

/**
 * Write the resource set to disk and run the compiler.
 * Returns { ok, pdf, log, error }.
 */
async function compile({ dir, resources, rootResourcePath, compiler, timeoutMs }) {
  await fs.mkdir(dir, { recursive: true });

  // Clear stale output so a failed run cannot serve a previous PDF.
  for (const f of await fs.readdir(dir).catch(() => [])) {
    await fs.rm(path.join(dir, f), { recursive: true, force: true });
  }

  const written = [];
  for (const r of resources) {
    // Resolve inside dir and verify containment - defends against ../ in paths.
    const target = path.resolve(dir, r.path);
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      throw Object.assign(new Error(`Resource path escapes project dir: ${r.path}`), { status: 400 });
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, r.content ?? '', 'utf8');
    written.push(r.path);
  }

  const root = rootResourcePath || written[0];
  if (!root) throw Object.assign(new Error('No resources supplied'), { status: 400 });

  const engine = COMPILERS[compiler] ? compiler : 'pdflatex';
  const base = path.basename(root, path.extname(root));
  const args = [
    ...COMPILERS[engine],
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-no-shell-escape',
    `-output-directory=${dir}`,
    root,
  ];

  const started = Date.now();
  const run = await new Promise((resolve) => {
    // latexmk is a perl script; the others are direct binaries.
    const bin = engine === 'latexmk' ? 'latexmk' : engine;
    const child = spawn(bin, args, { cwd: dir, timeout: timeoutMs });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => resolve({ code: -1, out: out + '\n' + e.message }));
    child.on('close', (code) => resolve({ code, out }));
  });

  const durationMs = Date.now() - started;
  const pdfPath = path.join(dir, `${base}.pdf`);

  if (existsSync(pdfPath)) {
    return { ok: true, pdf: await fs.readFile(pdfPath), log: run.out, durationMs, engine };
  }
  return {
    ok: false,
    log: run.out,
    durationMs,
    engine,
    error: `Compilation produced no PDF (exit ${run.code}). See log.`,
  };
}

/** Convert a CLSI-style resource array, or fall back to a single-source request. */
function normalizeCompileRequest(body) {
  const compileReq = body.compile || body;

  if (Array.isArray(compileReq.resources) && compileReq.resources.length) {
    const resources = compileReq.resources
      .filter((r) => typeof r.content === 'string')
      .map((r) => ({ path: r.path || 'main.tex', content: r.content }));
    return {
      resources,
      rootResourcePath: compileReq.rootResourcePath || 'main.tex',
      compiler: compileReq.options?.compiler || compileReq.compiler || 'pdflatex',
      timeoutMs: (compileReq.options?.timeout
        ? compileReq.options.timeout * 1000
        : DEFAULT_TIMEOUT_MS),
    };
  }

  if (typeof body.latex === 'string' && body.latex.trim()) {
    return {
      resources: [{ path: 'main.tex', content: body.latex }],
      rootResourcePath: 'main.tex',
      compiler: body.compiler || 'pdflatex',
      timeoutMs: body.timeout ? body.timeout * 1000 : DEFAULT_TIMEOUT_MS,
    };
  }

  throw Object.assign(
    new Error('Provide either { latex } or { compile: { resources: [...] } }'),
    { status: 400 },
  );
}

function sendJson(res, status, payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': buf.length });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', compilers: Object.keys(COMPILERS) });
    }

    // Simple path: raw LaTeX in, PDF out.
    if (req.method === 'POST' && url.pathname === '/compile') {
      const body = await readBody(req);
      const opts = normalizeCompileRequest(body);
      const dir = projectDir(crypto.randomUUID());
      const result = await compile({ dir, ...opts });
      if (!result.ok) {
        return sendJson(res, 422, { status: 'error', error: result.error, log: result.log.slice(-4000) });
      }
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': result.pdf.length,
        'X-Compile-Ms': String(result.durationMs),
        'X-Engine': result.engine,
      });
      return res.end(result.pdf);
    }

    // CLSI-shaped: POST /project/:id/compile
    if (req.method === 'POST' && parts[0] === 'project' && parts[2] === 'compile') {
      const projectId = parts[1];
      const body = await readBody(req);
      const opts = normalizeCompileRequest(body);
      const dir = projectDir(projectId);
      const result = await compile({ dir, ...opts });

      const outputFiles = [];
      const logFiles = [];
      if (result.ok) {
        outputFiles.push({
          type: 'pdf',
          path: 'output.pdf',
          url: `/project/${projectId}/output/output.pdf`,
        });
      }
      for (const f of await fs.readdir(dir).catch(() => [])) {
        if (f.endsWith('.log')) {
          logFiles.push({ path: f, url: `/project/${projectId}/output/${f}` });
        }
      }

      return sendJson(res, result.ok ? 200 : 422, {
        status: result.ok ? 'success' : 'failure',
        compile: { engine: result.engine, durationMs: result.durationMs },
        outputFiles,
        logFiles,
        error: result.ok ? undefined : result.error,
        log: result.ok ? undefined : result.log.slice(-4000),
      });
    }

    // GET /project/:id/output/:file
    if (req.method === 'GET' && parts[0] === 'project' && parts[2] === 'output' && parts[3]) {
      const dir = projectDir(parts[1]);
      const name = path.basename(parts[3]);
      // The compile writes <root>.pdf; expose it under CLSI's fixed name too.
      let file = path.join(dir, name);
      if (!existsSync(file) && name === 'output.pdf') {
        const pdfs = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.pdf'));
        if (pdfs.length) file = path.join(dir, pdfs[0]);
      }
      if (!existsSync(file)) return sendJson(res, 404, { error: 'No such output file' });
      const buf = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': name.endsWith('.pdf') ? 'application/pdf' : 'text/plain; charset=utf-8',
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }

    if (req.method === 'DELETE' && parts[0] === 'project' && parts[1]) {
      await fs.rm(projectDir(parts[1]), { recursive: true, force: true });
      return sendJson(res, 200, { status: 'deleted' });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, err.status || 500, { error: err.message });
    } else {
      res.end();
    }
  }
});

await fs.mkdir(WORK_ROOT, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`[latex-service] listening on http://${HOST}:${PORT} (work root ${WORK_ROOT})`);
});
