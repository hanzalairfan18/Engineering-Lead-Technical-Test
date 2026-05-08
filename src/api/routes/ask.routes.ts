import type { FastifyInstance } from 'fastify';
import { ask } from '../controllers/ask.controller';
import { AskBodySchema, AskResponseSchema } from '../schemas/ask.schema';

export async function askRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/ask',
    {
      schema: {
        tags: ['ask'],
        summary: 'Ask a question against ingested documents',
        description:
          'Embeds the question, retrieves the top-K most similar chunks, and asks the LLM to answer using only that context.',
        body: AskBodySchema,
        response: { 200: AskResponseSchema },
      },
    },
    ask,
  );
}
