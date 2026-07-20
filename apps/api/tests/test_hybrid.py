from __future__ import annotations

from app.services.hybrid import (
    Bm25IndexCache,
    chunk_key,
    fuse_dense_and_bm25,
    reciprocal_rank_fusion,
    tokenize,
)


def test_tokenize_keeps_english_and_chinese_units():
    tokens = tokenize("DustyKB 知识库 hybrid retrieval")
    assert "dustykb" in tokens
    assert "hybrid" in tokens
    assert "知" in tokens
    assert "知识" in tokens


def test_reciprocal_rank_fusion_prefers_overlap():
    fused = reciprocal_rank_fusion(
        [
            ["a", "b", "c"],
            ["c", "a", "d"],
        ],
        k=60,
    )
    keys = [key for key, _ in fused]
    assert keys[0] == "a"
    assert "c" in keys[:2]


def test_fuse_dense_and_bm25_merges_scores():
    dense = [
        {
            "doc_id": "d1",
            "chunk_index": 0,
            "filename": "a.md",
            "text": "alpha",
            "score": 0.9,
        },
        {
            "doc_id": "d2",
            "chunk_index": 1,
            "filename": "b.md",
            "text": "beta",
            "score": 0.8,
        },
    ]
    bm25 = [
        {
            "doc_id": "d2",
            "chunk_index": 1,
            "filename": "b.md",
            "text": "beta",
            "score": 4.2,
        },
        {
            "doc_id": "d3",
            "chunk_index": 0,
            "filename": "c.md",
            "text": "gamma",
            "score": 3.1,
        },
    ]
    fused = fuse_dense_and_bm25(dense_hits=dense, bm25_hits=bm25, rrf_k=60, limit=10)
    assert fused
    by_key = {chunk_key(item["doc_id"], item["chunk_index"]): item for item in fused}
    assert by_key["d2:1"]["dense_score"] == 0.8
    assert by_key["d2:1"]["bm25_score"] == 4.2
    assert by_key["d2:1"]["rrf_score"] is not None
    assert "d3:0" in by_key


def test_bm25_index_cache_search_and_invalidate():
    cache = Bm25IndexCache()
    calls = {"n": 0}

    def load():
        calls["n"] += 1
        return [
            {"doc_id": "d1", "chunk_index": 0, "filename": "a.md", "text": "退货政策七天无理由"},
            {"doc_id": "d1", "chunk_index": 1, "filename": "a.md", "text": "运费说明包邮条件"},
        ]

    index = cache.get_or_build("kb1", load)
    assert calls["n"] == 1
    hits = index.search("七天无理由退货", top_k=2)
    assert hits
    assert hits[0]["chunk_index"] == 0

    # Second build should hit cache.
    cache.get_or_build("kb1", load)
    assert calls["n"] == 1

    cache.invalidate("kb1")
    cache.get_or_build("kb1", load)
    assert calls["n"] == 2
