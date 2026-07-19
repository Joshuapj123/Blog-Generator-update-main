// Using global fetch

async function testBackend() {
  const url = 'http://localhost:8000/extract-seo-keywords';
  const apiKey = 'd0ecd9a145a80c01f95a113d9177fa77eddad820a3c63f6971bf8fb4bdbd944b';
  
  const payload = {
    plain_text: 'AI contract review software is very useful for legal teams. It helps in automated risk spotting and data extraction.',
    html_text: '<p>AI contract review software is very useful for legal teams. It helps in automated risk spotting and data extraction.</p>',
    supplementary_texts: ['contract review', 'legal software'],
    depth: 'deep',
    top_n: 10
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log('Success!', JSON.stringify(data, null, 2));
    } else {
      const text = await res.text();
      console.log(`Error: ${text}`);
    }
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

testBackend();
