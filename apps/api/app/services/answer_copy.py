"""Friendly Chinese copy for empty / weak RAG answers."""

from __future__ import annotations


def no_source_answer(
    *,
    kb_name: str,
    doc_count: int,
    ready_count: int,
    processing_count: int,
) -> str:
    name = (kb_name or "当前文库").strip() or "当前文库"

    if doc_count <= 0:
        return (
            f"「{name}」里还没有资料。"
            "先去文库收录几份文档，整理好后再来提问，我会按原文回答你。"
        )

    if ready_count <= 0 and processing_count > 0:
        return (
            f"「{name}」里的资料还在整理中，稍等完成后再问会更准。"
            "也可以换一个已经就绪的文库试试。"
        )

    if ready_count <= 0:
        return (
            f"「{name}」里暂时没有可检索的资料。"
            "去文库页看一眼文档状态，必要时重新整理后再提问。"
        )

    return (
        f"在「{name}」里没有找到和这个问题对得上的段落。"
        "可以换个说法再问，或到文库确认资料是否覆盖这个主题。"
    )


def weak_match_answer(*, kb_name: str) -> str:
    name = (kb_name or "当前文库").strip() or "当前文库"
    return (
        f"翻过「{name}」里的资料，但相关度不够高，不敢瞎猜。"
        "你可以问得更具体一点，或补充相关文档后再试。"
    )
