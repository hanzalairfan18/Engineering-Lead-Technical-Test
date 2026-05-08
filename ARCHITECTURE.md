# Architecture

This document explains how the service is put together, why each piece looks the way it does, and what would change to take it to production scale.

---

## 1. System overview

The service is a single Fastify process that owns three jobs:

1. **Ingest** — accept document text, normalize it, split it into chunks, embed each chunk, and store the vectors.
2. **Retrieve** — embed an incoming question, find the most similar chunks via cosine similarity, and pack them into a prompt.
3. **Answer** — send that prompt to a chat model and return the answer with citations.

```
                ┌─────────────────────────────────────────────┐
                │                Fastify HTTP                 │
                │      /ingest      /ask      /health         │
                └──────────────┬──────────────┬───────────────┘
                               │              │
                       ┌───────▼─────┐  ┌─────▼─────────┐
                       │ Ingestion   │  │ Retrieval     │
                       │ Service     │  │ Service       │
                       └───┬─────┬───┘  └───┬─────┬─────┘
                           │     │          │     │
                    ┌──────▼──┐ ┌▼──────────▼┐  ┌─▼──────┐
                    │ Chunker │ │ Embedding  │  │  LLM   │
                    │ (rag)   │ │ Service    │  │ Service│
                    └─────────┘ └─────┬──────┘  └────┬───┘
                                      │              │
                                  ┌───▼────┐    ┌────▼────┐
                                  │ OpenAI │    │ OpenAI  │
                                  │  Embed │    │  Chat   │
                                  └────────┘    └─────────┘
                                      │
                              ┌───────▼─────────┐
                              │  VectorStore    │ ← interface
                              │  (in-memory     │   in rag/vectorstore;
                              │   impl ships)   │   swap at composition root
                              └─────────────────┘
```

### Layering rules

```
api  →  services  →  rag, utils
                  →  config (read-only)
rag and utils are leaves. They never import from api or services.
```

This keeps the RAG primitives pure and the services orchestration-only — both become trivial to unit-test.

Concrete dependencies are wired only at the composition root (`src/app.ts`). Services type their dependencies as interfaces or injected SDK clients (`VectorStore`, `OpenAI`), never as concrete classes. Replacing the in-memory store with pgvector is a single-file change there.

---

## 2. Ingestion flow

```
POST /ingest  (multipart/form-data: file + optional source)
     │
     ▼
 Multipart read → buffer + mimetype
     │
     ▼
 MIME guard (application/pdf or DOCX only)
     │
     ▼
 FileExtractService.extractText
   ├─ PDF  → pdf-parse
   └─ DOCX → mammoth.extractRawText
     │
     ▼
 IngestionService.ingest
     │
     ▼
 utils/text.normalizeText
     │
     ▼
 rag/chunking/fixed-chunker.chunkText
     (size=500, overlap=100, by chars)
     │
     ▼
 EmbeddingService.embedMany (batched ≤1024 inputs/request)
     → OpenAI text-embedding-3-small
     │
     ▼
 VectorStore.insertDocument
     (throws on duplicate documentId — insert, not upsert)
     │
     ▼
 201 Created { document: meta }
```

**Why these specifics:**

- **One endpoint, one shape.** The original /ingest + /ingest/file split was overengineering — a single multipart endpoint covers every realistic input and matches the spec.
- **PDF + DOCX only.** Plain-text uploads are rare for real documents; PDF and DOCX cover the long tail. Scanned (image-only) files fail fast with a 400 — OCR is explicitly out of scope.
- **MIME guard runs before buffering** so malformed uploads can't waste memory or time.
- **Normalization** is intentionally minimal — it collapses whitespace and unifies newlines. Format-aware preprocessing happens in `file-extract.service.ts` before normalization.
- **Fixed character chunking** avoids a tokenizer dependency. Token-aware chunking (via `tiktoken`) would be marginally better for cost prediction but adds weight; for a 500-char window we are comfortably under the embedding model's input limit.
- **Overlap** of 100 characters preserves context for sentences that straddle chunk boundaries — the same idea will appear intact in at least one of the two adjacent chunks.
- **Batched embedding** with a 1024-input ceiling per request keeps us under OpenAI's per-request limits regardless of document size.

