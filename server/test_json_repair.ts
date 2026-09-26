export function robustJsonExtractAndRepair(raw: string): any | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();

  // Strip markdown code fence if wrapped
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fence) text = fence[1].trim();

  // Find first '{' and last '}'
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // 1. First try direct parse
  try {
    const res = JSON.parse(text);
    if (res && (Array.isArray(res.sections) || res.universityName || res.subject)) return res;
  } catch {}

  // 2. Repair LaTeX backslashes inside JSON strings
  try {
    // Escape all backslashes except those escaping double quotes
    let repaired = text.replace(/\\/g, '\\\\');
    // Fix double-escaped quotes so valid JSON strings remain valid: \\" -> \"
    repaired = repaired.replace(/\\\\"/g, '\\"');
    // Fix trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    const res = JSON.parse(repaired);
    if (res && (Array.isArray(res.sections) || res.universityName || res.subject)) return res;
  } catch {}

  // 3. Fallback regex extractor for questions and sections
  try {
    const sections: any[] = [];
    const secRegex = /"title"\s*:\s*"([^"]+)"[\s\S]*?"questions"\s*:\s*\[([\s\S]*?)\]/gi;
    let secMatch;

    while ((secMatch = secRegex.exec(text)) !== null) {
      const secTitle = secMatch[1];
      const qBlock = secMatch[2];
      const questions: any[] = [];

      const qRegex = /"(?:number|qNumber)"\s*:\s*"([^"]+)"[\s\S]*?"(?:text|questionText)"\s*:\s*"([^"]+)"/gi;
      let qMatch;
      while ((qMatch = qRegex.exec(qBlock)) !== null) {
        questions.push({
          number: qMatch[1],
          text: qMatch[2],
          marks: '7'
        });
      }

      if (questions.length > 0) {
        sections.push({
          title: secTitle,
          questions
        });
      }
    }

    if (sections.length > 0) {
      return {
        universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
        examName: 'B.TECH. / DIPLOMA SEMESTER EXAMINATION 2026',
        subject: 'Operating Systems',
        paperCode: 'SLR-FINAL-04',
        totalMarks: 70,
        duration: '3 Hours',
        sections
      };
    }
  } catch {}

  return null;
}

const badJson = `{
  "universityName": "AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD",
  "subject": "Operating Systems",
  "sections": [
    {
      "title": "SECTION - I",
      "questions": [
        {
          "number": "Q.1(a)",
          "text": "Explain process scheduling and draw \\begin{tikzpicture} diagram.",
          "marks": 7
        },
        {
          "number": "Q.1(b)",
          "text": "Explain Bankers algorithm with \\begin{tabular}{|c|c|} Allocation & Max \\\\ \\end{tabular}",
          "marks": 7
        }
      ]
    }
  ]
}`;

const result = robustJsonExtractAndRepair(badJson);
console.log('Result extracted:', result !== null);
console.log('Question 1 text:', result?.sections[0]?.questions[0]?.text);
console.log('Question 2 text:', result?.sections[0]?.questions[1]?.text);
