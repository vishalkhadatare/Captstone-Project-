# latex-service

Self-hosted LaTeX compilation for ZeroLeak. Replaces dependence on metered
third-party compilers.

## Why this exists

`server/formatex.ts` originally compiled via two cloud services:

1. `latexonline.cc` — free, no key, but a third-party dependency
2. FormaTeX Cloud — **metered: 15 compiles/month on the free tier**

That quota is easy to exhaust in normal use (it was already at 15/15 when this
was built), which left the pipeline with no working fallback.

Overleaf's [CLSI](https://github.com/overleaf/overleaf/tree/main/services/clsi)
is the obvious candidate, but it **cannot be run standalone**:

- `services/clsi/Dockerfile` no longer exists in the Overleaf repo — the README
  is stale. Building CLSI now means building the entire `server-ce` image.
- `services/clsi/package.json` depends on 9 `workspace:*` internal packages
  (`@overleaf/settings`, `@overleaf/logger`, `overleaf-editor-core`, …) that only
  resolve inside the Overleaf monorepo.

So this service borrows CLSI's *interface shape* without the monorepo. It is
~230 lines of Node builtins and adds no dependencies to your project.

## What it is

| | |
|---|---|
| Image size | ~988 MB (vs ~7 GB for general `texlive/texlive`) |
| Dependencies | Node builtins only — no `npm install`, no supply chain |
| Compile time | ~280 ms for a typical exam paper |
| Quota | none |

Only the TeX Live collections `server/formatex.ts` actually needs are installed:
`texlive-latex-base`, `-recommended`, `-extra`, `texlive-fonts-recommended`,
covering `geometry, amsmath, amssymb, amsfonts, enumitem, fancyhdr, booktabs,
tabularx, microtype, xcolor`.

## Run it

```sh
docker compose -f latex-service/docker-compose.yml up -d --build
curl http://127.0.0.1:3013/health
# {"status":"ok","compilers":["pdflatex","xelatex","lualatex","latexmk"]}
```

Or without compose:

```sh
docker build -t zeroleak/latex-service:latest latex-service/
docker run -d --name zeroleak-latex --restart unless-stopped \
  -p 127.0.0.1:3013:3013 zeroleak/latex-service:latest
```

Bound to `127.0.0.1` deliberately — this compiles untrusted input and must not
be reachable off-host.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness + available compilers |
| `POST` | `/compile` | `{ latex }` → `application/pdf` |
| `POST` | `/project/:id/compile` | CLSI-shaped; returns `outputFiles`/`logFiles` JSON |
| `GET` | `/project/:id/output/:file` | fetch a compiled artifact |
| `DELETE` | `/project/:id` | drop a project's working files |

```sh
curl -X POST http://127.0.0.1:3013/compile \
  -H 'Content-Type: application/json' \
  -d '{"latex":"\\documentclass{article}\\begin{document}Hi\\end{document}"}' \
  -o out.pdf
```

## Safety

- Compiles run as unprivileged uid 10001, never root.
- `-no-shell-escape` is passed, so a malicious `.tex` cannot shell out.
- `-halt-on-error` prevents interactive hangs.
- Resource paths are resolved and containment-checked, so `../` cannot escape
  the project directory.
- Project ids are SHA-256 hashed before touching the filesystem — a network-
  supplied id never shapes a path.
- Request bodies are capped at 8 MB (`MAX_BODY_BYTES`).

This is a *containment* boundary, not a hardened multi-tenant sandbox. It is
appropriate for compiling your own generated papers on your own host. If you
ever expose it to untrusted users, move it behind a queue and tighten the
container (`--read-only`, `--cap-drop=ALL`, memory/CPU limits).

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `3013` | listen port |
| `HOST` | `0.0.0.0` | bind address (container-internal) |
| `WORK_ROOT` | `/tmp/latex-service` | compile scratch dir |
| `COMPILE_TIMEOUT_MS` | `60000` | per-compile timeout |
| `MAX_BODY_BYTES` | `8388608` | request size cap |

The app talks to it via `LATEX_SERVICE_URL` (default `http://127.0.0.1:3013`).

## Integration

`server/formatex.ts` has a three-tier `compileLatexUniversal` chain:

1. **Self-hosted (this service)** — no quota
2. `latexonline.cc` — free cloud fallback
3. FormaTeX Cloud — metered last resort

Force a specific tier with `preferEngine: 'clsi' | 'latexonline' | 'formatex' | 'auto'`.
Check status at `GET /api/latex-service/health`.
