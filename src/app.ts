import Fastify, { type FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type OpenAI from 'openai';

import type { AppConfig } from './config/env';
import { InMemoryVectorStore } from './rag/vectorstore/in-memory-vector-store';
import type { VectorStore } from './rag/vectorstore/vector-store';
import { DocumentService } from './services/document.service';
import { EmbeddingService } from './services/embedding.service';
import { IngestionService } from './services/ingestion.service';
import { LLMService } from './services/llm.service';
import { createOpenAIClient } from './services/openai-client';
import { RetrievalService } from './services/retrieval.service';
import { registerErrorHandler } from './api/plugins/error-handler';
import { registerSwagger } from './api/plugins/swagger';
import { registerRoutes } from './api/routes';
import type { AppDependencies } from './api/plugins/dependencies';

/**
 * Optional overrides accepted by `buildApp`. Only leaf dependencies are
 * exposed; the orchestration services (ingestion / retrieval / documents)
 * are always rebuilt from whichever leaves are in effect, so a single
 * substitution propagates correctly.
 *
 * Example test usage:
 *
 *   const fakeEmbeddings = { embedOne: ..., embedMany: ... } as unknown as EmbeddingService;
 *   const app = await buildApp(config, { embeddings: fakeEmbeddings, store: new InMemoryVectorStore() });
 *   const res = await app.inject({ method: 'POST', url: '/ask', payload: { question: '...' } });
 */
export interface AppOverrides {
  openai?: OpenAI;
  store?: VectorStore;
  embeddings?: EmbeddingService;
  llm?: LLMService;
}

/**
 * Application factory. Builds all services, wires them onto the Fastify
 * instance, and registers plugins + routes. Pure I/O lives in `server.ts`.
 */
export async function buildApp(
  config: AppConfig,
  overrides: AppOverrides = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    bodyLimit: Math.max(config.MAX_UPLOAD_BYTES, 4 * 1024 * 1024),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // --- Composition root -------------------------------------------------
  // Leaves accept overrides; orchestration is built from the chosen leaves.
  const openai = overrides.openai ?? createOpenAIClient(config);
  const store = overrides.store ?? new InMemoryVectorStore();
  const embeddings = overrides.embeddings ?? new EmbeddingService(openai, config);
  const llm = overrides.llm ?? new LLMService(openai, config);

  const ingestion = new IngestionService(config, embeddings, store);
  const retrieval = new RetrievalService(config, embeddings, llm, store);
  const documents = new DocumentService(store);

  const deps: AppDependencies = {
    config,
    ingestion,
    retrieval,
    documents,
    startedAt: Date.now(),
  };
  app.decorate('deps', deps);

  // --- Plugins ----------------------------------------------------------
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
  });

  await registerSwagger(app);
  registerErrorHandler(app);

  // --- Routes -----------------------------------------------------------
  await registerRoutes(app);

  return app;
}
