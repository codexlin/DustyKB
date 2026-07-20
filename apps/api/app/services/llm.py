from __future__ import annotations

import logging
import time

import httpx
from openai import OpenAI

from app.config import Settings

logger = logging.getLogger(__name__)


class EmbeddingClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.llm_api_key:
            raise RuntimeError("OPENAI_API_KEY is required (DashScope / OpenAI compatible key)")
        self.settings = settings
        self.client = OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        started = time.perf_counter()
        batch_size = max(1, int(self.settings.embedding_batch_size))
        vectors: list[list[float]] = []
        for offset in range(0, len(texts), batch_size):
            batch = texts[offset : offset + batch_size]
            response = self.client.embeddings.create(
                model=self.settings.embedding_model,
                input=batch,
                dimensions=self.settings.embedding_dim,
            )
            # API may return out of order; sort by index when present
            items = sorted(response.data, key=lambda item: getattr(item, "index", 0))
            vectors.extend(list(item.embedding) for item in items)
        logger.info(
            "llm.embedding model=%s inputs=%s batches=%s dim=%s duration_ms=%.1f",
            self.settings.embedding_model,
            len(texts),
            (len(texts) + batch_size - 1) // batch_size,
            len(vectors[0]) if vectors else 0,
            (time.perf_counter() - started) * 1000,
        )
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]


class ChatClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.llm_api_key:
            raise RuntimeError("OPENAI_API_KEY is required (DashScope / OpenAI compatible key)")
        self.settings = settings
        self.client = OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )

    def _messages(self, *, question: str, context: str) -> list[dict[str, str]]:
        system = (
            "你是 DustyKB 文库助手：帮用户对着已收录的资料追问，并便于核对原文。"
            "只根据「资料」回答；资料没写到的内容要直说不知道或资料未覆盖，不要编造。"
            "语气简洁友好，用中文；必要时分点。引用资料时可用 [1]、[2] 对应来源编号。"
            "展示代码时使用 Markdown fenced code block，并标注语言。"
        )
        user = f"资料：\n{context}\n\n问题：{question}"
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

    def answer(self, *, question: str, context: str) -> str:
        started = time.perf_counter()
        response = self.client.chat.completions.create(
            model=self.settings.chat_model,
            messages=self._messages(question=question, context=context),
            temperature=0.2,
        )
        answer = (response.choices[0].message.content or "").strip()
        logger.info(
            "llm.chat model=%s question_len=%s context_len=%s answer_len=%s duration_ms=%.1f",
            self.settings.chat_model,
            len(question),
            len(context),
            len(answer),
            (time.perf_counter() - started) * 1000,
        )
        return answer

    def stream_answer(self, *, question: str, context: str):
        started = time.perf_counter()
        chunk_count = 0
        response = self.client.chat.completions.create(
            model=self.settings.chat_model,
            messages=self._messages(question=question, context=context),
            temperature=0.2,
            stream=True,
        )
        for chunk in response:
            token = chunk.choices[0].delta.content or ""
            if not token:
                continue
            chunk_count += 1
            yield token
        logger.info(
            "llm.chat_stream model=%s question_len=%s context_len=%s chunks=%s duration_ms=%.1f",
            self.settings.chat_model,
            len(question),
            len(context),
            chunk_count,
            (time.perf_counter() - started) * 1000,
        )


class RerankClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.llm_api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is required for rerank")
        self.settings = settings
        self.endpoint = f"{settings.rerank_base_url.rstrip('/')}/reranks"

    def rerank(
        self,
        *,
        query: str,
        documents: list[str],
        top_n: int,
    ) -> list[tuple[int, float]]:
        if not documents:
            return []

        started = time.perf_counter()
        response = httpx.post(
            self.endpoint,
            headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
            json={
                "model": self.settings.rerank_model,
                "query": query,
                "documents": documents,
                "top_n": min(top_n, len(documents)),
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        results = [
            (int(item["index"]), float(item["relevance_score"]))
            for item in payload.get("results", [])
        ]
        logger.info(
            "llm.rerank model=%s docs=%s returned=%s duration_ms=%.1f",
            self.settings.rerank_model,
            len(documents),
            len(results),
            (time.perf_counter() - started) * 1000,
        )
        return results
