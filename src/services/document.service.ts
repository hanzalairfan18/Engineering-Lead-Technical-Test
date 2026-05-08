import type { DocumentMetadata } from '../types';
import type { VectorStore } from '../rag/vectorstore/vector-store';

/**
 * Read-only view over ingested documents. Kept separate from the ingestion
 * service so listing/lookup can be exposed via the API without dragging in
 * the embedding pipeline.
 */
export class DocumentService {
  constructor(private readonly store: VectorStore) {}

  list(): DocumentMetadata[] {
    return this.store.listDocuments();
  }

  stats() {
    return this.store.size();
  }
}
