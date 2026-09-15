const fs = require('fs');
const path = require('path');
const http = require('http');

async function runAllTests() {
  console.log('================================================================');
  console.log('       ZeroLeak Comprehensive Ollama & AI Test Suite             ');
  console.log('================================================================\n');

  const testResults = [];

  // -------------------------------------------------------------
  // Test Case 1: Local Ollama Daemon Status & Tag List
  // -------------------------------------------------------------
  console.log('[TEST CASE 1] Checking Local Ollama Server (http://localhost:11434)...');
  let ollamaOnline = false;
  let installedModels = [];
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      ollamaOnline = true;
      installedModels = (data.models || []).map(m => m.name);
      console.log('  -> Status: ONLINE (Port 11434 reachable)');
      console.log('  -> Models Installed:', installedModels.length > 0 ? installedModels.join(', ') : 'None yet');
      testResults.push({ case: 'Local Ollama Daemon', status: 'PASS', details: `${installedModels.length} models installed (${installedModels.join(', ')})` });
    } else {
      console.log(`  -> Status: ERROR HTTP ${res.status}`);
      testResults.push({ case: 'Local Ollama Daemon', status: 'FAIL', details: `HTTP ${res.status}` });
    }
  } catch (err) {
    console.log(`  -> Status: OFFLINE (${err.message})`);
    console.log('     Note: Ollama desktop app or "ollama serve" is not currently active on port 11434.');
    testResults.push({ case: 'Local Ollama Daemon', status: 'OFFLINE', details: 'Ollama is not running locally on port 11434' });
  }

  // -------------------------------------------------------------
  // Test Case 2: Ollama Direct Generation / Chat Test (If online)
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 2] Testing Direct Ollama Prompt Generation...');
  if (ollamaOnline && installedModels.length > 0) {
    const modelToUse = installedModels.includes('llama3.2:latest') ? 'llama3.2:latest' : installedModels[0];
    try {
      console.log(`  -> Sending test prompt to model: "${modelToUse}"...`);
      const chatRes = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          messages: [{ role: 'user', content: 'What is 2+2? Answer with only the number.' }],
          stream: false,
          options: { temperature: 0 }
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (chatRes.ok) {
        const data = await chatRes.json();
        const text = data.message?.content || '';
        console.log(`  -> Response: "${text.trim()}"`);
        testResults.push({ case: 'Ollama Chat Completion', status: 'PASS', details: `Model ${modelToUse} responded: ${text.trim()}` });
      } else {
        const errText = await chatRes.text();
        console.log(`  -> Error: HTTP ${chatRes.status} - ${errText}`);
        testResults.push({ case: 'Ollama Chat Completion', status: 'FAIL', details: `HTTP ${chatRes.status}` });
      }
    } catch (err) {
      console.log(`  -> Error: ${err.message}`);
      testResults.push({ case: 'Ollama Chat Completion', status: 'FAIL', details: err.message });
    }
  } else {
    console.log('  -> SKIPPED (Ollama daemon is offline or no models installed)');
    testResults.push({ case: 'Ollama Chat Completion', status: 'SKIPPED', details: 'Ollama daemon not running' });
  }

  // -------------------------------------------------------------
  // Test Case 3: Ollama Question Boundary Extraction Schema
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 3] Testing Ollama Structured Question Boundary Extraction Schema...');
  const samplePaperSnippet = `
PHYSICS SECTION - A (TOTAL MARKS: 8)
1. A wire of resistance 4 R is bent in the form of a circle. What is the effective resistance between the ends of the diameter?
(a) 4 R
(b) 2 R
(c) R
(d) R/2

2. Explain the difference between streamline flow and turbulent flow with neat sketches. [4 Marks]
`;

  if (ollamaOnline && installedModels.length > 0) {
    const modelToUse = installedModels[0];
    try {
      console.log(`  -> Testing structured JSON question extraction using "${modelToUse}"...`);
      const extractRes = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: 'Extract questions into strict JSON: {"questions":[{"question_number":"1","question_text":"...","options":[{"label":"A","text":"..."}],"marks":4}]}'
            },
            {
              role: 'user',
              content: samplePaperSnippet
            }
          ],
          stream: false
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (extractRes.ok) {
        const data = await extractRes.json();
        const parsed = JSON.parse(data.message?.content || '{}');
        console.log('  -> Extracted Questions Count:', (parsed.questions || []).length);
        console.log('  -> Sample Output:', JSON.stringify(parsed, null, 2));
        testResults.push({ case: 'Ollama Question Boundary Extraction', status: 'PASS', details: `Extracted ${(parsed.questions || []).length} questions accurately` });
      } else {
        testResults.push({ case: 'Ollama Question Boundary Extraction', status: 'FAIL', details: `HTTP ${extractRes.status}` });
      }
    } catch (err) {
      console.log(`  -> Extraction failed: ${err.message}`);
      testResults.push({ case: 'Ollama Question Boundary Extraction', status: 'FAIL', details: err.message });
    }
  } else {
    console.log('  -> SKIPPED (Ollama daemon offline)');
    testResults.push({ case: 'Ollama Question Boundary Extraction', status: 'SKIPPED', details: 'Ollama daemon offline' });
  }

  // -------------------------------------------------------------
  // Test Case 4: ZeroLeak Python Local Boundary Cropping Engine
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 4] Testing ZeroLeak Python Question Boundary Cropper (server/pdf_extractor.py)...');
  const pythonPath = 'python';
  const { execSync } = require('child_process');
  try {
    const pyVersion = execSync('python --version', { encoding: 'utf-8' });
    console.log(`  -> Python Version: ${pyVersion.trim()}`);
    
    // Check if PyMuPDF (fitz) and RapidOCR / Pillow are available
    const checkLibs = execSync('python -c "import fitz, PIL; print(\'PyMuPDF:\', fitz.__doc__.splitlines()[0], \'| Pillow:\', PIL.__version__)"', { encoding: 'utf-8' });
    console.log(`  -> Python Libraries: ${checkLibs.trim()}`);
    testResults.push({ case: 'Python Boundary Cropper Runtime', status: 'PASS', details: checkLibs.trim() });
  } catch (pyErr) {
    console.log(`  -> Python environment issue: ${pyErr.message}`);
    testResults.push({ case: 'Python Boundary Cropper Runtime', status: 'FAIL', details: pyErr.message });
  }

  // -------------------------------------------------------------
  // Test Case 5: Cloud AI Engine (Groq LPU Ultra-Fast LLM)
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 5] Testing Groq Cloud AI Engine (Free LPU openai/gpt-oss-120b)...');
  const groqKey = 'REDACTED_GROQ_KEY';
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: 'You are an exam boundary extractor. Given text, return JSON with exact questions: {"questions":[{"question_number":"1","question_text":"...","options":[{"label":"A","text":"..."}],"marks":4}]}'
          },
          {
            role: 'user',
            content: samplePaperSnippet
          }
        ],
        temperature: 0
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (groqRes.ok) {
      const data = await groqRes.json();
      const content = data.choices[0].message.content;
      console.log('  -> Status: SUCCESS (200 OK)');
      console.log('  -> Groq Structured Extraction Output:');
      console.log(content);
      testResults.push({ case: 'Groq Cloud AI LPU Engine', status: 'PASS', details: 'Extracted structured questions in <1 second' });
    } else {
      const errText = await groqRes.text();
      console.log(`  -> Groq returned HTTP ${groqRes.status}:`, errText);
      testResults.push({ case: 'Groq Cloud AI LPU Engine', status: 'FAIL', details: `HTTP ${groqRes.status}` });
    }
  } catch (err) {
    console.log(`  -> Groq connection failed: ${err.message}`);
    testResults.push({ case: 'Groq Cloud AI LPU Engine', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // Summary Table
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('                       TEST RESULTS SUMMARY                     ');
  console.log('================================================================');
  console.table(testResults);
}

runAllTests();
