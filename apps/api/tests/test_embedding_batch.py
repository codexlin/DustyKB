from __future__ import annotations

from types import SimpleNamespace

from app.config import Settings
from app.services.llm import EmbeddingClient


class _FakeEmbeddingsAPI:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def create(self, *, model: str, input: list[str], dimensions: int):
        self.calls.append(list(input))
        data = [
            SimpleNamespace(index=index, embedding=[float(index), float(len(text))])
            for index, text in enumerate(input)
        ]
        return SimpleNamespace(data=data)


def test_embed_texts_batches_by_configured_size(monkeypatch):
    settings = Settings(embedding_batch_size=10, dashscope_api_key="test-key")
    client = EmbeddingClient(settings)
    fake = _FakeEmbeddingsAPI()
    monkeypatch.setattr(client.client, "embeddings", fake)

    texts = [f"chunk-{i}" for i in range(23)]
    vectors = client.embed_texts(texts)

    assert len(vectors) == 23
    assert [len(call) for call in fake.calls] == [10, 10, 3]
