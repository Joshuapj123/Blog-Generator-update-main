import fetch from 'node-fetch';

async function runE2E() {
  console.log('--- STARTING E2E TEST ON LOCALHOST:3000 FOR HUBSPOT ---');
  const targetUrl = 'http://localhost:3000/api/generate-from-url';

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.hubspot.com/',
      }),
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      process.exit(1);
    }

    console.log('✅ SSE Stream opened successfully. Reading chunks...');
    const body = response.body;
    if (!body) {
      console.error('❌ Empty response body.');
      process.exit(1);
    }

    let lastProgress = 0;
    body.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'status') {
              lastProgress = data.progress || lastProgress;
              console.log(`[Status] (${data.progress}%): ${data.message}`);
            } else if (data.type === 'outline') {
              console.log(`[Outline] Title: ${data.data.title}`);
            } else if (data.type === 'section') {
              console.log(`[Section] Generated section #${data.index}: ${data.data.heading}`);
            } else if (data.type === 'complete') {
              console.log('🎉 [Complete] Autopilot Generation finished successfully!');
              console.log('Final Article Blueprint Title:', data.data.title);
              console.log('Persisted Document ID:', data.data.id || 'N/A');
              console.log(`Final Progress Reached: ${lastProgress}%`);
              process.exit(0);
            } else if (data.type === 'error') {
              console.error(`❌ [Error] Received error chunk: ${data.message}`);
              process.exit(1);
            }
          } catch (e) {
            // Ignored if invalid json
          }
        }
      }
    });

    body.on('end', () => {
      console.log('--- Stream connection closed ---');
    });

  } catch (err: any) {
    console.error('❌ E2E Request failed:', err.message);
    process.exit(1);
  }
}

// Allow time for server to boot
setTimeout(runE2E, 2000);
