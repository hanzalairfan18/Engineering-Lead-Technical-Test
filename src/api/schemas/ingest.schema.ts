import { z } from 'zod';

/**
 * The /ingest endpoint accepts a PDF or DOCX upload via multipart/form-data,
 * not a JSON body — so there's no request schema here, only the response.
 *
 * The OpenAPI body shape (file + source fields) is declared as raw JSON
 * Schema directly in the route, since `format: binary` cannot be expressed
 * in Zod.
 */

export const IngestResponseSchema = z.object({
  document: z.object({
    id: z.string().uuid(),
    source: z.string(),
    charCount: z.number().int().nonnegative(),
    chunkCount: z.number().int().nonnegative(),
    ingestedAt: z.string(),
  }),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;
