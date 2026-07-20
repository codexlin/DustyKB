from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "DustyKB API"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000"
    # Shared site access token. Empty = open (local dev). Set in production.
    access_token: str = ""

    data_dir: str = "./data"
    database_url: str = "postgresql://kb_user:kb_password@localhost:5432/kb_system"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "kb_chunks"
    embedding_dim: int = 1024

    # DashScope OpenAI-compatible endpoint (中文 Embedding + Qwen)
    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    openai_api_key: str = ""
    openai_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    embedding_model: str = "text-embedding-v3"
    # DashScope text-embedding-v3 rejects batches larger than 10
    embedding_batch_size: int = 10
    chat_model: str = "qwen-plus"
    rerank_enabled: bool = True
    rerank_base_url: str = "https://dashscope.aliyuncs.com/compatible-api/v1"
    rerank_model: str = "qwen3-rerank"

    chunk_size: int = 500
    chunk_overlap: int = 80
    retrieve_top_k: int = 20
    rerank_top_k: int = 6

    # Hybrid retrieval: Qdrant dense + local BM25 + RRF, then existing DashScope rerank
    hybrid_enabled: bool = True
    bm25_top_k: int = 20
    rrf_k: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def llm_api_key(self) -> str:
        return self.openai_api_key or self.dashscope_api_key

    @property
    def llm_base_url(self) -> str:
        return self.openai_base_url or self.dashscope_base_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
