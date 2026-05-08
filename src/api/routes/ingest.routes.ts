import type { FastifyInstance } from 'fastify';
import { ingest } from '../controllers/ingest.controller';
import { IngestResponseSchema } from '../schemas/ingest.schema';

/**
 * The route does not declare a `body` schema because:
 *   - `format: binary` (needed for Swagger UI's file picker) is not
 *     expressible in Zod.
 *   - Multipart bodies are stream-read in the controller via `request.file()`,
 *     not parsed by Fastify's body parser, so there's nothing to validate
 *     at the route layer.
 *
 * The OpenAPI multipart body shape is injected by `registerSwagger`'s
 * transform, keyed off this URL.
 */
export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/ingest',
    {
      schema: {
        tags: ['ingest'],
        summary: 'Ingest a document (PDF or DOCX)',
        description:
          'Uploads a PDF or DOCX file. The server extracts text, chunks it, generates embeddings, and stores them for retrieval by /ask.',
        consumes: ['multipart/form-data'],
        response: { 201: IngestResponseSchema },
      },
    },
    ingest,
  );
}
