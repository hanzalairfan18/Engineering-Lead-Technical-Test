import mammoth from 'mammoth';
// pdf-parse's package main has a debug branch that reads a test PDF off disk
// when imported as the main module. We import the inner module to skip that
// branch entirely — safer and import-time deterministic.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { ValidationError } from '../utils/errors';

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ALLOWED_MIME_TYPES: readonly string[] = [PDF_MIME, DOCX_MIME];

/**
 * Extracts plain text from an uploaded document buffer.
 *
 * Returns the raw text. The caller is responsible for normalization and
 * for treating an empty result as an error (the file may be a scan with no
 * machine-readable text, or a DOCX containing only images).
 */
export async function extractText(buffer: Buffer, mimetype: string): Promise<string> {
  if (mimetype === PDF_MIME) {
    const { text } = await pdfParse(buffer);
    return text;
  }
  if (mimetype === DOCX_MIME) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  throw new ValidationError(
    `Unsupported content type "${mimetype}". Accepted types: PDF (${PDF_MIME}) and DOCX (${DOCX_MIME}).`,
  );
}
