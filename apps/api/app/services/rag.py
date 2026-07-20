from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any
from typing import Optional
import uuid

from app.config import Settings
from app.schemas import DocumentRecord, QueryResponse, SourceCitation
from app.services.chunking import chunk_text
from app.services.documents import ParsedBlock, SUPPORTED_EXTENSIONS, parse_document
from app.services.hybrid import Bm25IndexCache, fuse_dense_and_bm25
from app.services.llm import ChatClient, EmbeddingClient, RerankClient
from app.services.chunk_store import ChunkStore
from app.services.qdrant_store import QdrantStore
from app.services.store import MetadataStore

logger = logging.getLogger(__name__)

_bm25_cache = Bm25IndexCache()


class RagService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.meta = MetadataStore(settings)
        self.chunks = ChunkStore(settings)
        self.vectors = QdrantStore(settings)
        self.embeddings = EmbeddingClient(settings)
        self.chat = ChatClient(settings)
        self.reranker = RerankClient(settings) if settings.rerank_enabled else None
        self.bm25_cache = _bm25_cache

    def create_upload_record(
        self,
        *,
        kb_id: str,
        filename: str,
        content_type: str,
        content: bytes,
    ) -> DocumentRecord:
        if self.meta.get_kb(kb_id) is None:
            raise ValueError("Knowledge base not found")
        if not content:
            raise ValueError("Empty file")

        safe_name = filename or "untitled.txt"
        suffix = Path(safe_name).suffix.lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type: {suffix or '(none)'}. Use .txt/.md/.pdf/.csv/.tsv/.xlsx"
            )

        self.meta.save_upload(kb_id, safe_name, content)
        doc = DocumentRecord(
            id=str(uuid.uuid4()),
            kb_id=kb_id,
            filename=safe_name,
            content_type=content_type or "application/octet-stream",
            size=len(content),
            chunk_count=0,
            status="processing",
            progress_stage="queued",
            progress_current=0,
            progress_total=0,
        )
        self.meta.add_doc(doc)
        logger.info(
            "rag.upload.queued kb_id=%s doc_id=%s filename=%s bytes=%s",
            kb_id,
            doc.id,
            safe_name,
            len(content),
        )
        return doc

    def begin_reindex(self, doc_id: str) -> DocumentRecord:
        doc = self.meta.get_doc(doc_id)
        if doc is None:
            raise ValueError("Document not found")
        path = self.meta.upload_path(doc)
        if not path.exists():
            self.meta.update_doc_status(
                doc_id,
                status="failed",
                error_message="Original file not found",
                progress_stage="failed",
            )
            raise ValueError("Original file not found")
        saved = self.meta.update_doc_status(
            doc.id,
            status="processing",
            error_message="",
            progress_stage="queued",
            progress_current=0,
            progress_total=0,
        )
        if saved is None:
            raise RuntimeError("Document metadata disappeared during reindex")
        logger.info("rag.reindex.queued doc_id=%s kb_id=%s filename=%s", doc.id, doc.kb_id, doc.filename)
        return saved

    def index_document(self, doc_id: str) -> DocumentRecord:
        started = time.perf_counter()
        doc = self.meta.get_doc(doc_id)
        if doc is None:
            raise ValueError("Document not found")

        path = self.meta.upload_path(doc)
        if not path.exists():
            failed = self.meta.update_doc_status(
                doc_id,
                status="failed",
                error_message="Original file not found",
                progress_stage="failed",
            )
            if failed is None:
                raise ValueError("Document not found")
            return failed

        try:
            self.meta.update_doc_status(
                doc.id,
                status="processing",
                error_message="",
                progress_stage="parsing",
                progress_current=0,
                progress_total=0,
            )
            content = path.read_bytes()
            parsed = parse_document(doc.filename, content)
            logger.info(
                "rag.index.extract doc_id=%s blocks=%s chars=%s",
                doc.id,
                len(parsed.blocks),
                len(parsed.text),
            )
            if not parsed.text.strip():
                raise ValueError("No extractable text in file")

            self.meta.update_doc_status(doc.id, status="processing", progress_stage="chunking")
            chunks = self._chunks_from_blocks(parsed.blocks)
            logger.info("rag.index.chunk doc_id=%s chunks=%s", doc.id, len(chunks))
            if not chunks:
                raise ValueError("Document produced no chunks")

            self.chunks.delete_by_doc(doc.id)
            self.vectors.delete_by_doc(doc.id)
            self._index_chunks(doc=doc, chunks=chunks)

            saved = self.meta.update_doc_status(
                doc.id,
                status="ready",
                chunk_count=len(chunks),
                error_message="",
                progress_stage="ready",
                progress_current=len(chunks),
                progress_total=len(chunks),
            )
            if saved is None:
                raise RuntimeError("Document metadata disappeared during indexing")
            logger.info(
                "rag.index.end doc_id=%s chunks=%s duration_ms=%.1f",
                doc.id,
                saved.chunk_count,
                (time.perf_counter() - started) * 1000,
            )
            return saved
        except Exception as exc:
            failed = self.meta.update_doc_status(
                doc.id,
                status="failed",
                error_message=str(exc),
                progress_stage="failed",
            )
            logger.exception("rag.index.failed doc_id=%s", doc.id)
            if failed is None:
                raise RuntimeError(f"Document indexing failed: {exc}") from exc
            return failed

    def ingest_file(
        self,
        *,
        kb_id: str,
        filename: str,
        content_type: str,
        content: bytes,
    ) -> DocumentRecord:
        """Synchronous ingest helper for scripts/tests."""
        doc = self.create_upload_record(
            kb_id=kb_id,
            filename=filename,
            content_type=content_type,
            content=content,
        )
        return self.index_document(doc.id)

    def _chunks_from_blocks(self, blocks: list[ParsedBlock]) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        next_index = 0
        for block_index, block in enumerate(blocks):
            block_chunks = chunk_text(
                block.text,
                chunk_size=self.settings.chunk_size,
                chunk_overlap=self.settings.chunk_overlap,
            )
            for block_chunk in block_chunks:
                chunks.append(
                    {
                        "chunk_index": next_index,
                        "text": block_chunk.text,
                        "content_type": block.content_type,
                        "parser": block.parser,
                        "page": block.page,
                        "section": block.section,
                        "metadata": {
                            "block_index": block_index,
                            "block_chunk_index": block_chunk.index,
                            **block.metadata,
                        },
                    }
                )
                next_index += 1
        return chunks

    def _index_chunks(self, *, doc: DocumentRecord, chunks: list[dict[str, Any]]) -> None:
        self.chunks.save_chunks_for_doc(doc_id=doc.id, kb_id=doc.kb_id, chunks=chunks)
        texts = [chunk["text"] for chunk in chunks]
        batch_size = max(1, int(self.settings.embedding_batch_size))
        total = len(texts)
        self.meta.update_doc_status(
            doc.id,
            status="processing",
            progress_stage="embedding",
            progress_current=0,
            progress_total=total,
        )

        embedding_started = time.perf_counter()
        vectors: list[list[float]] = []
        for offset in range(0, total, batch_size):
            batch = texts[offset : offset + batch_size]
            batch_vectors = self.embeddings.embed_texts(batch)
            vectors.extend(batch_vectors)
            self.meta.update_doc_status(
                doc.id,
                status="processing",
                progress_stage="embedding",
                progress_current=min(offset + len(batch), total),
                progress_total=total,
            )
        logger.info(
            "rag.index.embed doc_id=%s chunks=%s duration_ms=%.1f",
            doc.id,
            len(vectors),
            (time.perf_counter() - embedding_started) * 1000,
        )

        self.meta.update_doc_status(
            doc.id,
            status="processing",
            progress_stage="upserting",
            progress_current=total,
            progress_total=total,
        )
        self.vectors.upsert_chunks(
            kb_id=doc.kb_id,
            doc_id=doc.id,
            filename=doc.filename,
            chunks=chunks,
            vectors=vectors,
        )
        self.bm25_cache.invalidate(doc.kb_id)

    def reindex_document(self, doc_id: str) -> DocumentRecord:
        """Synchronous reindex helper for scripts/tests."""
        self.begin_reindex(doc_id)
        return self.index_document(doc_id)

    def delete_document(self, doc_id: str) -> DocumentRecord:
        logger.info("rag.delete.start doc_id=%s", doc_id)
        deleted = self.meta.delete_doc(doc_id)
        if deleted is None:
            raise ValueError("Document not found")
        self.chunks.delete_by_doc(doc_id)
        self.vectors.delete_by_doc(doc_id)
        self.bm25_cache.invalidate(deleted.kb_id)
        logger.info("rag.delete.end doc_id=%s kb_id=%s", doc_id, deleted.kb_id)
        return deleted

    def _retrieve_hits(
        self,
        *,
        kb_id: str,
        question: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        logger.info("rag.query.embed kb_id=%s question_len=%s", kb_id, len(question))
        query_vector = self.embeddings.embed_query(question)
        search_started = time.perf_counter()
        dense_hits = self.vectors.search(kb_id=kb_id, query_vector=query_vector, top_k=limit)
        logger.info(
            "rag.query.dense kb_id=%s requested_top_k=%s hits=%s duration_ms=%.1f",
            kb_id,
            limit,
            len(dense_hits),
            (time.perf_counter() - search_started) * 1000,
        )

        if not self.settings.hybrid_enabled:
            return dense_hits

        bm25_started = time.perf_counter()
        index = self.bm25_cache.get_or_build(
            kb_id,
            lambda: self.chunks.list_by_kb(kb_id),
        )
        bm25_hits = index.search(question, top_k=self.settings.bm25_top_k)
        logger.info(
            "rag.query.bm25 kb_id=%s corpus=%s hits=%s duration_ms=%.1f",
            kb_id,
            len(index.chunks),
            len(bm25_hits),
            (time.perf_counter() - bm25_started) * 1000,
        )

        if not dense_hits and not bm25_hits:
            return []
        if not bm25_hits:
            return dense_hits
        if not dense_hits:
            return bm25_hits[:limit]

        fused = fuse_dense_and_bm25(
            dense_hits=dense_hits,
            bm25_hits=bm25_hits,
            rrf_k=self.settings.rrf_k,
            limit=limit,
        )
        logger.info(
            "rag.query.rrf kb_id=%s dense=%s bm25=%s fused=%s rrf_k=%s",
            kb_id,
            len(dense_hits),
            len(bm25_hits),
            len(fused),
            self.settings.rrf_k,
        )
        return fused

    def build_context(
        self,
        *,
        kb_id: str,
        question: str,
        top_k: Optional[int] = None,
    ) -> tuple[str, list[SourceCitation]]:
        started = time.perf_counter()
        if self.meta.get_kb(kb_id) is None:
            raise ValueError("Knowledge base not found")

        limit = top_k or self.settings.retrieve_top_k
        hits = self._retrieve_hits(kb_id=kb_id, question=question, limit=limit)

        if not hits:
            logger.info("rag.query.empty kb_id=%s duration_ms=%.1f", kb_id, (time.perf_counter() - started) * 1000)
            return "", []

        if self.reranker is not None and len(hits) > 1:
            rerank_input_count = len(hits)
            rerank_started = time.perf_counter()
            try:
                ranked = self.reranker.rerank(
                    query=question,
                    documents=[hit["text"] for hit in hits],
                    top_n=self.settings.rerank_top_k,
                )
                reranked_hits = []
                for original_index, rerank_score in ranked:
                    if original_index >= len(hits):
                        continue
                    hit = dict(hits[original_index])
                    hit["vector_score"] = hit.get("rrf_score", hit.get("dense_score", hit["score"]))
                    hit["score"] = rerank_score
                    reranked_hits.append(hit)
                hits = reranked_hits or hits[: self.settings.rerank_top_k]
                logger.info(
                    "rag.query.rerank kb_id=%s input=%s output=%s duration_ms=%.1f",
                    kb_id,
                    rerank_input_count,
                    len(hits),
                    (time.perf_counter() - rerank_started) * 1000,
                )
            except Exception:
                logger.exception(
                    "rag.query.rerank_failed kb_id=%s fallback_top_k=%s",
                    kb_id,
                    self.settings.rerank_top_k,
                )
                hits = hits[: self.settings.rerank_top_k]
        else:
            hits = hits[: self.settings.rerank_top_k]

        context_blocks = []
        sources: list[SourceCitation] = []
        for i, hit in enumerate(hits, start=1):
            context_blocks.append(f"[{i}] 来源: {hit['filename']}\n{hit['text']}")
            sources.append(
                SourceCitation(
                    doc_id=hit["doc_id"],
                    filename=hit["filename"],
                    chunk_index=hit["chunk_index"],
                    score=hit["score"],
                    text=hit["text"],
                    content_type=hit.get("content_type", "text"),
                    parser=hit.get("parser", ""),
                    page=hit.get("page"),
                    section=hit.get("section"),
                    metadata=hit.get("metadata", {}),
                    dense_score=hit.get("dense_score"),
                    bm25_score=hit.get("bm25_score"),
                    rrf_score=hit.get("rrf_score"),
                    vector_score=hit.get("vector_score"),
                )
            )

        logger.info("rag.context.end kb_id=%s sources=%s duration_ms=%.1f", kb_id, len(sources), (time.perf_counter() - started) * 1000)
        return "\n\n".join(context_blocks), sources

    def query(self, *, kb_id: str, question: str, top_k: Optional[int] = None) -> QueryResponse:
        started = time.perf_counter()
        context, sources = self.build_context(kb_id=kb_id, question=question, top_k=top_k)
        if not sources:
            return QueryResponse(
                answer="知识库中暂无相关内容，请先上传文档后再提问。",
                sources=[],
                model=self.settings.chat_model,
            )

        chat_started = time.perf_counter()
        answer = self.chat.answer(question=question, context=context)
        logger.info(
            "rag.query.chat kb_id=%s model=%s answer_len=%s duration_ms=%.1f",
            kb_id,
            self.settings.chat_model,
            len(answer),
            (time.perf_counter() - chat_started) * 1000,
        )
        logger.info("rag.query.end kb_id=%s duration_ms=%.1f", kb_id, (time.perf_counter() - started) * 1000)
        return QueryResponse(answer=answer, sources=sources, model=self.settings.chat_model)
