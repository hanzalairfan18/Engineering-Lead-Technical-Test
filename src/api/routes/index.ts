import type { FastifyInstance } from 'fastify';
import { askRoutes } from './ask.routes';
import { healthRoutes } from './health.routes';
import { ingestRoutes } from './ingest.routes';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(askRoutes);
}
