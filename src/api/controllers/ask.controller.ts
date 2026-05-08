import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AskBody, AskResponse } from '../schemas/ask.schema';

export async function ask(
  request: FastifyRequest<{ Body: AskBody }>,
  reply: FastifyReply,
): Promise<AskResponse> {
  const { retrieval } = request.server.deps;
  const result = await retrieval.ask(request.body.question);
  return reply.send(result);
}
