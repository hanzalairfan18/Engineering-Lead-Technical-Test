# Document Question Answering API

A small, production-shaped Retrieval-Augmented Generation (RAG) service. Ingest a document, ask a question, get a grounded answer with citations.

```
document → chunk → embeddings → cosine search → context → LLM → answer
```

Built for the Engineering Lead take-home: the goal is **clean engineering and clear thinking**, not a research prototype. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design walk-through.

---

## Stack

- **Runtime:** Node.js 20, TypeScript (strict)
- **HTTP:** Fastify 4 with `fastify-type-provider-zod` for end-to-end Zod validation
- **Document parsing:** `pdf-parse` for PDF, `mammoth` for DOCX
- **AI:** OpenAI — `text-embedding-3-small` for embeddings, `gpt-4.1-mini` for answers
- **Vector store:** in-memory cosine similarity (brute-force, predictable, zero-dep)
- **Docs:** Swagger UI at `/docs` generated from the same Zod schemas the API validates against
- **Quality:** ESLint + Prettier, strict TS, centralized error handling
- **Tests:** Vitest — RAG primitives unit-tested; full HTTP surface tested via `app.inject` with fakes injected through `buildApp` overrides
- **Packaging:** multi-stage Dockerfile + `docker compose`

---

## Quick start

### 1. Local (Node 20+)

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY
npm install
npm run dev
```

The server prints its bind address; Swagger UI is at `http://localhost:3000/docs`.

### 2. Docker

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY
docker compose up --build
```

---

## API

`/ingest` is `multipart/form-data` (file upload). `/ask` and `/health` are JSON. All responses are JSON. Validation is Zod-driven; errors come back as `{ error: { code, message, details? } }`.

### `GET /health`

Liveness check. Returns uptime and the in-memory store size.

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok", "uptimeSeconds": 12, "documents": 0, "chunks": 0 }
```

### `POST /ingest`

Upload a **PDF** or **DOCX** document. The server extracts text, chunks it, embeds each chunk, and stores it for retrieval.

Request: `multipart/form-data`

| field    | type   | required | description                                                  |
| -------- | ------ | -------- | ------------------------------------------------------------ |
| `file`   | file   | yes      | PDF (`application/pdf`) or DOCX (`...wordprocessingml.document`) |
| `source` | string | no       | Friendly label (defaults to the filename)                    |

```bash
curl -X POST http://localhost:3000/ingest \
  -F "file=@./refund-policy.pdf" \
  -F "source=refund-policy.pdf"
```

```json
{
  "document": {
    "id": "8b6e2d7c-…",
    "source": "refund-policy.pdf",
    "charCount": 1842,
    "chunkCount": 5,
    "ingestedAt": "2026-05-08T10:14:22.013Z"
  }
}
```

Swagger UI at `/docs` provides a "Try it out" form with a file picker.

**Limitations:** scanned (image-only) PDFs and DOCX files containing only images return `400 VALIDATION_ERROR` because no text can be extracted — OCR is out of scope.

### `POST /ask`

Ask a question against everything that has been ingested.

```bash
curl -X POST http://localhost:3000/ask \
  -H 'Content-Type: application/json' \
  -d '{ "question": "What does the document say about refunds?" }'
```

```json
{
  "answer": "Full refunds are available within 30 days of purchase; after that, store credit may be issued at our discretion. Items must be returned in their original condition.",
  "grounded": true,
  "sources": [
    {
      "chunkId": "…",
      "documentId": "…",
      "score": 0.8421,
      "preview": "Our refund policy allows full refunds within 30 days of purchase…"
    }
  ]
}
```

If nothing relevant is found (no chunks, or none above the similarity threshold), the response is:

```json
{ "answer": "I could not find this information in the document.", "grounded": false, "sources": [] }
```

---

## Project structure

```
src/
├── api/
│   ├── controllers/      # thin request handlers, no business logic
│   ├── plugins/          # error handler, swagger transform, deps typing
│   ├── routes/           # one file per resource, Zod schemas attached
│   └── schemas/          # request/response Zod schemas (single source of truth)
├── config/               # env loading + validation
├── rag/
│   ├── chunking/         # fixed-window chunker
│   ├── prompts/          # QA system + user prompt builders
│   ├── similarity/       # pure cosine similarity
│   └── vectorstore/      # VectorStore interface + InMemoryVectorStore impl
├── services/             # ingestion, retrieval, embeddings, llm,
│                         # file-extract (PDF/DOCX), document, openai-client
├── storage/              # placeholder for future on-disk persistence
├── types/                # framework-agnostic domain types
├── utils/                # text normalization, ids, error classes
├── app.ts                # Fastify app factory + AppOverrides (composition root)
└── server.ts             # process entry: load config, listen, graceful shutdown
```

Layering rule: `api` may depend on `services`, `services` may depend on `rag` and `utils`, `rag` and `utils` are leaves. No reverse arrows.

---

## Configuration

Every knob is surfaced as an environment variable and validated by Zod at startup — the process refuses to boot on bad config. See [`.env.example`](./.env.example).

