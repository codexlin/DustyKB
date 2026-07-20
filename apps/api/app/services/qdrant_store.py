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
        chunks: list[tuple[int, str]],
        vectors: list[list[float]],
    ) -> int:
        if len(chunks) != len(vectors):
            raise ValueError("chunks and vectors length mismatch")

        started = time.perf_counter()
        points: list[qm.PointStruct] = []
        for (chunk_index, text), vector in zip(chunks, vectors):
            points.append(
                qm.PointStruct(
                    id=str(uuid4()),
                    vector=vector,
                    payload={
                        "kb_id": kb_id,
                        "doc_id": doc_id,
                        "filename": filename,
                        "chunk_index": chunk_index,
                        "text": text,
                    },
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

    def list_chunks_by_doc(self, doc_id: str) -> list[dict[str, Any]]:
        response = self.client.scroll(
            collection_name=self.collection,
            scroll_filter=qm.Filter(
                must=[qm.FieldCondition(key="doc_id", match=qm.MatchValue(value=doc_id))]
            ),
            limit=1000,
            with_payload=True,
            with_vectors=False,
        )
        points, _ = response
        chunks: list[dict[str, Any]] = []
        for point in points:
            payload = point.payload or {}
            chunks.append(
                {
                    "doc_id": payload.get("doc_id", doc_id),
                    "filename": payload.get("filename", ""),
                    "chunk_index": int(payload.get("chunk_index", 0)),
                    "text": payload.get("text", ""),
                }
            )
        chunks.sort(key=lambda item: item["chunk_index"])
        logger.info("qdrant.list_chunks collection=%s doc_id=%s chunks=%s", self.collection, doc_id, len(chunks))
        return chunks

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
