/**
 * Phase R7.4.2: Adversarial CRLF Framing & Streaming Regression Test Suite
 *
 * Exercises the production `consumePipelineStream` directly from:
 * `src/app/(main)/engine/hooks/useGenerationPipeline.ts`
 *
 * Scenarios:
 *  1. One complete LF-framed event (\n\n)
 *  2. One complete CRLF-framed event (\r\n\r\n)
 *  3. CRLF delimiter split between network chunks (\r in chunk 1, \n\r\n in chunk 2, etc.)
 *  4. Multiple CRLF events in one chunk
 *  5. Mixed LF and CRLF events across stream
 *  6. A CRLF-framed `complete` event transitions pipeline to completion
 *  7. A CRLF-framed `error` event transitions pipeline to failure
 *  8. A final event without a trailing delimiter (EOF unclosed)
 *  9. UTF-8 multibyte characters (4-byte emoji 🚀) split across chunk byte boundaries
 * 10. Heartbeat comments using CRLF (: ping\r\n\r\n) cleanly ignored
 * 11. Incomplete JSON chunk retained across read calls until frame delimiter completes
 * 12. Inactivity watchdog behavior remains intact with timer reset and abort
 */

import { consumePipelineStream } from '../src/app/(main)/engine/hooks/useGenerationPipeline';

interface MockEngineState {
  isRunning: boolean;
  genStatus: string;
  genProgress: number;
  genError: string | null;
  blueprint: any;
  sections: any[];
  isGenerated: boolean;
  activeQaTab: string;
}

function createMockEngine(): { engine: any; state: MockEngineState } {
  const state: MockEngineState = {
    isRunning: true,
    genStatus: 'Initializing',
    genProgress: 5,
    genError: null,
    blueprint: null,
    sections: [],
    isGenerated: false,
    activeQaTab: 'editor',
  };

  const engine = {
    get isRunning() { return state.isRunning; },
    get genStatus() { return state.genStatus; },
    get genProgress() { return state.genProgress; },
    get genError() { return state.genError; },
    setIsRunning: (v: boolean) => { state.isRunning = v; },
    setGenStatus: (s: string) => { state.genStatus = s; },
    setGenProgress: (p: number) => { state.genProgress = p; },
    setGenError: (e: string | null) => { state.genError = e; },
    setBlueprint: (b: any) => { state.blueprint = b; },
    setSections: (s: any) => { state.sections = s; },
    setIsGenerated: (g: boolean) => { state.isGenerated = g; },
    setActiveQaTab: (t: string) => { state.activeQaTab = t; },
    setTitle: () => {},
    setCurrentArticleId: () => {},
    setCurrentArticleStage: () => {},
  };

  return { engine, state };
}

function createByteStreamResponse(chunks: Uint8Array[], status = 200): Response {
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function createStringStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const byteChunks = chunks.map((c) => encoder.encode(c));
  return createByteStreamResponse(byteChunks, status);
}

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    passedTests++;
    console.log(`  ✅ ${msg}`);
  }
}

