import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.NVIDIA_API_KEY;
console.log('NVIDIA API Key configured:', !!apiKey, apiKey ? apiKey.slice(0, 15) + '...' : '');

https.get('https://integrate.api.nvidia.com/v1/models', {
  headers: { 'Authorization': 'Bearer ' + apiKey }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const allModels = data.data.map((m: any) => m.id);
      const deepseekModels = allModels.filter((m: string) => m.toLowerCase().includes('deepseek'));
      console.log('\n--- DeepSeek Models in NVIDIA Catalog ---');
      console.log(deepseekModels);

      for (const m of deepseekModels) {
        await new Promise((resolve) => {
          const reqData = JSON.stringify({
            model: m,
            messages: [{ role: 'user', content: 'Generate a short exam question on Operating Systems' }],
            max_tokens: 60
          });
          const req = https.request('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + apiKey,
              'Content-Type': 'application/json'
            }
          }, r => {
            let rBody = '';
            r.on('data', chunk => rBody += chunk);
            r.on('end', () => {
              console.log(`\nModel: [${m}]`);
              console.log(`HTTP Status Code: ${r.statusCode}`);
              console.log(`Response Body: ${rBody.slice(0, 300)}`);
              resolve(true);
            });
          });
          req.on('error', e => {
            console.log(`\nModel: [${m}] -> Error: ${e.message}`);
            resolve(true);
          });
          req.write(reqData);
          req.end();
        });
      }

      // Also check AgentRouter gateway with deepseek model
      console.log('\n--- Checking AgentRouter Gateway for DeepSeek ---');
      const arKey = process.env.AGENTROUTER_API_KEY;
      if (arKey) {
        const arData = JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Say hello in 5 words' }],
          max_tokens: 30
        });
        const reqAr = https.request('https://agentrouter.org/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': arKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'claude-cli/0.2.0',
            'Content-Type': 'application/json'
          }
        }, r => {
          let rBody = '';
          r.on('data', c => rBody += c);
          r.on('end', () => {
            console.log(`AgentRouter Status: ${r.statusCode}`);
            console.log(`AgentRouter Body: ${rBody.slice(0, 200)}`);
          });
        });
        reqAr.on('error', e => console.log('AgentRouter error:', e.message));
        reqAr.write(arData);
        reqAr.end();
      }

    } catch (e: any) {
      console.error('Error parsing NVIDIA response:', e.message);
    }
  });
}).on('error', console.error);