---

## 3. Retrieval flow

```
POST /ask
     │ JSON body { question }
     ▼
 Zod validation
     │
     ▼
 RetrievalService.ask
     │
     ▼
 EmbeddingService.embedOne(question)
     │  → OpenAI text-embedding-3-small
     ▼
 VectorStore.search(vector, topK=3, minScore=0.35)
     │
     ▼
 Are there hits above threshold?
     │
 ┌───┴────┐
 NO       YES
 │        │
 │        ▼
 │   rag/prompts/qa-prompt.buildUserPrompt
 │        │
 │        ▼
 │   LLMService.complete (gpt-4.1-mini, temp=0.1)
 │        │
 │        ▼
 │   { answer, grounded, sources[] }
 │
 ▼
 { answer: NO_CONTEXT_ANSWER, grounded: false, sources: [] }
```

**Why these specifics:**

- **Top-K = 3** is a defensible default for short documents. It's a knob (`TOP_K`) so it can be tuned per deployment.
- **Similarity threshold (default 0.35)** is calibrated for `text-embedding-3-small`: unrelated short English passages typically score 0.15–0.30, so 0.35 sits above the noise floor. Below the threshold, the service refuses to answer rather than feed weak matches to the LLM.
- **Temperature 0.1** for the answer call. We want the model to lean on the provided context, not improvise.
- **Two independent grounding gates.** The threshold filters retrieval; the system prompt instructs the model to emit the literal sentinel string when nothing in the excerpts supports an answer. Either gate alone is leaky; together they keep ungrounded answers rare.
- **Prompt-injection defense.** Each excerpt body is wrapped in a unique fence (`<<<EXCERPT_BODY>>>`); the system prompt's UNTRUSTED CONTENT RULE instructs the model to treat fenced content as data, never as instructions, regardless of what the document tries to say.
- **Sources are returned with score and a preview**, so the caller can render citations or debug retrieval quality without needing a separate endpoint.

---

## 4. Why these technologies

| choice                                  | reason                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Fastify**                             | Faster than Express, schema-first, first-class Zod integration via `fastify-type-provider-zod`.         |
| **TypeScript (strict)**                 | Domain types are the spec. Catches whole categories of bugs at compile time.                            |
| **Zod for JSON I/O**                    | One schema validates the request and generates the OpenAPI fragment — no drift between docs and reality. The `/ingest` multipart body uses raw JSON Schema (`format: binary` is not expressible in Zod) and is injected via a small swagger transform. |
| **OpenAI `text-embedding-3-small`**     | 1536-dim, cheap, L2-normalized output. Strong baseline for English.                                     |
| **OpenAI `gpt-4.1-mini`**               | Strong instruction-following at low cost, suitable for grounded QA.                                     |
| **`pdf-parse` + `mammoth`**             | Smallest credible footprint for PDF and DOCX text extraction. Both MIT, both pure-JS, both stable.       |
| **In-memory cosine search**             | Brute-force is correct, predictable, and zero-dependency. Trivially swappable for pgvector/Qdrant later. |
| **Multi-stage Docker**                  | Smaller runtime image; dev deps never ship.                                                             |
| **Centralized error handler**           | Controllers throw `AppError` subclasses; mapping to HTTP lives in one place.                            |

---

## 5. Production thinking

What's missing for production, in order of payoff:

### 5.1 Persistence

The vector store is in-memory: a restart loses everything. The smallest credible upgrade is a JSON snapshot on graceful shutdown and rehydrate on boot — fits in ~50 LOC and slots in behind the existing store interface. The next step is **pgvector** (Postgres extension) or **Qdrant**: both keep ingestion synchronous, support proper indexes, and scale into the millions of chunks.

### 5.2 Search quality

Brute-force cosine over a few thousand chunks is fine. Past that:

