import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const pdfParse = (await import(pathToFileURL(join(process.cwd(), 'node_modules', 'pdf-parse', 'lib', 'pdf-parse.js')).href)).default;

function makePdf(lines) {
  const header = '%PDF-1.4\n';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let content = 'BT /F1 14 Tf 50 740 Td';
  lines.forEach((ln, i) => {
    const esc = String(ln).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    content += i === 0 ? ` (${esc}) Tj` : ` 0 -20 Td (${esc}) Tj`;
  });
  content += ' ET';
  objs.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  let body = header;
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return { buf: Buffer.from(body + xref + trailer, 'latin1'), offsets, xrefStart };
}

const { buf, offsets, xrefStart } = makePdf([
  'CERTIFICATE OF ACCREDITATION', 'National Board of Technical Examinations',
  'Registration / Institution ID: NBTE/2026/REG-9482', 'Recognized by UGC and AICTE.',
]);

// manual walk
const s = buf.toString('latin1');
const sx = s.lastIndexOf('startxref');
const declaredXrefStart = parseInt(s.slice(sx + 9).trim().split(/\s/)[0], 10);
console.log('declared startxref =', declaredXrefStart, ' computed xrefStart =', xrefStart);
console.log('bytes at declared startxref:', JSON.stringify(s.slice(declaredXrefStart, declaredXrefStart + 10)));
// parse entries from the xref block
const xrefBlock = s.slice(xrefStart);
console.log('--- xref block head ---');
console.log(JSON.stringify(xrefBlock.slice(0, 160)));
offsets.forEach((off, i) => {
  console.log(`entry obj${i + 1} says offset ${off} -> ${JSON.stringify(s.slice(off, off + 10))}`);
});

try {
  const r = await pdfParse(buf);
  console.log('PARSE OK ->', JSON.stringify((r.text || '').replace(/\s+/g, ' ').trim().slice(0, 90)));
} catch (e) {
  console.log('PARSE ERR', e.name, e.message, e.details || '');
}
