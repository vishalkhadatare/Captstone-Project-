/**
 * End-to-end security workflow smoke: Exam Controller uploads a question paper,
 * the extracted questions land in the Linguistic Translator's queue, the
 * translator translates them into multiple languages, and the approved
 * translations come back to the controller.
 *
 *   npx tsx tests/translation_flow_smoke.ts            # one pass, 2 languages
 *   npx tsx tests/translation_flow_smoke.ts --languages 3
 *
 * Every step asserts on the live server, so a regression in any hop (extraction,
 * bulk import, assignment, translator scoping, translation approval, controller
 * visibility) fails loudly instead of leaving an empty screen.
 */
import { getJson, loginAs, postJson, Session, TRANSLATOR_USER_ID } from './support/apiSession.js';

const SAMPLE_PAPER = `
NATIONAL BOARD OF TECHNICAL EXAMINATIONS
SUBJECT: APPLIED MATHEMATICS — SEMESTER V
Time Allowed: 3 Hours                                    Maximum Marks: 70

SECTION A — OBJECTIVE (1 mark each)

1. The degree of the differential equation (d2y/dx2)^3 + (dy/dx)^2 + y = 0 is
   (A) 1   (B) 2   (C) 3   (D) 6

2. The value of the Laplace transform of t^n for n > -1 is
   (A) n!/s^(n+1)   (B) s^n   (C) 1/s^n   (D) n/s

3. If the vectors i + j and i - j are orthogonal, their dot product equals
   (A) 0   (B) 1   (C) 2   (D) -2

4. The order of the matrix obtained by multiplying a 3x2 matrix with a 2x5 matrix is
   (A) 3x5   (B) 2x2   (C) 5x3   (D) 6x10

5. The Fourier series of an odd function contains only
   (A) sine terms   (B) cosine terms   (C) constant term   (D) both sine and cosine terms

SECTION B — SHORT ANSWER (5 marks each)

6. Solve the differential equation dy/dx + 2y = 4x and state the integrating factor used.

7. Determine the eigenvalues of the matrix [[2, 1], [1, 2]] and verify that the trace
   equals the sum of the eigenvalues.
`;

const LANGUAGES = ['Hindi', 'Marathi', 'Gujarati', 'Tamil'].slice(
  0,
  Math.max(1, Number(argValue('--languages') ?? 2)),
);

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const failures: string[] = [];
const notes: string[] = [];

function step(name: string, ok: boolean, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
  return ok;
}

function info(message: string) {
  console.log(`         ${message}`);
  notes.push(message);
}

/** 1. Exam controller uploads a paper and extracts questions. */
async function controllerUploadsPaper(manager: Session, runId: string) {
  console.log('\n1. Exam Controller uploads a question paper');
  const extract = await postJson<any>(
    '/api/question-papers/extract',
    {
      paper_text: SAMPLE_PAPER,
      file_name: `smoke-paper-${runId}.txt`,
      subject: 'Applied Mathematics',
      category: 'University Semester',
      job_id: `SMOKE-${runId}`,
    },
    manager,
  );
  step('POST /api/question-papers/extract', extract.ok, `HTTP ${extract.status}`);
  if (!extract.ok) {
    info(JSON.stringify(extract.json).slice(0, 300));
    return [] as any[];
  }

  const extracted = extract.json.extractedQuestions || [];
  step('paper produced extracted questions', extracted.length > 0, `${extracted.length} question(s)`);
  info(`engine: ${extract.json.engine || extract.json.aiEngine?.provider || 'n/a'} · summary: ${String(extract.json.extractionSummary || '').slice(0, 140)}`);

  const papers = await getJson<any>(`/api/question-papers`, manager);
  const stored = (papers.json?.papers || []).find((p: any) => p.original_filename === `smoke-paper-${runId}.txt`);
  step('uploaded paper is listed in /api/question-papers', Boolean(stored), stored ? `id ${stored.id}` : 'not found');

  if (!extracted.length) return [] as any[];

  // 2. Import those questions into the bank AND assign them to the translator.
  const bulk = await postJson<any>(
    '/api/questions/bulk-create',
    {
      questions: extracted.map((q: any) => ({ ...q, subject: 'Applied Mathematics' })),
      auto_assign_translator_id: TRANSLATOR_USER_ID,
      target_language: LANGUAGES[0],
      assignment_notes: `Smoke run ${runId}`,
    },
    manager,
  );
  step('POST /api/questions/bulk-create', bulk.ok, `HTTP ${bulk.status}`);
  if (!bulk.ok) {
    info(JSON.stringify(bulk.json).slice(0, 300));
    return [] as any[];
  }
  info(`created ${bulk.json.createdCount}, accepted ${bulk.json.acceptedCount}, quarantined ${bulk.json.quarantinedCount}`);
  if (bulk.json.quarantinedCount) {
    info(`first quarantine reason: ${bulk.json.quarantined?.[0]?.code} — ${bulk.json.quarantined?.[0]?.reason}`);
  }

  const assignments = await getJson<any>('/api/assignments?assignment_type=LINGUISTIC_TRANSLATION', manager);
  const mine = (assignments.json?.assignments || []).filter((a: any) => (bulk.json.questionIds || []).includes(a.question_id));
  step('assignments exist for the imported questions', mine.length > 0, `${mine.length} assignment(s)`);

  return mine;
}

