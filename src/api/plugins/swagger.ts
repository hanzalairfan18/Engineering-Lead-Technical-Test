import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/**
 * The multipart body for /ingest cannot be expressed in Zod (`format: binary`
 * has no Zod equivalent), so we inject it into the OpenAPI document
 * post-transform. This keeps the route definition Zod-clean while still
 * giving Swagger UI a working file picker.
 */
const MULTIPART_INGEST_BODY = {
  type: 'object',
  required: ['file'],
  properties: {
    file: {
      type: 'string',
      format: 'binary',
      description: 'PDF or DOCX file to ingest.',
    },
    source: {
      type: 'string',
      description: 'Optional human-readable document label (defaults to the filename).',
    },
  },
};

const transform: typeof jsonSchemaTransform = (params) => {
  const result = jsonSchemaTransform(params);
  if (params.url === '/ingest') {
    (result.schema as { body?: unknown }).body = MULTIPART_INGEST_BODY;
  }
  return result;
};

/**
 * Registers Swagger + Swagger-UI. Zod schemas attached to routes are
 * transformed into OpenAPI components by `jsonSchemaTransform`, so the
 * docs at /docs always reflect the real validation rules — no hand-written
 * OpenAPI fragments to drift out of sync.
 */
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Document Question Answering API',
        description:
          'A small RAG service: ingest a document, ask questions, get grounded answers.',
        version: '1.0.0',
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'ingest', description: 'Document ingestion' },
        { name: 'ask', description: 'Question answering' },
        { name: 'health', description: 'Service health' },
      ],
    },
    transform,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
  });
}
