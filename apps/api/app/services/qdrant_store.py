from __future__ import annotations

import logging
import time
from typing import Any
from uuid import uuid4

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.config import Settings

logger = logging.getLogger(__name__)


class QdrantStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = QdrantClient(url=settings.qdrant_url)
        self.collection = settings.qdrant_collection
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        names = {item.name for item in self.client.get_collections().collections}
        if self.collection in names:
            logger.info("qdrant.collection.ready collection=%s", self.collection)
            return
        self.client.create_collection(
            collection_name=self.collection,
            vectors_config=qm.VectorParams(
                size=self.settings.embedding_dim,
                distance=qm.Distance.COSINE,
            ),
        )
        logger.info(
            "qdrant.collection.create collection=%s dim=%s distance=cosine",
            self.collection,
            self.settings.embedding_dim,
        )

    def upsert_chunks(
        self,
        *,
        kb_id: str,
        doc_id: str,
        filename: str,
        chunks: list[dict[str, Any]],
        vectors: list[list[float]],
    ) -> int:
        if len(chunks) != len(vectors):
            raise ValueError("chunks and vectors length mismatch")

        started = time.perf_counter()
        points: list[qm.PointStruct] = []
        for chunk, vector in zip(chunks, vectors):
            payload: dict[str, Any] = {
                "kb_id": kb_id,
                "doc_id": doc_id,
                "filename": filename,
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
                "content_type": chunk.get("content_type", "text"),
                "parser": chunk.get("parser", ""),
                "metadata": chunk.get("metadata", {}),
            }
            if chunk.get("page") is not None:
                payload["page"] = chunk["page"]
            if chunk.get("section"):
                payload["section"] = chunk["section"]
            points.append(
                qm.PointStruct(
                    id=str(uuid4()),
                    vector=vector,
                    payload=payload,
                )
            )
        if points:
            self.client.upsert(collection_name=self.collection, points=points)
        logger.info(
            "qdrant.upsert collection=%s kb_id=%s doc_id=%s points=%s duration_ms=%.1f",
            self.collection,
            kb_id,
            doc_id,
            len(points),
            (time.perf_counter() - started) * 1000,
        )
        return len(points)

    def delete_by_doc(self, doc_id: str) -> None:
        self.client.delete(
            collection_name=self.collection,
            points_selector=qm.FilterSelector(
                filter=qm.Filter(
                    must=[qm.FieldCondition(key="doc_id", match=qm.MatchValue(value=doc_id))]
                )
            ),
        )
        logger.info("qdrant.delete_by_doc collection=%s doc_id=%s", self.collection, doc_id)

    def delete_by_kb(self, kb_id: str) -> None:
        self.client.delete(
            collection_name=self.collection,
            points_selector=qm.FilterSelector(
                filter=qm.Filter(
                    must=[qm.FieldCondition(key="kb_id", match=qm.MatchValue(value=kb_id))]
                )
            ),
        )
        logger.info("qdrant.delete_by_kb collection=%s kb_id=%s", self.collection, kb_id)

    def _payload_to_chunk(self, payload: dict[str, Any], *, default_doc_id: str = "") -> dict[str, Any]:
        return {
            "doc_id": payload.get("doc_id", default_doc_id),
            "filename": payload.get("filename", ""),
            "chunk_index": int(payload.get("chunk_index", 0)),
            "text": payload.get("text", ""),
            "content_type": payload.get("content_type", "text"),
            "parser": payload.get("parser", ""),
            "page": payload.get("page"),
            "section": payload.get("section"),
            "metadata": payload.get("metadata", {}),
        }

    def _scroll_chunks(self, *, scroll_filter: qm.Filter, label: str) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        next_offset = None
        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.collection,
                scroll_filter=scroll_filter,
                limit=256,
                offset=next_offset,
                with_payload=True,
                with_vectors=False,
            )
            for point in points:
                payload = point.payload or {}
                chunks.append(self._payload_to_chunk(payload))
            if next_offset is None:
                break
        chunks.sort(key=lambda item: (item["doc_id"], item["chunk_index"]))
        logger.info("qdrant.list_chunks collection=%s %s chunks=%s", self.collection, label, len(chunks))
        return chunks

    def list_chunks_by_doc(self, doc_id: str) -> list[dict[str, Any]]:
        return self._scroll_chunks(
            scroll_filter=qm.Filter(
                must=[qm.FieldCondition(key="doc_id", match=qm.MatchValue(value=doc_id))]
            ),
            label=f"doc_id={doc_id}",
        )

    def list_chunks_by_kb(self, kb_id: str) -> list[dict[str, Any]]:
        return self._scroll_chunks(
            scroll_filter=qm.Filter(
                must=[qm.FieldCondition(key="kb_id", match=qm.MatchValue(value=kb_id))]
            ),
            label=f"kb_id={kb_id}",
        )

    def search(
        self,
        *,
        kb_id: str,
        query_vector: list[float],
        top_k: int,
    ) -> list[dict[str, Any]]:
        started = time.perf_counter()
        response = self.client.query_points(
            collection_name=self.collection,
            query=query_vector,
            limit=top_k,
            query_filter=qm.Filter(
                must=[qm.FieldCondition(key="kb_id", match=qm.MatchValue(value=kb_id))]
            ),
            with_payload=True,
        )
        results: list[dict[str, Any]] = []
        for hit in response.points:
            payload = hit.payload or {}
            results.append(
                {
                    "score": float(hit.score),
                    "doc_id": payload.get("doc_id", ""),
                    "filename": payload.get("filename", ""),
                    "chunk_index": int(payload.get("chunk_index", 0)),
                    "text": payload.get("text", ""),
                    "content_type": payload.get("content_type", "text"),
                    "parser": payload.get("parser", ""),
                    "page": payload.get("page"),
                    "section": payload.get("section"),
                    "metadata": payload.get("metadata", {}),
                }
            )
        scores = [round(item["score"], 4) for item in results[:3]]
        logger.info(
            "qdrant.search collection=%s kb_id=%s top_k=%s hits=%s top_scores=%s duration_ms=%.1f",
            self.collection,
            kb_id,
            top_k,
            len(results),
            scores,
            (time.perf_counter() - started) * 1000,
        )
        return results
