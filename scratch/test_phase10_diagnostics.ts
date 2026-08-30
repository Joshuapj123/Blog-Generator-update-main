// scratch/test_phase10_diagnostics.ts
import { POST as extractPOST } from '../src/app/api/extract/route';
import { POST as planPOST } from '../src/app/api/generate-plan/route';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function readStream(response: Response): Promise<{ events: any[], text: string }> {
  const events: any[] = [];
  let text = '';
  if (!response.body) return { events, text };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const ev = JSON.parse(line.slice(6));
          events.push(ev);
        } catch (e) {}
      }
    }
  }
  return { events, text: buffer };
}

async function runDiagnostics() {
  console.log("=== STARTING PHASE 10 DIAGNOSTIC SUITE ===");

  // --- Test A: Simple stable URL completes ---
  console.log("\nTest A: Testing simple static URL...");
  const reqA = new Request('http://localhost/api/extract', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com/' })
  });
  const resA = await extractPOST(reqA);
  await assert(resA.status === 200, "Extract status should be 200");
  const dataA = await readStream(resA);
  await assert(dataA.events.some(e => e.type === 'done'), "Should emit 'done' event");
  console.log("   PASSED");

  // --- Test B: https://ai.google/ completes or fails gracefully ---
  console.log("\nTest B: Testing https://ai.google/...");
  const reqB = new Request('http://localhost/api/extract', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://ai.google/' })
  });
  const resB = await extractPOST(reqB);
  const dataB = await readStream(resB);
  await assert(
    dataB.events.some(e => e.type === 'done') || dataB.events.some(e => e.type === 'error'),
    "Should complete or fail gracefully"
  );
  console.log("   PASSED");

  // --- Test C: Invalid URL fails gracefully ---
  console.log("\nTest C: Testing invalid URL...");
  const reqC = new Request('http://localhost/api/extract', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://invalid-domain-name-that-does-not-exist.xyz/' })
  });
  const resC = await extractPOST(reqC);
  const dataC = await readStream(resC);
  await assert(dataC.events.some(e => e.type === 'error'), "Should emit error event for invalid URL");
  console.log("   PASSED");

  // --- Test D: Navigation timeout produces structured stage failure ---
  console.log("\nTest D: Testing navigation timeout...");
  // Pass an IP address that drops packets to cause a forced connection timeout
  const reqD = new Request('http://localhost/api/extract', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://10.255.255.1/' })
  });
  const resD = await extractPOST(reqD);
  const dataD = await readStream(resD);
  await assert(dataD.events.some(e => e.type === 'error'), "Timeout should produce error event");
  console.log("   PASSED");

  // --- Test I/J/K: Provider failures don't hang ---
  console.log("\nTest I: Testing SERP/LLM/Orchestrator failure safety...");
  const orchestrator = new AgentOrchestrator({
    llm: {
      generate: async () => { throw new Error("LLM failure"); },
      structuredGenerate: async () => { throw new Error("LLM failure"); }
    } as any,
    search: {
      search: async () => { throw new Error("Search failure"); }
    } as any,
    scraper: {
      scrape: async () => { throw new Error("Scrape failure"); }
    } as any,
    budget: {}
  });

  const runRes = await orchestrator.run({
    saasProfile: {
      name: "TestSaaS",
      description: "CRM",
      targetAudience: "Sales agents",
      keyFeatures: [],
      primaryCompetitors: [],
      website: "https://test.com",
      tone: "professional",
      customInsights: ""
    },
    targetKeyword: "crm",
    targetAudience: "Sales agents"
  });
  // Should not throw, but report errors array
  await assert(runRes.success === false, "Should report unsuccessful run");
  await assert(runRes.errors.length > 0, "Should record error log");
  console.log("   PASSED");

  console.log("\n🎉 ALL PHASE 10 DIAGNOSTIC TESTS PASSED SUCCESSFULLY!");
}

runDiagnostics().catch(err => {
  console.error("Diagnostic suite failed:", err);
  process.exit(1);
});
