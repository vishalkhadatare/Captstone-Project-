import http from 'http';

const systemPrompt = `You are an expert academic examination designer and LaTeX typesetting engine.
Subject: "Operating Systems" | Institution: "AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD" | Paper Code: "SLR-FINAL-04" | Total Marks: 70 | Duration: 3 Hours

=== CORE MISSION: SYNTHESIZE THE COMPLETE EXAMINATION PAPER ===
You are given source question papers uploaded by the academic board. Extract their exact structural pattern and synthesize an authentic, non-leaked, publication-grade examination paper.

CRITICAL INSTRUCTION:
- Begin output IMMEDIATELY with the JSON object wrapped in \`\`\`json.
- Include all sections (Section I: MCQs, Section II: Long descriptive questions, Section III: Short notes) with complete questions, subquestions 4(a), 4(b), marks, and LaTeX tables/diagrams.

OUTPUT SPECIFICATION (VALID JSON ONLY):
\`\`\`json
{
  "universityName": "AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD",
  "examName": "B.TECH. / DIPLOMA SEMESTER EXAMINATION 2026",
  "subject": "Operating Systems",
  "paperCode": "SLR-FINAL-04",
  "totalMarks": 70,
  "duration": "3 Hours",
  "instructions": [
    "All questions are compulsory subject to internal choices.",
    "Figures to the right indicate full marks for each question.",
    "Neat diagrams must be drawn wherever necessary.",
    "Assume suitable data if necessary and state them clearly."
  ],
  "sections": [
    {
      "title": "SECTION - I (Objective and MCQs)",
      "totalMarks": "14 Marks",
      "instructions": "Q.1 Select and write the most appropriate alternative: (1 Mark each)",
      "questions": [
        {
          "number": "1",
          "text": "Which scheduling algorithm gives minimum average waiting time for a given set of processes?",
          "options": ["(A) FCFS", "(B) SJF", "(C) Round Robin", "(D) Priority"],
          "marks": "1"
        },
        {
          "number": "2",
          "text": "Banker algorithm is used for:",
          "options": ["(A) Deadlock prevention", "(B) Deadlock avoidance", "(C) Deadlock recovery", "(D) Deadlock detection"],
          "marks": "1"
        }
      ]
    },
    {
      "title": "SECTION - II (Descriptive Questions)",
      "totalMarks": "56 Marks",
      "instructions": "Answer the following questions:",
      "questions": [
        {
          "number": "Q.2(a)",
          "text": "Explain process state transition diagram with neat sketch.",
          "marks": "7"
        },
        {
          "number": "Q.2(b)",
          "text": "Consider the following page reference string: 1, 2, 3, 4, 2, 1, 5, 6, 2, 1, 2, 3, 7, 6, 3, 2, 1, 2, 3, 6. Calculate page faults using FIFO and LRU algorithms for 3 frames.",
          "marks": "7"
        }
      ]
    }
  ]
}
\`\`\`
`;

const userMsg = `Here are the source papers. Synthesize a complete final question paper covering CPU scheduling, Deadlocks, Memory Management, and File Systems. Start directly with \`\`\`json:`;

const data = JSON.stringify({
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg }
  ],
  model: 'meta/llama-3.2-11b-vision-instruct',
  temperature: 0.2,
  plainText: true
});

const req = http.request('http://localhost:3000/api/ai/ollama-chat-stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, res => {
  console.log('Stream HTTP status:', res.statusCode);
  let totalText = '';
  res.on('data', chunk => {
    const str = chunk.toString();
    const lines = str.split('\n');
    for (const l of lines) {
      if (l.startsWith('data: ')) {
        try {
          const payload = JSON.parse(l.slice(6));
          if (payload.delta) {
            totalText += payload.delta;
          }
          if (payload.done) {
            console.log('Stream Done! Total text length:', totalText.length);
            console.log('--- START PREVIEW ---');
            console.log(totalText.slice(0, 400));
            console.log('--- END PREVIEW ---');
            console.log(totalText.slice(-400));
          }
        } catch {}
      }
    }
  });
});

req.on('error', console.error);
req.write(data);
req.end();
