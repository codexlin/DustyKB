import uuid

import psycopg
import pytest

from app.config import get_settings
from app.schemas import DocumentRecord
from app.services.chunk_store import ChunkStore
from app.services.store import MetadataStore


def postgres_available(database_url: str) -> bool:
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True
    except psycopg.Error:
        return False


def test_chunk_store_table_created():
    settings = get_settings()
    if not postgres_available(settings.database_url):
        pytest.skip("PostgreSQL is not available")

    ChunkStore(settings)
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'document_chunks'
                ORDER BY ordinal_position
                """
            )
            columns = {row[0] for row in cur.fetchall()}
    assert "id" in columns
    assert "doc_id" in columns
    assert "kb_id" in columns
    assert "chunk_index" in columns
    assert "text" in columns
    assert "metadata" in columns


def test_chunk_store_save_list_and_delete():
    settings = get_settings()
    if not postgres_available(settings.database_url):
        pytest.skip("PostgreSQL is not available")

    meta = MetadataStore(settings)
    chunks = ChunkStore(settings)
    marker = str(uuid.uuid4())
    kb = meta.create_kb(f"chunk-test-{marker}", "chunk store")
    doc = DocumentRecord(
        id=str(uuid.uuid4()),
        kb_id=kb.id,
        filename=f"{marker}.txt",
        content_type="text/plain",
        size=100,
        chunk_count=2,
    )
    meta.add_doc(doc)

    sample_chunks = [
        {
            "chunk_index": 0,
            "text": "first chunk about retrieval",
            "content_type": "text",
            "parser": "plain",
            "page": 1,
            "section": "intro",
            "metadata": {"block_index": 0},
        },
        {
            "chunk_index": 1,
            "text": "second chunk about postgres storage",
            "content_type": "text",
            "parser": "plain",
            "page": 2,
            "section": "body",
            "metadata": {"block_index": 1},
        },
    ]

    try:
        saved = chunks.save_chunks_for_doc(doc_id=doc.id, kb_id=doc.kb_id, chunks=sample_chunks)
        assert saved == 2

        by_doc = chunks.list_by_doc(doc.id)
        assert len(by_doc) == 2
        assert by_doc[0]["chunk_index"] == 0
        assert by_doc[0]["filename"] == doc.filename
        assert by_doc[0]["text"] == "first chunk about retrieval"
        assert by_doc[0]["metadata"] == {"block_index": 0}
        assert by_doc[1]["section"] == "body"

        by_kb = chunks.list_by_kb(doc.kb_id)
        assert len(by_kb) == 2
        assert [item["chunk_index"] for item in by_kb] == [0, 1]

        replaced = chunks.save_chunks_for_doc(
            doc_id=doc.id,
            kb_id=doc.kb_id,
            chunks=[sample_chunks[1]],
        )
        assert replaced == 1
        assert len(chunks.list_by_doc(doc.id)) == 1
        assert chunks.list_by_doc(doc.id)[0]["chunk_index"] == 1

        deleted = chunks.delete_by_doc(doc.id)
        assert deleted == 1
        assert chunks.list_by_doc(doc.id) == []
        assert chunks.list_by_kb(doc.kb_id) == []

        chunks.save_chunks_for_doc(doc_id=doc.id, kb_id=doc.kb_id, chunks=sample_chunks)
        kb_deleted = chunks.delete_by_kb(doc.kb_id)
        assert kb_deleted == 2
        assert chunks.list_by_kb(doc.kb_id) == []
    finally:
        with psycopg.connect(settings.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM knowledge_bases WHERE id = %s", (kb.id,))
            conn.commit()


def test_chunk_store_cascades_on_document_delete():
    settings = get_settings()
    if not postgres_available(settings.database_url):
        pytest.skip("PostgreSQL is not available")

    meta = MetadataStore(settings)
    chunks = ChunkStore(settings)
    marker = str(uuid.uuid4())
    kb = meta.create_kb(f"chunk-cascade-{marker}", "cascade test")
    doc = DocumentRecord(
        id=str(uuid.uuid4()),
        kb_id=kb.id,
        filename=f"{marker}.txt",
        content_type="text/plain",
        size=10,
    )
    meta.add_doc(doc)
    chunks.save_chunks_for_doc(
        doc_id=doc.id,
        kb_id=doc.kb_id,
        chunks=[{"chunk_index": 0, "text": "cascade me", "metadata": {}}],
    )

    try:
        assert len(chunks.list_by_doc(doc.id)) == 1
        meta.delete_doc(doc.id)
        assert chunks.list_by_doc(doc.id) == []
    finally:
        with psycopg.connect(settings.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM knowledge_bases WHERE id = %s", (kb.id,))
            conn.commit()
