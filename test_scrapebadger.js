const https = require('https');

const options = {
  hostname: 'scrapebadger.com',
  path: '/v1/google/search?q=seo',
  method: 'GET',
  headers: {
    'X-API-Key': 'sb_live_FiRi4Mt8bQ5UkTJElLsO6Os4Ff8RYOMwxHrTfXHni98'
  }
};

const req = https.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error('ERROR:', error);
});

req.end();
