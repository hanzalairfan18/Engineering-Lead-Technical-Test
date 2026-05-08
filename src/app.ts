import Fastify, { type FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { AppConfig } from './config/env';
import { InMemoryVectorStore } from './rag/vectorstore/vector-store';
import { DocumentService } from './services/document.service';
import { EmbeddingService } from './services/embedding.service';
import { IngestionService } from './services/ingestion.service';
import { LLMService } from './services/llm.service';
import { RetrievalService } from './services/retrieval.service';
import { registerErrorHandler } from './api/plugins/error-handler';
import { registerSwagger } from './api/plugins/swagger';
import { registerRoutes } from './api/routes';
import type { AppDependencies } from './api/plugins/dependencies';

/**
 * Application factory. Builds all services, wires them onto the Fastify
 * instance, and registers plugins + routes. Pure I/O lives in `server.ts`.
 *
 * Tests can call `buildApp` with a config (and override services if needed)
 * to exercise the full HTTP surface without touching the network.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    bodyLimit: Math.max(config.MAX_UPLOAD_BYTES, 4 * 1024 * 1024),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // --- Composition root -------------------------------------------------
  const store = new InMemoryVectorStore();
  const embeddings = new EmbeddingService(config);
  const llm = new LLMService(config);
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
