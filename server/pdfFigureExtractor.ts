import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';

import type { LatexCompileResource } from './formatex.ts';

/**
 * A figure lifted out of a source paper.
 *
 * The examiner's rule is that an existing diagram, table or chart is a fixed
 * visual asset: it must never be redrawn, approximated, replaced with ASCII or
 * described in prose. So it is cropped out of the uploaded PDF as pixels and
 * reused exactly as printed.
 */
export interface SourceFigure {
  /** 1-based number the model refers to as `[FIGURE:n]`. */
  index: number;
  name: string;
  url: string;
  page: number;
  kind: 'raster' | 'vector-region';
  width: number;
  height: number;
  base64: string;
}

export interface ExtractedSourceFigures {
  figures: SourceFigure[];
  warnings: string[];
  outputDir: string | null;
}

interface RawExtraction {
  success?: boolean;
  error?: string;
  totalPages?: number;
  figures?: Array<{
    name: string;
    path: string;
    page: number;
    kind: 'raster' | 'vector-region';
    width: number;
    height: number;
  }>;
  warnings?: string[];
}

function slugify(value: string): string {
  const slug = String(value || 'source-paper')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'source-paper';
}

/**
 * Extract the visual assets a paper already contains.
 *
 * The cropping itself happens in PyMuPDF (see `extractPdfFigures.py`) because
 * telling a diagram apart from text needs the raw vector paths. The crops are
 * published under `public/extracted_figures/` so the paper can reference them by
 * URL, and returned as base64 so they can ride alongside the `.tex` to a
 * compiler that accepts a multi-file project.
 */
export async function extractSourceFigures(
  fileBuffer: Buffer,
  fileName: string,
  options: { maxFigures?: number; dpi?: number } = {}
): Promise<ExtractedSourceFigures> {
  const maxFigures = options.maxFigures ?? 12;
  const dpi = options.dpi ?? 200;
  const warnings: string[] = [];
  const figures: SourceFigure[] = [];

  const scriptPath = path.join(process.cwd(), 'server', 'extractPdfFigures.py');
  if (!fs.existsSync(scriptPath)) {
    return { figures, warnings: ['The figure extractor script is missing from this installation.'], outputDir: null };
  }

  const workDir = path.join(os.tmpdir(), `zeroleak_figures_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const sourcePath = path.join(workDir, 'source.pdf');
  const cropDir = path.join(workDir, 'crops');

  let raw: RawExtraction;
  try {
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(cropDir, { recursive: true });
    fs.writeFileSync(sourcePath, fileBuffer);

    raw = await new Promise<RawExtraction>((resolve, reject) => {
      execFile(
        process.env.PYTHON_PATH || 'python',
        [scriptPath, sourcePath, cropDir, String(maxFigures), String(dpi)],
        { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          if (err && !stdout) return reject(new Error(stderr || err.message));
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error(`Could not read the figure extractor's output: ${stdout || stderr || err.message}`));
          }
        }
      );
    });
  } catch (err: any) {
    return {
      figures,
      warnings: [`Figures could not be extracted from "${fileName}": ${err?.message || err}`],
      outputDir: null,
    };
  }

  if (raw.error) {
    return { figures, warnings: [`Figures could not be extracted from "${fileName}": ${raw.error}`], outputDir: null };
  }
  warnings.push(...(raw.warnings || []));

  const publishedDir = path.join(
    process.cwd(),
    'public',
    'extracted_figures',
    `${slugify(fileName)}-${Date.now()}`
  );

  try {
    fs.mkdirSync(publishedDir, { recursive: true });
  } catch (err: any) {
    return {
      figures,
      warnings: [...warnings, `Extracted figures could not be published: ${err?.message || err}`],
      outputDir: null,
    };
  }

  const publicDirName = path.basename(publishedDir);
  for (const [i, crop] of (raw.figures || []).entries()) {
    try {
      const buffer = fs.readFileSync(crop.path);
      if (buffer.length === 0) {
        warnings.push(`Figure ${i + 1} came out empty and was skipped.`);
        continue;
      }
      // The number in the marker the model writes, the number in the file name
      // and the index shipped to the compiler are all assigned HERE, from one
      // counter. Deriving them separately is how a skipped crop would leave
      // [FIGURE:2] pointing at a file called figure-3.png.
      const index = figures.length + 1;
      const name = `figure-${index}.png`;
      fs.writeFileSync(path.join(publishedDir, name), buffer);
      figures.push({
        index,
        name,
        url: `/extracted_figures/${publicDirName}/${name}`,
        page: crop.page,
        kind: crop.kind,
        width: crop.width,
        height: crop.height,
        base64: buffer.toString('base64'),
      });
    } catch (err: any) {
      warnings.push(`Figure ${i + 1} could not be read: ${err?.message || err}`);
    }
  }

  return { figures, warnings, outputDir: figures.length > 0 ? publicDirName : null };
}

/**
 * Ship the source figures to the compiler under the names the LaTeX references.
 *
 * The names are already `figure-N.png`, which is exactly what
 * `renderSourceFigureLatex` emits, so the two cannot drift apart.
 */
export function sourceFiguresToResources(figures: SourceFigure[]): LatexCompileResource[] {
  return figures.map((figure) => ({
    path: figure.name,
    content: figure.base64,
    encoding: 'base64' as const,
  }));
}

/**
 * A published figure URL, and nothing else. The URL arrives from the browser, so
 * it is matched against this shape before being turned into a path: no `..`, no
 * absolute paths, no traversal out of the figures directory.
 */
const PUBLISHED_FIGURE_URL = /^\/extracted_figures\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+\.png)$/;

/**
 * Read the figures a paper referenced back off disk.
 *
 * The crops are already published under `public/extracted_figures`, so the
 * compiler route reads them by name rather than having the browser ship the same
 * bytes back up.
 */
export function readPublishedFigureResources(urls: unknown): {
  resources: LatexCompileResource[];
  warnings: string[];
} {
  const resources: LatexCompileResource[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(urls)) return { resources, warnings };

  for (const url of urls.slice(0, 24)) {
    const match = typeof url === 'string' ? url.match(PUBLISHED_FIGURE_URL) : null;
    if (!match) {
      if (url) warnings.push(`Ignored an unusable figure reference: ${String(url).slice(0, 80)}`);
      continue;
    }

    try {
      const filePath = path.join(process.cwd(), 'public', 'extracted_figures', match[1], match[2]);
      const buffer = fs.readFileSync(filePath);
      if (buffer.length === 0) {
        warnings.push(`Figure ${match[2]} is empty; it will print as a placeholder box.`);
        continue;
      }
      resources.push({ path: match[2], content: buffer.toString('base64'), encoding: 'base64' });
    } catch {
      warnings.push(`Figure ${match[2]} could not be read back; it will print as a placeholder box.`);
    }
  }

  return { resources, warnings };
}
