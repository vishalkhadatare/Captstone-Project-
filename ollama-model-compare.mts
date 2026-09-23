import 'dotenv/config';
import { ollamaStream } from './server/aiProviders.ts';

/**
 * Compares the current 7B vision model against a smaller text model on the SAME questions,
 * measuring both speed and correctness. Accuracy matters as much as speed here: these
 * answers get printed onto exam papers, so a faster model that is wrong more often is a
 * bad trade and the numbers should say so.
 *
 * Ground truth is asserted explicitly rather than eyeballed.
 */
const CANDIDATES = process.argv.slice(2).length ? process.argv.slice(2) : ['qwen2.5vl:7b', 'qwen2.5:3b'];
const NUM_CTX = 16384;

const SOLVER_SYSTEM_PROMPT = [
  'You are an exam answer assistant.',
  'You will be given ONE examination question at a time. Answer only that question.',
  'Be direct and concise: at most 90 words.',
  'For a multiple-choice question, state the correct option letter first, then one',
  'sentence of justification.',
  'Do not restate the question, do not write LaTeX documents, and do not use code fences.',
].join(' ');

// correct = the option letter that is actually right
const MCQS = [
  { stem: 'Which data structure uses FIFO order?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 'b' },
  { stem: 'Time complexity of binary search on a sorted array of n elements?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], correct: 'b' },
  { stem: 'Which OSI layer routes packets between networks?', options: ['Data link', 'Transport', 'Network', 'Session'], correct: 'c' },
  { stem: 'In SQL, which clause filters rows BEFORE grouping?', options: ['HAVING', 'WHERE', 'ORDER BY', 'GROUP BY'], correct: 'b' },
  { stem: 'Which normal form removes transitive dependencies?', options: ['1NF', '2NF', '3NF', 'BCNF'], correct: 'c' },
  { stem: 'Which CPU scheduling algorithm can cause starvation?', options: ['Round Robin', 'FCFS', 'Priority', 'Multilevel queue'], correct: 'c' },
  { stem: 'Threads within a process share which of the following?', options: ['Stack', 'Registers', 'Heap', 'Program counter'], correct: 'c' },
  { stem: 'Which traversal of a binary search tree yields sorted order?', options: ['Preorder', 'Inorder', 'Postorder', 'Level order'], correct: 'b' },
  { stem: 'Deadlock requires all of the following EXCEPT:', options: ['Mutual exclusion', 'Hold and wait', 'Preemption', 'Circular wait'], correct: 'c' },
  { stem: 'Which is a lossless image compression format?', options: ['JPEG', 'PNG', 'MP3', 'MPEG'], correct: 'b' },
];

/** Pulls the option letter out of a reply like "b) Queue\n\nThe queue ...". */
function extractLetter(text: string): string | null {
  const m = text.trim().match(/^\s*\(?([a-d])\)?[\s.):-]/i) || text.trim().match(/\b([a-d])\)/i);
  return m ? m[1].toLowerCase() : null;
}

async function warm(model: string) {
  try {
    await ollamaStream([{ role: 'user', content: 'hi' }], { model, max_tokens: 1, timeoutMs: 300_000 });
  } catch {
    /* warmup failure surfaces in the real run */
  }
}

for (const model of CANDIDATES) {
  console.log(`\n================ ${model} ================`);
  await warm(model);

  let correctCount = 0;
  let totalMs = 0;
  let genTokens = 0;
  const misses: string[] = [];

  for (let i = 0; i < MCQS.length; i++) {
    const q = MCQS[i];
    const options = q.options.map((o, k) => `${String.fromCharCode(97 + k)}) ${o}`).join('  ');
    const started = Date.now();
    let tokens = 0;
    let text = '';
    try {
      text = await ollamaStream(
        [
          { role: 'system', content: SOLVER_SYSTEM_PROMPT },
          { role: 'user', content: `Question ${i + 1} of ${MCQS.length} [MCQ]:\n${q.stem}\nOptions:\n${options}` },
        ],
        { model, temperature: 0, timeoutMs: 900_000 },
        { onToken: () => tokens++ }
      );
    } catch (e: any) {
      console.log(`  Q${i + 1}: FAILED ${e.message}`);
      continue;
    }
    const ms = Date.now() - started;
    totalMs += ms;
    genTokens += tokens;

    const got = extractLetter(text);
    const ok = got === q.correct;
    if (ok) correctCount++;
    else misses.push(`Q${i + 1}: said "${got}", correct "${q.correct}"`);

    console.log(
      `  Q${i + 1}: ${(ms / 1000).toFixed(1).padStart(5)}s  ${tokens.toString().padStart(3)}tok  ` +
        `answered ${got ?? '?'}  ${ok ? 'CORRECT' : `WRONG (correct: ${q.correct})`}`
    );
  }

  console.log(`  ---`);
  console.log(`  accuracy : ${correctCount}/${MCQS.length} (${((correctCount / MCQS.length) * 100).toFixed(0)}%)`);
  console.log(`  total    : ${(totalMs / 1000).toFixed(1)}s for ${MCQS.length} questions (${(totalMs / MCQS.length / 1000).toFixed(1)}s each)`);
  console.log(`  tokens   : ${genTokens} generated -> ${(genTokens / (totalMs / 1000)).toFixed(1)} tok/s`);
  if (misses.length) console.log(`  misses   : ${misses.join(' | ')}`);
}
