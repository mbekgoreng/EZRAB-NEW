# EZRAB AI Co Assistant - Architecture and Security Review

## Implemented boundary

The current flow is:

1. The TypeScript gateway authenticates the request, resolves the workspace/project, builds official live context, and isolates the request.
2. The gateway sends only bounded server-built context to the internal FastAPI AI Core.
3. The AI Core performs deterministic safety and knowledge routing before calling Ollama.
4. The PDF ingestion pipeline extracts question/answer records into `EZRAB-LOCAL-AI/knowledge/pdf_index.json`.
5. Static PDF answers are returned only when retrieval confidence is at least `0.85`; otherwise the request can continue to live-context/model routing.

## Security findings

### Addressed

- PDF content is treated as data and is never used to override the system prompt.
- Ingestion preserves source file, document hash, page number, entry id, intent, and confidence metadata.
- Cross-page question/answer records are reconstructed before indexing.
- The gateway rejects client-supplied `projectContext` and obtains official context server-side.
- The AI Core has bounded request/context sizes and optional service-token protection.
- Existing safety routing refuses secret disclosure, account bypass, cross-account access, raw SQL, and destructive security requests before model execution.
- The source datasets are copied into `EZRAB-LOCAL-AI/knowledge/source_pdfs`; the generated index is reproducible from those files.

### NEEDS_CONFIRMATION before production

- Replace the in-memory TypeScript subscription/credit service with an atomic database-backed entitlement and usage transaction.
- Require a non-empty service token in production and restrict the AI Core to a private network interface.
- Move knowledge index storage to a versioned database/object store if multiple backend instances will ingest or serve it.
- Add an authenticated admin-only gateway endpoint for ingestion/reindex; the current ingestion endpoint is intentionally internal to the AI Core.
- Ensure all mutating tools re-check workspace, project, role, subscription, credit, and confirmation state at execution time.
- Replace wildcard CORS in the gateway with the deployed EZRAB origin allowlist.
- Add persistent audit storage with secret redaction and retention policy.

## Recommended production controls

- Treat live backend data as higher priority than PDF data.
- Return source metadata in every answer that uses PDF retrieval.
- Do not spend AI credit for greetings, safe refusals, or high-confidence static answers.
- Require a preview plus explicit confirmation for mutations, payments, exports, invitations, and deletions.
- Add rate limiting keyed by authenticated user/workspace in addition to network address.
- Add regression tests for data isolation, prompt injection, stale subscription, empty live data, model timeout, and failed tools.