| variable                | default                  | purpose                                       |
| ----------------------- | ------------------------ | --------------------------------------------- |
| `OPENAI_API_KEY`        | —                        | required                                      |
| `OPENAI_EMBEDDING_MODEL`| `text-embedding-3-small` | embedding model                               |
| `OPENAI_CHAT_MODEL`     | `gpt-4.1-mini`           | chat completion model                         |
| `CHUNK_SIZE`            | `500`                    | chunk window size in characters               |
| `CHUNK_OVERLAP`         | `100`                    | overlap between adjacent chunks               |
| `TOP_K`                 | `3`                      | chunks retrieved per question                 |
| `SIMILARITY_THRESHOLD`  | `0.35`                   | min cosine score; below → "not in document"   |
| `MAX_UPLOAD_BYTES`      | `10485760`               | upload size cap                               |
| `PORT` / `HOST`         | `3000` / `0.0.0.0`       |                                                |
| `LOG_LEVEL`             | `info`                   | pino log level                                |

---

## npm scripts

| script             | what it does                                |
| ------------------ | ------------------------------------------- |
| `npm run dev`      | hot-reload dev server (`tsx watch`)         |
| `npm run build`    | TypeScript compile to `dist/`               |
| `npm start`        | run compiled JS                             |
| `npm run typecheck`| `tsc --noEmit`                              |
| `npm run lint`     | ESLint over `src/` and `tests/`             |
| `npm run lint:fix` | ESLint with `--fix`                         |
| `npm run format`   | Prettier write                              |
| `npm run test`     | Vitest, run once                            |
| `npm run test:watch`| Vitest, watch mode                         |

---

## Design decisions

A few choices worth calling out — the longer-form rationale lives in [ARCHITECTURE.md](./ARCHITECTURE.md).

- **In-memory vector store behind a `VectorStore` interface.** A brute-force cosine scan over a `Map<string, EmbeddedChunk>` is `O(N·D)`, perfectly adequate for take-home corpora. Services depend on the interface, not the concrete `InMemoryVectorStore`, so swapping for pgvector / Qdrant is a single-file change at the composition root.
- **Insert, not upsert.** The store's `insertDocument` throws on duplicate `documentId` — the previous "upsert" name implied idempotent overwrite that the implementation didn't deliver.
- **Fixed-size character chunking with overlap.** Tokenizer-aware or semantic chunking is better in production but adds dependencies and complexity. 500-char windows with 100-char overlap give clean ingestion without dragging in `tiktoken`.
- **Zod schemas drive both validation and OpenAPI.** One schema per request/response. `fastify-type-provider-zod` plus `jsonSchemaTransform` means Swagger UI cannot drift from the real validation rules. The one exception is `/ingest`'s multipart body (`format: binary` is not expressible in Zod), which is injected via a small swagger transform.
- **Thin controllers, fat services.** Controllers do request → service → response and nothing else. Business logic stays in `services/` and pure algorithms stay in `rag/`.
- **Ungrounded answers are explicit.** When no chunk passes the similarity threshold, or the LLM admits it can't answer, the response is the literal sentinel `"I could not find this information in the document."` with `grounded: false`. No hallucinated answers wearing the same shape as real ones.
- **Prompt-injection defense.** Excerpts are wrapped in a fenced delimiter and the system prompt instructs the model to treat their contents as untrusted data — instructions inside a document do not redirect the model.
- **Constructor-injected OpenAI client with timeout + retries.** `createOpenAIClient(config)` is a plain factory called once in `buildApp`; `EmbeddingService` and `LLMService` accept the client in their constructors. No mutable module-level singleton, no test seam that ignores config changes. Client is configured with `timeout: 30s` and `maxRetries: 2` so a stuck OpenAI call cannot hold a Fastify handler indefinitely.
- **Testable composition root.** `buildApp(config, overrides?)` accepts leaf-level overrides (`openai`, `store`, `embeddings`, `llm`) so tests can spin up the full HTTP surface in-process with fakes — no network, no module mutation.

---

## Tradeoffs

- **State is lost on restart.** Acceptable for a take-home; persistence would be the first thing I'd add (JSON snapshot to `storage/`, or pgvector). The `VectorStore` interface already isolates this.
- **No auth, no multi-tenancy.** Out of scope. Anyone calling `/ingest` adds chunks to the same shared corpus that `/ask` reads from. Production would add an auth middleware and `tenantId`-scoped document namespaces.
- **No re-ranking.** The top-3 chunks are passed straight to the LLM. A cross-encoder re-rank step (e.g. Cohere Rerank, BGE) would meaningfully improve answer quality on longer corpora.
- **No OCR.** Scanned (image-only) PDFs and DOCX files containing only images return `400 VALIDATION_ERROR`. OCR is real engineering work and out of scope.
- **Limited retry policy.** The OpenAI SDK retries idempotent failures internally with `maxRetries: 2`. No outer circuit breaker; that would matter at scale.

---

## Future improvements

In rough priority order:

1. **Persistence** — JSON snapshot of the vector store on shutdown, or move to pgvector / Qdrant.
2. **Per-document scoping on `/ask`** — let the caller pin a question to a specific `documentId`.
3. **Re-ranking** — cross-encoder over top-K candidates before LLM.
4. **Streaming responses** — `text/event-stream` from `/ask` so the UI can render tokens as they arrive.
5. **Smarter chunking** — sentence-aware splits, or recursive splitting on semantic boundaries.
6. **Caching** — hash-based cache for embeddings of identical chunk text; LRU cache for `(question_embedding → answer)` pairs.
7. **Metrics** — Prometheus middleware on Fastify; latency histograms per OpenAI call.
8. **Auth + multi-tenancy** — JWT + tenant-scoped document namespaces in the store.

---

## License

MIT. Take-home submission for the Engineering Lead role.
