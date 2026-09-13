// Generates public/favicon.svg from the existing ZeroLeak brand asset.
//
// No raster image libraries are available in this environment (no sharp/jimp/
// canvas/pngjs), so instead of re-encoding a cropped PNG we embed the real
// zeroleak-logo.png as a base64 data URI inside an SVG and use the SVG viewBox
// to "window" onto the left shield emblem of the 706x191 banner. The result is
// a crisp, scalable favicon built entirely from the existing logo asset.
//
// Run:  node scripts/make-favicon.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const logoPath = join(root, 'src', 'assets', 'zeroleak-logo.png');
const png = readFileSync(logoPath);

// Read intrinsic dimensions from the PNG IHDR chunk.
const imgW = png.readUInt32BE(16);
const imgH = png.readUInt32BE(20);
const b64 = png.toString('base64');

// The full banner is imgW x imgH (706 x 191). The shield emblem (checklist +
// AI head + lock, on its orbit) occupies roughly the left 250px. Frame that
// emblem in a centered square viewBox so the tab icon shows the shield mark,
// not the wide wordmark.
const CROP_W = 250;                 // right edge just before the "Zero" wordmark
const side = CROP_W;                // square side
const yOffset = (side - imgH) / 2;  // vertically center the emblem in the square

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 ${(-yOffset).toFixed(2)} ${side} ${side}">
  <rect x="0" y="${(-yOffset).toFixed(2)}" width="${side}" height="${side}" rx="40" fill="#ffffff"/>
  <image href="data:image/png;base64,${b64}" x="0" y="0" width="${imgW}" height="${imgH}"/>
</svg>
`;

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'favicon.svg');
writeFileSync(outPath, svg, 'utf8');

console.log(`Wrote ${outPath} (${svg.length} bytes) from ${imgW}x${imgH} logo, crop side ${side}.`);
