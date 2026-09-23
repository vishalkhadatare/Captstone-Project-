// Temporary: exercise the project's real LaTeX compile functions.
import { compileWithLatexOnline, compileLatexUniversal, getLatexOnlineHealth } from './server/formatex.ts';

const doc = `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath}
\\begin{document}
\\section*{ZeroLeak Baseline Test}
If $a+b+c=0$ for unit vectors, then $a\\cdot b+b\\cdot c+c\\cdot a = -\\tfrac{3}{2}$.
\\end{document}`;

const show = (label, r) => {
  console.log(`\n--- ${label} ---`);
  console.log('success :', r.success);
  console.log('error   :', r.error ?? '(none)');
  console.log('engine  :', r.engine ?? '(none)');
  console.log('service :', r.compilerService ?? '(none)');
  if (r.pdfBuffer) {
    const b = r.pdfBuffer;
    console.log('bytes   :', b.length, '| magic:', JSON.stringify(b.subarray(0, 5).toString('latin1')));
  }
};

try { console.log('health  :', JSON.stringify(await getLatexOnlineHealth())); }
catch (e) { console.log('health threw:', e.message); }

show('compileWithLatexOnline (direct)', await compileWithLatexOnline({ latex: doc, timeoutMs: 60000 }));
show('compileLatexUniversal (auto chain)', await compileLatexUniversal({ latex: doc, engine: 'pdflatex', preferEngine: 'auto' }));
