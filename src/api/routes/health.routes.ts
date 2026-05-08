import type { FastifyInstance } from 'fastify';
import { health } from '../controllers/health.controller';
import { HealthResponseSchema } from '../schemas/health.schema';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Service health check',
        response: { 200: HealthResponseSchema },
      },
    },
    health,
  );
}
