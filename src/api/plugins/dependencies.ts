import type { AppConfig } from '../../config/env';
import type { DocumentService } from '../../services/document.service';
import type { IngestionService } from '../../services/ingestion.service';
import type { RetrievalService } from '../../services/retrieval.service';

export interface AppDependencies {
  config: AppConfig;
  ingestion: IngestionService;
  retrieval: RetrievalService;
  documents: DocumentService;
  startedAt: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDependencies;
  }
}
