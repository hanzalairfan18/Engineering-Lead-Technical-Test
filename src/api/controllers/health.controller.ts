import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HealthResponse } from '../schemas/health.schema';

export async function health(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<HealthResponse> {
  const { documents, startedAt } = request.server.deps;
  const stats = documents.stats();
  return reply.send({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    documents: stats.documents,
    chunks: stats.chunks,
  });
}
