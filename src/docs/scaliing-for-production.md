# Scaling for Production
This document serves as a living roadmap for architectural changes that will be necessary when moving from the current MVP to a high-traffic production environment.

1. Concurrency Management & Gemini Limits
The Risk: Currently, the frontend achieves a "progressive UI" feel during Keyword Refinement by chunking keywords into mini-batches of 8 and firing concurrent fetch requests directly to the /api/refine-keywords endpoint. While this works beautifully for a single user (firing ~4 simultaneous calls for 30 keywords), it does not scale. If 10 users click "Refine" simultaneously, the system will fire 40 concurrent calls to the Gemini API, quickly exhausting the API slot concurrency limits and resulting in failures.

# The Mitigation (Pre-Launch Requirement):

Shift chunking to the Backend: The frontend API contract should revert to sending a single POST request with the entire array of raw keywords.
Controlled Concurrency (p-limit): The backend /api/refine-keywords route should implement the chunking logic (batches of 8) and use a concurrency limiter (like p-limit(3)) when calling the Gemini API. This throttles the execution safely across the entire server, rather than allowing unbound parallelism from the client.
Server-Sent Events (SSE) or Streaming: To maintain the snappy, progressive UI updates on the frontend, the backend should be refactored to stream the chunked results back as they complete, either via a ReadableStream or formal SSE, rather than waiting for Promise.all() to finish the entire dataset.
2. API Key Management
Ensure SERP_KEY, DATAFORSEO_LOGIN, and DATAFORSEO_PASSWORD are correctly routed through a secrets manager or secure environment variables. Consider adding usage alerts when nearing credit limits.