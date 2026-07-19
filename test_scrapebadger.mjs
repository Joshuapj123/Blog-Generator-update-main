import fetch from "node-fetch";

const url = "https://scrapebadger.com/v1/web/scrape";
const apiKey = "sb_live_FiRi4Mt8bQ5UkTJElLsO6Os4Ff8RYOMwxHrTfXHni98";

async function runFormat(format) {
  const req = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "url": "https://medium.com/swlh/i-tried-5-ai-image-editing-tools-heres-what-actually-worked-best-0515a62420fa",
      "format": format,
      "render_js": false,
      "anti_bot": true,
      "escalate": false
    }),
  });
  const data = await req.json();
  console.log(`Format: ${format}`);
  console.log(Object.keys(data));
  if (data.data) {
    console.log(data.data.substring(0, 100));
  }
}

await runFormat("html");
await runFormat("markdown");