/** 3. The translator sees exactly those questions. */
async function translatorSeesQueue(translator: Session, assignmentIds: string[]) {
  console.log('\n2. Translator queue');
  const pending = await getJson<any>('/api/translations/pending', translator);
  step('GET /api/translations/pending', pending.ok, `HTTP ${pending.status}`);
  const questions = pending.json?.questions || [];
  const visible = questions.filter((q: any) => assignmentIds.includes(q.id));
  step('uploaded questions are visible to the translator', visible.length > 0, `${visible.length} of ${assignmentIds.length} visible`);
  if (!visible.length && questions.length) info(`queue has ${questions.length} other question(s)`);
  const leaked = questions.some((q: any) => q.correct_answer !== undefined && q.correct_answer !== null);
  step('translator payload has no answer key (blind translation)', !leaked);
  return visible.length ? visible : questions;
}

/** 4. Translator translates and approves each target language. */
async function translatorTranslates(translator: Session, questions: any[]) {
  console.log('\n3. Translator translates into multiple languages');
  const approved: Array<{ question_id: string; language: string; translationId?: string }> = [];

  for (const language of LANGUAGES) {
    let saved = 0;
    for (const q of questions.slice(0, 3)) {
      // Ask the AI assistant first; fall back to a deterministic manual
      // translation so the flow is still verified when the model is offline.
      let translatedContent = '';
      let translatedOptions: string[] | null = null;
      let notesFor = `AI assisted ${language} translation`;
      const ai = await postJson<any>(
        '/api/translations/ai-translate',
        {
          content: q.content_text,
          options: q.options_json ? JSON.parse(q.options_json) : null,
          targetLanguage: language,
          subject: q.subject,
        },
        translator,
      );
      if (ai.ok && ai.json?.result?.translatedContent) {
        translatedContent = ai.json.result.translatedContent;
        translatedOptions = ai.json.result.translatedOptions || null;
        notesFor = ai.json.result.linguisticNotes || notesFor;
      } else {
        info(`AI translate unavailable (HTTP ${ai.status}); using manual path for ${language}`);
        translatedContent = `[${language}] ${q.content_text}`;
        translatedOptions = q.options_json ? JSON.parse(q.options_json).map((o: string) => `[${language}] ${o}`) : null;
        notesFor = `Manual override (Automated smoke): AI engine unavailable`;
      }

      const save = await postJson<any>(
        '/api/translations',
        {
          question_id: q.id,
          language,
          translated_content: translatedContent,
          translated_options: translatedOptions || undefined,
          status: 'APPROVED',
          translator_notes: notesFor,
        },
        translator,
      );
      if (save.ok) {
        saved += 1;
        approved.push({ question_id: q.id, language, translationId: save.json.translationId });
      } else {
        info(`save failed for ${q.id} (${language}): HTTP ${save.status} ${JSON.stringify(save.json).slice(0, 160)}`);
      }
    }
    step(`translator saved ${language} translations`, saved > 0, `${saved} approved`);
  }
  return approved;
}

/** 5. Controller sees the translations and completed assignments. */
async function controllerReceivesTranslations(manager: Session, approved: Array<{ question_id: string; language: string }>) {
  console.log('\n4. Exam Controller receives the translations');
  const all = await getJson<any>('/api/translations', manager);
  step('GET /api/translations as EXAM_MANAGER', all.ok, `HTTP ${all.status}`);
  const rows = all.json?.translations || [];
  const languagesSeen = new Set(rows.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.language));
  step(
    'approved translations are visible to the controller',
    approved.every(a => rows.some((t: any) => t.question_id === a.question_id && t.language === a.language && t.status === 'APPROVED')),
    `${rows.length} row(s), languages: ${[...languagesSeen].join(', ') || 'none'}`,
  );
  if (rows[0]) info(`sample: ${rows[0].language} · "${String(rows[0].translated_content).slice(0, 60)}"`);

  const assignments = await getJson<any>('/api/assignments', manager);
  const completed = (assignments.json?.assignments || []).filter((a: any) => a.status === 'COMPLETED');
  step('translation assignments marked COMPLETED for the controller', completed.length > 0, `${completed.length} completed`);

  const perQuestion = approved.length
    ? await getJson<any>(`/api/translations?question_id=${encodeURIComponent(approved[0].question_id)}`, manager)
    : { ok: false, status: 0, json: {} as any };
  step(
    'per-question multilingual lookup works',
    (perQuestion.json?.translations || []).length >= 1,
    `${(perQuestion.json?.translations || []).length} translation(s) for one question`,
  );
}

async function main() {
  const runId = `${Date.now().toString(36).toUpperCase()}`;
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
  console.log(`ZeroLeak upload → translate → return flow · ${baseUrl} · run ${runId}`);
  console.log(`target languages: ${LANGUAGES.join(', ')}`);

  const manager = await loginAs('EXAM_MANAGER');
  const translator = await loginAs('TRANSLATOR');
  console.log(`\nsessions: controller=${manager.how} translator=${translator.how}`);

  const assignments = await controllerUploadsPaper(manager, runId);
  if (!assignments.length) {
    console.log('\nNo assignments were created; stopping — the rest of the loop cannot be verified.');
    process.exit(1);
  }

  const questions = await translatorSeesQueue(translator, assignments.map((a: any) => a.question_id));
  if (!questions.length) {
    console.log('\nTranslator queue is empty; translations cannot proceed.');
    process.exit(1);
  }

  const approved = await translatorTranslates(translator, questions);
  await controllerReceivesTranslations(manager, approved);

  console.log(`\n${failures.length ? `${failures.length} FAILED step(s): ${failures.join(' | ')}` : 'All steps passed.'}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