- **Approximate Nearest Neighbor** indexes (HNSW via pgvector / Qdrant) drop search to sub-linear time.
- **Re-ranking** with a cross-encoder (Cohere Rerank, BGE-Reranker) over top-K candidates substantially improves answer relevance — usually more impactful than tweaking embedding models.
- **Hybrid search** (BM25 + dense) for documents heavy on named entities, IDs, or jargon that dense embeddings underweight.

### 5.3 Throughput and resilience

- **Rate limiting** on `/ingest` and `/ask` — `@fastify/rate-limit` per IP/API-key.
- **Backpressure on ingestion** — large documents currently embed all chunks in one shot. For 100k+-chunk corpora, ingestion should be chunked into batches with a concurrency cap.
- **Circuit breaker** around the OpenAI client. The SDK retries internally; we'd add an outer breaker that opens on sustained 5xx and serves a 503 with `Retry-After` rather than queueing.
- **Idempotency keys** on `/ingest` so retries don't double-store.

### 5.4 Observability

- **Structured logs** are already on (pino via Fastify). Add request IDs and per-stage timings (embed, search, complete).
- **Metrics** — Prometheus histogram for `openai.embed.latency`, `openai.chat.latency`, `vectorstore.search.latency`.
- **Tracing** — OpenTelemetry spans across the ingest and ask pipelines; an LLM call should be a leaf span with token counts as attributes.
- **Eval harness** — a small offline test set of `(document, question, expected answer)` triples scored against the live pipeline. This is what catches retrieval regressions when prompts or chunk sizes change.

### 5.5 Multi-tenancy and security

- **Auth** — JWT or API key, validated via a Fastify hook. Currently absent.
- **Tenant scoping** — every chunk and document gets a `tenantId`; `/ask` filters by it. The in-memory store would grow a secondary index by tenant.
- **Cost guards** — per-tenant token budgets enforced before the OpenAI call.

### 5.6 Cost

- **Embedding cache** — same chunk text → same vector. Hash-based dedupe avoids paying twice for re-ingested content.
- **Question cache** — `(documentId, normalizedQuestion) → answer` LRU. Useful for FAQs and demos.
- **Prompt-token discipline** — pack only the portions of each chunk closest to the matching span, not the whole 500 chars, when token budget is tight.

### 5.7 Things deliberately *not* in scope for production

Some things sound prudent but are easy to overdo:

- **Microservices.** A single binary with clean module boundaries is easier to operate than five services tied together by HTTP. We'd split only when scaling profiles diverge (e.g. ingestion is bursty, ask is steady).
- **Event sourcing / CQRS.** The domain has no audit-log requirement; a simple CRUD store is appropriate.
- **Custom-trained embeddings.** Almost never the right first move. Re-ranking and better chunking deliver more, faster, for less money.

---

## 6. Test surface

Tests live under `tests/`, run with `npm run test` (Vitest). The suite is intentionally narrow but exercises every load-bearing layer:

- `tests/rag/cosine.test.ts` — pure cosine math; identical / orthogonal / opposite vectors, magnitude invariance, length-mismatch error.
- `tests/rag/chunker.test.ts` — empty input, sub-size text, overlap math, offset bounds, invalid params, unique chunk ids.
- `tests/rag/in-memory-vector-store.test.ts` — top-K ordering, threshold filtering, `insertDocument` duplicate-id rejection, listing order, reset semantics.
- `tests/api/app.test.ts` — full HTTP surface via `app.inject(...)`. Asserts `/health`, `/ask` no-context sentinel, `/ask` happy path with sources (and that the prompt-injection fence appears in the user prompt), `/ask` validation rejection, `/ingest` no-file and bad-MIME rejection, and `/docs/json` exposing the multipart file picker schema.

The HTTP tests use `buildApp(config, overrides)` to swap in fakes:

```ts
const fakeEmbeddings = {
  embedOne: async () => fakeVector,
  embedMany: async (texts) => texts.map(() => fakeVector),
} as unknown as EmbeddingService;

const app = await buildApp(testConfig, { embeddings: fakeEmbeddings });
const res = await app.inject({ method: 'POST', url: '/ask', payload: { question: '...' } });
```

No network, no listening port, no module mutation — the factory was written specifically for this.
