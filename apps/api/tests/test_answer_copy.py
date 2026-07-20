from app.services.answer_copy import no_source_answer, weak_match_answer


def test_no_source_empty_library():
    text = no_source_answer(
        kb_name="产品手册",
        doc_count=0,
        ready_count=0,
        processing_count=0,
    )
    assert "还没有资料" in text
    assert "产品手册" in text


def test_no_source_processing_only():
    text = no_source_answer(
        kb_name="产品手册",
        doc_count=2,
        ready_count=0,
        processing_count=2,
    )
    assert "整理中" in text


def test_no_source_ready_but_no_hits():
    text = no_source_answer(
        kb_name="产品手册",
        doc_count=3,
        ready_count=3,
        processing_count=0,
    )
    assert "没有找到" in text
    assert "换个说法" in text


def test_weak_match_answer():
    text = weak_match_answer(kb_name="产品手册")
    assert "相关度不够高" in text
    assert "产品手册" in text