async function runAdversarialParserTests() {
  console.log('========================================================================');
  console.log(' Phase R7.4.2: Adversarial CRLF & Stream Framing Regression Suite');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 1: One complete LF-framed event (\n\n)
  // --------------------------------------------------------------------------
  console.log('Scenario 1: One complete LF-framed event (\\n\\n)');
  {
    const { engine, state } = createMockEngine();
    const controller = new AbortController();
    const events: any[] = [];

    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"LF Event","progress":10}\n\n',
      'data: {"type":"complete","data":{}}\n\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller,
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (chunk) => events.push(chunk),
    });

    assert(events.length === 2, 'Scenario 1: Received exactly 2 events');
    assert(events[0].type === 'status' && events[0].message === 'LF Event', 'Scenario 1: First event is LF status');
    assert(events[1].type === 'complete', 'Scenario 1: Second event is complete');
    assert(state.isRunning === false, 'Scenario 1: isRunning transitioned to false');
  }

  // --------------------------------------------------------------------------
  // Scenario 2: One complete CRLF-framed event (\r\n\r\n)
  // --------------------------------------------------------------------------
  console.log('\nScenario 2: One complete CRLF-framed event (\\r\\n\\r\\n)');
  {
    const { engine, state } = createMockEngine();
    const controller = new AbortController();
    const events: any[] = [];

    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"CRLF Event","progress":15}\r\n\r\n',
      'data: {"type":"complete","data":{}}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller,
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (chunk) => events.push(chunk),
    });

    assert(events.length === 2, 'Scenario 2: Received exactly 2 events');
    assert(events[0].type === 'status' && events[0].message === 'CRLF Event', 'Scenario 2: First event is CRLF status');
    assert(events[1].type === 'complete', 'Scenario 2: Second event is complete');
    assert(state.isRunning === false, 'Scenario 2: isRunning transitioned to false');
  }

  // --------------------------------------------------------------------------
  // Scenario 3: CRLF delimiter split between network chunks
  // --------------------------------------------------------------------------
  console.log('\nScenario 3: CRLF delimiter split between network chunks');
  {
    // Test 3A: Split between \r and \n\r\n
    {
      const { engine, state } = createMockEngine();
      const events: any[] = [];
      const stream = createStringStreamResponse([
        'data: {"type":"status","message":"Split A"}\r',
        '\n\r\ndata: {"type":"complete","data":{}}\r\n\r\n',
      ]);
      await consumePipelineStream(stream, {
        engine,
        controller: new AbortController(),
        activeRequestIdRef: { current: 1 },
        currentRequestId: 1,
        activeWatchdogRef: { current: null },
        activeReaderRef: { current: null },
        onChunk: (c) => events.push(c),
      });
      assert(events.length === 2, 'Scenario 3A: Split between \\r and \\n\\r\\n parsed 2 events');
      assert(events[0].message === 'Split A', 'Scenario 3A: Message intact');
    }

    // Test 3B: Split between \r\n and \r\n
    {
      const { engine, state } = createMockEngine();
      const events: any[] = [];
      const stream = createStringStreamResponse([
        'data: {"type":"status","message":"Split B"}\r\n',
        '\r\ndata: {"type":"complete","data":{}}\r\n\r\n',
      ]);
      await consumePipelineStream(stream, {
        engine,
        controller: new AbortController(),
        activeRequestIdRef: { current: 1 },
        currentRequestId: 1,
        activeWatchdogRef: { current: null },
        activeReaderRef: { current: null },
        onChunk: (c) => events.push(c),
      });
      assert(events.length === 2, 'Scenario 3B: Split between \\r\\n and \\r\\n parsed 2 events');
      assert(events[0].message === 'Split B', 'Scenario 3B: Message intact');
    }

    // Test 3C: Split between \r\n\r and \n
    {
      const { engine, state } = createMockEngine();
      const events: any[] = [];
      const stream = createStringStreamResponse([
        'data: {"type":"status","message":"Split C"}\r\n\r',
        '\ndata: {"type":"complete","data":{}}\r\n\r\n',
      ]);
      await consumePipelineStream(stream, {
        engine,
        controller: new AbortController(),
        activeRequestIdRef: { current: 1 },
        currentRequestId: 1,
        activeWatchdogRef: { current: null },
        activeReaderRef: { current: null },
        onChunk: (c) => events.push(c),
      });
      assert(events.length === 2, 'Scenario 3C: Split between \\r\\n\\r and \\n parsed 2 events');
      assert(events[0].message === 'Split C', 'Scenario 3C: Message intact');
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Multiple CRLF events in one chunk
  // --------------------------------------------------------------------------
  console.log('\nScenario 4: Multiple CRLF events in one chunk');
  {
    const { engine, state } = createMockEngine();
    const events: any[] = [];

    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"Chunk 1"}\r\n\r\ndata: {"type":"status","message":"Chunk 2"}\r\n\r\ndata: {"type":"complete","data":{}}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (c) => events.push(c),
    });

    assert(events.length === 3, 'Scenario 4: Parsed all 3 events in single chunk');
    assert(events[0].message === 'Chunk 1', 'Scenario 4: Event 0 order verified');
    assert(events[1].message === 'Chunk 2', 'Scenario 4: Event 1 order verified');
    assert(events[2].type === 'complete', 'Scenario 4: Event 2 complete verified');
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Mixed LF and CRLF events across stream
  // --------------------------------------------------------------------------
  console.log('\nScenario 5: Mixed LF and CRLF events across stream');
  {
    const { engine } = createMockEngine();
    const events: any[] = [];

    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"LF Event"}\n\n',
      'data: {"type":"status","message":"CRLF Event"}\r\n\r\n',
      'data: {"type":"status","message":"Mixed End 1"}\r\n\n',
      'data: {"type":"status","message":"Mixed End 2"}\n\r\n',
      'data: {"type":"complete","data":{}}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (c) => events.push(c),
    });

    assert(events.length === 5, 'Scenario 5: All 5 mixed delimiter events parsed');
    assert(events[0].message === 'LF Event', 'Scenario 5: LF verified');
    assert(events[1].message === 'CRLF Event', 'Scenario 5: CRLF verified');
    assert(events[2].message === 'Mixed End 1', 'Scenario 5: Mixed \\r\\n\\n verified');
    assert(events[3].message === 'Mixed End 2', 'Scenario 5: Mixed \\n\\r\\n verified');
    assert(events[4].type === 'complete', 'Scenario 5: Terminal complete verified');
  }

  // --------------------------------------------------------------------------
  // Scenario 6: A CRLF-framed `complete` event
  // --------------------------------------------------------------------------
  console.log('\nScenario 6: CRLF-framed complete event');
  {
    const { engine, state } = createMockEngine();
    const stream = createStringStreamResponse([
      'data: {"type":"complete","data":{"title":"CRLF Title"}}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (chunk) => {
        if (chunk.type === 'complete') {
          engine.setGenProgress(100);
          engine.setGenStatus('Generation complete');
          engine.setIsGenerated(true);
        }
      },
    });

    assert(state.isRunning === false, 'Scenario 6: isRunning transitioned to false');
    assert(state.genProgress === 100, 'Scenario 6: Progress is 100%');
    assert(state.genStatus === 'Generation complete', 'Scenario 6: GenStatus shows complete');
    assert(state.isGenerated === true, 'Scenario 6: isGenerated set to true');
    assert(state.genError === null, 'Scenario 6: No error set');
  }

  // --------------------------------------------------------------------------
  // Scenario 7: A CRLF-framed `error` event
  // --------------------------------------------------------------------------
  console.log('\nScenario 7: CRLF-framed error event');
  {
    const { engine, state } = createMockEngine();
    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"Starting..."}\r\n\r\n',
      'data: {"type":"error","reason":"CRLF target server unreachable"}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (chunk) => {
        if (chunk.type === 'error') {
          throw new Error(chunk.reason || 'Generation failed.');
        }
      },
    });

    assert(state.isRunning === false, 'Scenario 7: isRunning transitioned to false on error');
    assert(state.genStatus === 'Failed', 'Scenario 7: genStatus set to Failed');
    assert(state.genError === 'CRLF target server unreachable', 'Scenario 7: Error message captured accurately');
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Final event without trailing delimiter (EOF unclosed)
  // --------------------------------------------------------------------------
  console.log('\nScenario 8: Final event without trailing delimiter (EOF unclosed)');
  {
    const { engine, state } = createMockEngine();
    const events: any[] = [];

    // Stream closes abruptly after complete without trailing double-newline
    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"Starting"}\r\n\r\n',
      'data: {"type":"complete","data":{"title":"Unclosed Final Event"}}',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (chunk) => {
        events.push(chunk);
        if (chunk.type === 'complete') {
          engine.setGenProgress(100);
          engine.setGenStatus('Generation complete');
        }
      },
    });

    assert(events.length === 2, 'Scenario 8: Both events extracted despite unclosed final frame');
    assert(events[1].type === 'complete', 'Scenario 8: Terminal complete captured at EOF');
    assert(state.genStatus === 'Generation complete', 'Scenario 8: Status reached complete');
    assert(state.genError === null, 'Scenario 8: No unexpected closure error thrown');
  }

  // --------------------------------------------------------------------------
  // Scenario 9: UTF-8 multibyte characters (4-byte emoji 🚀) split across chunks
  // --------------------------------------------------------------------------
  console.log('\nScenario 9: UTF-8 multibyte characters split across chunk byte boundaries');
  {
    const { engine } = createMockEngine();
    const events: any[] = [];
    const encoder = new TextEncoder();

    // Rocket 🚀 is 4 bytes: 0xF0, 0x9F, 0x9A, 0x80
    const fullText = 'data: {"type":"status","message":"Launch 🚀 Ready"}\r\n\r\ndata: {"type":"complete","data":{}}\r\n\r\n';
    const allBytes = encoder.encode(fullText);

    // Split bytes right between 0x9F and 0x9A (byte index 2 of 4)
    const rocketPos = allBytes.indexOf(0xF0);
    const chunkA = allBytes.slice(0, rocketPos + 2);
    const chunkB = allBytes.slice(rocketPos + 2);

    const stream = createByteStreamResponse([chunkA, chunkB]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (c) => events.push(c),
    });

    assert(events.length === 2, 'Scenario 9: Parsed 2 events across split multibyte bytes');
    assert(events[0].message === 'Launch 🚀 Ready', 'Scenario 9: Rocket emoji 🚀 decoded without corruption');
  }

  // --------------------------------------------------------------------------
  // Scenario 10: Heartbeat comments using CRLF (: ping\r\n\r\n)
  // --------------------------------------------------------------------------
  console.log('\nScenario 10: Heartbeat comments using CRLF (: ping\\r\\n\\r\\n)');
  {
    const { engine } = createMockEngine();
    const events: any[] = [];

    const stream = createStringStreamResponse([
      ': ping heartbeat\r\n\r\n',
      'data: {"type":"status","message":"Valid 1"}\r\n\r\n',
      ': ping heartbeat 2\r\n\r\n',
      'data: {"type":"complete","data":{}}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (c) => events.push(c),
    });

    assert(events.length === 2, 'Scenario 10: Heartbeat comments skipped cleanly');
    assert(events[0].message === 'Valid 1', 'Scenario 10: Valid chunk preserved');
    assert(events[1].type === 'complete', 'Scenario 10: Complete event reached');
  }

  // --------------------------------------------------------------------------
  // Scenario 11: Incomplete JSON chunk retained across read calls
  // --------------------------------------------------------------------------
  console.log('\nScenario 11: Incomplete JSON chunk retained across read calls');
  {
    const { engine } = createMockEngine();
    const events: any[] = [];

    const stream = createStringStreamResponse([
      'data: {"type":"status","message":"Incompl',
      'ete JSON chunk now reassembled"}\r\n\r\n',
      'data: {"type":"complete","data":{}}\r\n\r\n',
    ]);

    await consumePipelineStream(stream, {
      engine,
      controller: new AbortController(),
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef: { current: null },
      activeReaderRef: { current: null },
      onChunk: (c) => events.push(c),
    });

    assert(events.length === 2, 'Scenario 11: Reassembled incomplete JSON across chunks');
    assert(events[0].message === 'Incomplete JSON chunk now reassembled', 'Scenario 11: Message content intact');
  }

  // --------------------------------------------------------------------------
  // Scenario 12: Inactivity watchdog behavior remains intact with timer reset and abort
  // --------------------------------------------------------------------------
  console.log('\nScenario 12: Inactivity watchdog behavior remains intact with timer reset and abort');
  {
    const { engine, state } = createMockEngine();
    const controller = new AbortController();
    const activeWatchdogRef = { current: null as any };
    const activeReaderRef = { current: null as any };

    // Stream hangs after first CRLF chunk
    const hangingStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('data: {"type":"status","message":"Pulse"}\r\n\r\n'));
        // Never enqueue again, never close
      },
    });

    await consumePipelineStream(new Response(hangingStream), {
      engine,
      controller,
      activeRequestIdRef: { current: 1 },
      currentRequestId: 1,
      activeWatchdogRef,
      activeReaderRef,
      watchdogInactivityMs: 40, // 40ms fast timeout
      onChunk: () => {},
    });

    assert(controller.signal.aborted === true, 'Scenario 12: Watchdog aborted controller on inactivity');
    assert(state.isRunning === false, 'Scenario 12: isRunning set to false');
    assert(state.genStatus === 'Failed', 'Scenario 12: genStatus set to Failed');
    assert(state.genError !== null && state.genError.includes('Generation timed out'), 'Scenario 12: Timeout error recorded');
    assert(activeWatchdogRef.current === null, 'Scenario 12: Watchdog timer cleared');
  }

  console.log('\n========================================================================');
  console.log(` Summary: ${passedTests} passed, ${failedTests} failed`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdversarialParserTests().catch((err) => {
  console.error('Unhandled failure in adversarial suite:', err);
  process.exit(1);
});
