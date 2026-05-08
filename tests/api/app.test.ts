import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { InMemoryVectorStore } from '../../src/rag/vectorstore/in-memory-vector-store';
import type { EmbeddedChunk } from '../../src/types';
import { fakeEmbed, makeConfig, makeFakeEmbeddings, makeFakeLLM } from '../fixtures';
import { NO_CONTEXT_ANSWER } from '../../src/rag/prompts/qa-prompt';

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('GET /health', () => {
  it('returns ok with store stats', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM(),
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: 'ok', documents: 0, chunks: 0 });
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('POST /ask', () => {
  it('returns the no-context sentinel when the store is empty', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM({ answer: 'should not be called' }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      payload: { question: 'anything?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      answer: NO_CONTEXT_ANSWER,
      grounded: false,
      sources: [],
    });
  });

  it('returns the LLM answer with sources when relevant chunks exist', async () => {
    const store = new InMemoryVectorStore();
    const text = 'Refunds are allowed within 30 days of purchase.';
    const chunk: EmbeddedChunk = {
      id: 'chunk-1',
      documentId: 'doc-1',
      text,
      index: 0,
      startOffset: 0,
      endOffset: text.length,
      embedding: fakeEmbed(text),
    };
    store.insertDocument(
      {
        id: 'doc-1',
        source: 'policy.pdf',
        charCount: text.length,
        chunkCount: 1,
        ingestedAt: new Date().toISOString(),
      },
      [chunk],
    );

    const capture: { systemPrompt?: string; userPrompt?: string } = {};
    app = await buildApp(makeConfig({ SIMILARITY_THRESHOLD: 0.1 }), {
      store,
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM({ answer: 'Refunds are allowed within 30 days.', capture }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      payload: { question: 'How long do I have to request a refund?' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.grounded).toBe(true);
    expect(body.answer).toBe('Refunds are allowed within 30 days.');
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].documentId).toBe('doc-1');
    expect(body.sources[0].chunkId).toBe('chunk-1');
    expect(body.sources[0].score).toBeGreaterThan(0.1);

    // Untrusted-content fence appears in the user prompt (prompt-injection guard).
    expect(capture.userPrompt).toContain('<<<EXCERPT_BODY>>>');
    expect(capture.userPrompt).toContain(text);
  });

  it('rejects an empty question with 400', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      payload: { question: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
  });

  it('rejects unknown fields (Zod strict)', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      payload: { question: 'ok', unexpected: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /ingest', () => {
  it('rejects requests with no file part', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      headers: { 'content-type': 'multipart/form-data; boundary=----X' },
      payload: '------X--\r\n',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-PDF/DOCX MIME types', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM(),
    });

    const boundary = '----TestBoundary';
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="evil.bin"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n` +
      `garbage bytes\r\n` +
      `--${boundary}--\r\n`;

    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Unsupported content type/);
  });
});

describe('GET /docs/json (OpenAPI)', () => {
  it('exposes the multipart file picker for /ingest', async () => {
    app = await buildApp(makeConfig(), {
      embeddings: makeFakeEmbeddings(),
      llm: makeFakeLLM(),
    });
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    const ingestBody = spec.paths['/ingest'].post.requestBody;
    expect(ingestBody.content['multipart/form-data'].schema.properties.file).toEqual(
      expect.objectContaining({ type: 'string', format: 'binary' }),
    );
    expect(ingestBody.content['multipart/form-data'].schema.required).toContain('file');
  });
});
