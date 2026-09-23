/**
 * Ingest-time quality gate for extracted questions.
 *
 * PDF text extraction returns whatever text sits on the page, so question
 * banks fill up with page headers, footers, document IDs and log lines. Those
 * rows are indistinguishable from real questions once stored, which is how a
 * generated paper ended up printing "248.216.238 10/10/2022 13:38:43
 * static-238" as a 10-mark question.
 *
 * This module decides whether a candidate row is plausibly a question BEFORE
 * it reaches the database. Rejects are quarantined with a reason rather than
 * dropped, so extraction quality stays auditable.
 */

export type QualityCode =
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'NO_LETTERS'
  | 'LOG_LINE'
  | 'PAGE_FURNITURE'
  | 'INSTRUCTION'
  | 'SUBJECT_MISMATCH';

export interface QualityVerdict {
  ok: boolean;
  code?: QualityCode;
  reason?: string;
}

const OK: QualityVerdict = { ok: true };
const reject = (code: QualityCode, reason: string): QualityVerdict => ({ ok: false, code, reason });

/** Minimum plausible length for a real question stem. */
const MIN_LENGTH = 12;

/**
 * Page furniture: document IDs and running headers/footers that repeat on
 * every page of a scanned university paper.
 */
const FURNITURE: Array<[RegExp, string]> = [
  [/\bCEGP\s*\d{4,}\b/i, 'document ID from the source PDF header'],
  [/\bSEAT\s*No\b/i, 'seat-number box from the source PDF header'],
  [/\bP\.\s*T\.\s*O\.?\b/i, 'P.T.O. page footer'],
  [/\bTotal\s+No\.?\s*of\s*Pages\b/i, 'page-count line from the source PDF'],
  [/\bReg(?:istration)?\s*No\.?\s*[:.]?\s*[A-Z0-9/-]{4,}\b/i, 'registration line from the source PDF'],
  [/^\s*Page\s+\d+\s*(?:of\s*\d+)?\s*$/i, 'page number line'],
];

/**
 * Boilerplate instructions that sit on a paper but are not themselves
 * questions. These previously received marks and inflated section totals.
 *
 * Written loosely on purpose: extraction output carries OCR typos (the live
 * bank contains "Figurs to the right side indicate full marks."), so anchors
 * match on the stable part of each phrase rather than exact spelling.
 */
const INSTRUCTIONS: RegExp[] = [
  /^neat\s+di\w*gram/i, // "diagrams" / "digrams" (OCR drops the 'a')
  /^fig\w*\s+to\s+the\s+right\b/i, // "Figures" / "Figurs" / "Fig."
  /\bindicate\s+full\s+marks\b/i,
  /\bmarks?\s+assigned\s+to\s+each\s+question\b/i,
  /^answer\s+(?:any\s+)?(?:four|five|two|three|six|all|q\s*\.?\s*\d)/i,
  /^attempt\s+any\b/i,
  /^assume\s+suitable\s+data\b/i,
  /^instructions?\b/i,
  /^use\s+of\s+programmable\s+calculators\b/i,
  /^all\s+questions\s+are\s+compulsory\b/i,
  /^max(?:imum)?\.?\s*marks\b/i,
  /^time\s*[:.]?\s*\d/i,
  /^duration\s*[:.]?\s*\d/i,
  /^day\s*(?:&|and)\s*date\b/i,
];

/** Application-log lines: IP/host fragment next to a date and/or timestamp. */
const LOG_LINE = /\b\d{1,3}(?:\.\d{1,3}){1,3}\b[\s\S]{0,60}\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
const LOG_TIMESTAMP = /\b\d{1,2}:\d{2}:\d{2}\b/;
const LOG_HOSTNAME = /\bstatic-\d+\b/i;

/**
 * Decide whether extracted text is plausibly a question.
 * Order matters: cheap structural checks first, content heuristics after.
 */
