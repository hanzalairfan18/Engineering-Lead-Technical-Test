import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IngestResponse } from '../schemas/ingest.schema';
import { ALLOWED_MIME_TYPES, extractText } from '../../services/file-extract.service';
import { ValidationError } from '../../utils/errors';

/**
 * Multipart ingestion handler. Accepts a single file upload under field
 * name "file" (PDF or DOCX), with an optional "source" text field for the
 * document label. Extracts plain text via the file-extract service, then
 * delegates to the ingestion service for chunking, embedding, and storage.
 */
export async function ingest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<IngestResponse> {
  const { ingestion, config } = request.server.deps;

  const file = await request.file({ limits: { fileSize: config.MAX_UPLOAD_BYTES } });
  if (!file) {
    throw new ValidationError('Expected a multipart upload with a "file" field.');
  }

  if (!file.mimetype || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new ValidationError(
      `Unsupported content type "${file.mimetype}". Accepted: PDF, DOCX.`,
    );
  }

  const buffer = await file.toBuffer();
  if (file.file.truncated) {
    throw new ValidationError(
      `Uploaded file exceeds the ${config.MAX_UPLOAD_BYTES}-byte limit.`,
    );
  }

  const text = await extractText(buffer, file.mimetype);
  if (text.trim().length === 0) {
    throw new ValidationError(
      'No text could be extracted from this document. Scanned PDFs and image-only DOCX files are not supported.',
    );
  }

  const sourceField = file.fields.source;
  const source =
    sourceField && 'value' in sourceField && typeof sourceField.value === 'string'
      ? sourceField.value
      : file.filename;

  const { document } = await ingestion.ingest({ text, source });
  return reply.status(201).send({ document });
}
