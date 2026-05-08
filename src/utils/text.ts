/**
 * Text normalization helpers used by the ingestion pipeline.
 * Kept deliberately simple - heavy preprocessing (HTML, PDF, OCR) belongs
 * in dedicated loaders, not here.
 */

const NBSP_RE = /\u00A0/g;

export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(NBSP_RE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function preview(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}