export function assessQuestionText(rawText: unknown): QualityVerdict {
  const text = String(rawText ?? '').replace(/\s+/g, ' ').trim();

  if (!text) return reject('EMPTY', 'no content text');

  // Strip question labels so prefix checks see the real stem. Loop until
  // stable: rows can carry stacked labels ("Q.4 d) Figures to the right..."),
  // and stripping only one leaves a prefix that defeats the ^ anchors below.
  let stem = text;
  for (let i = 0; i < 4; i++) {
    // Note the optional dot: labels appear as "Q4", "Q.4" and "Question 4".
    const next = stem.replace(/^\s*(?:q(?:uestion)?\s*\.?\s*\d+\s*[.):]?|\d+\s*[.)]|[a-d]\s*[.)])\s*/i, '').trim();
    if (next === stem) break;
    stem = next;
  }

  if (stem.length < MIN_LENGTH) {
    return reject('TOO_SHORT', `only ${stem.length} characters of content (minimum ${MIN_LENGTH})`);
  }

  const letters = (stem.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return reject('NO_LETTERS', 'no meaningful words');

  // A bare timestamp plus hostname is infrastructure output, not a question.
  if (LOG_LINE.test(stem) && (LOG_TIMESTAMP.test(stem) || LOG_HOSTNAME.test(stem))) {
    return reject('LOG_LINE', 'looks like an application log line (IP/timestamp/hostname)');
  }
  if (LOG_TIMESTAMP.test(stem) && LOG_HOSTNAME.test(stem)) {
    return reject('LOG_LINE', 'timestamp followed by hostname');
  }

  for (const [re, why] of FURNITURE) {
    if (re.test(stem)) return reject('PAGE_FURNITURE', `contains ${why}`);
  }

  for (const re of INSTRUCTIONS) {
    if (re.test(stem)) return reject('INSTRUCTION', 'boilerplate instruction, not a question');
  }

  return OK;
}

/**
 * Topic keywords for subjects where a mislabelled row has real consequences.
 * A row whose text is clearly about one domain must not be filed under an
 * unrelated subject - that is how a Software Testing paper asked about Bezier
 * curves and hidden-surface removal.
 */
const SUBJECT_TOPIC_GUARDS: Array<{ subject: RegExp; foreign: RegExp; note: string }> = [
  {
    subject: /software\s+testing|quality\s+assurance|software\s+engineering/i,
    // Stem terms use \w* rather than a trailing \b: "antialias" must also
    // catch "Antialiasing", which \bantialias\b silently misses.
    //
    // This list cannot be exhaustive - it is a safety net, not a classifier.
    // The durable fix is correct subject assignment at extraction time plus
    // quarantining the rows already mislabelled in the bank.
    foreign: new RegExp(
      [
        // computer graphics
        'bezier', 'warnock', 'z-?buffer', 'antialias\\w*', 'hidden\\s+surface',
        "painter'?s\\s+algorithm", 'shadow\\s+mask\\w*', 'raster\\s+scan\\w*',
        'crt\\s+monitors?', 'bresenham', 'dda\\s+line', 'polygon\\s+clip\\w*',
        'supersampling', 'pixel\\s+phasing', 'segmented\\s+display',
        'display\\s+processors?', 'cohen-?\\s*sutherland', 'line\\s+clip\\w*',
        'beam\\s+penetration', 'convex\\s+hull', 'depth\\s+sort',
        'visible\\s+surface', 'viewport\\s+coordinate', 'run\\s+length\\s+encod\\w*',
        'huffman\\s+cod\\w*', 'rasteri[sz]\\w*', 'rotation\\s+transformation',
        'homogenous\\s+coordinate', 'random\\s+scan\\s+display',
        // life sciences (seen misfiled under engineering subjects)
        'botany', 'zoology', 'photosynthesis', 'human\\s+anatomy', 'organic\\s+chemistry',
      ].join('|'),
      'i'
    ),
    note: 'computer-graphics content filed under a software-testing subject',
  },
  {
    subject: /software\s+testing|quality\s+assurance/i,
    foreign: /\b(?:botany|zoology|photosynthesis|human\s+anatomy|organic\s+chemistry)\b/i,
    note: 'life-science content filed under a software-testing subject',
  },
];

/** Check a question's text against its assigned subject. */
export function assessSubjectMatch(subject: unknown, contentText: unknown): QualityVerdict {
  const s = String(subject ?? '');
  const text = String(contentText ?? '');
  if (!s || !text) return OK;

  for (const guard of SUBJECT_TOPIC_GUARDS) {
    if (guard.subject.test(s) && guard.foreign.test(text)) {
      return reject('SUBJECT_MISMATCH', guard.note);
    }
  }
  return OK;
}

/**
 * Full gate for one candidate row. Returns the first failure found.
 */
export function assessExtractedQuestion(q: { content_text?: unknown; subject?: unknown }): QualityVerdict {
  const textVerdict = assessQuestionText(q?.content_text);
  if (!textVerdict.ok) return textVerdict;
  return assessSubjectMatch(q?.subject, q?.content_text);
}
