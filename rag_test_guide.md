# DustyKB RAG 测试指南

DustyKB 是一个面向中文知识库场景的 RAG 系统。它使用 FastAPI 提供后端接口，Next.js 提供前端页面，Qdrant 存储向量，PostgreSQL 存储知识库元数据与问答日志。

## 核心流程

1. 用户上传 Markdown、TXT 或 PDF 文档。
2. 后端抽取文档文本，并切分为较小的 chunk。
3. 系统调用 embedding 模型生成向量。
4. 向量和 chunk 元信息写入 Qdrant。
5. 用户提问时，系统先检索候选 chunk，再使用 rerank 模型重排。
6. 最终将高相关上下文交给大语言模型生成答案。

## 为什么要使用 Rerank

向量检索擅长召回语义相近的内容，但排序不一定总是精确。Rerank 会重新比较用户问题和候选片段，让真正相关的内容排在前面。对于中文知识库，Rerank 通常能明显改善引用来源的准确性。

## 示例代码

下面是一个非常简化的 chunk 过滤函数：

```python
def filter_chunks(chunks: list[str], keyword: str) -> list[str]:
    return [chunk for chunk in chunks if keyword in chunk]
```

如果用户问“Rerank 有什么作用”，系统应该优先引用“为什么要使用 Rerank”这一节。

## 测试问题建议

- DustyKB 的核心流程是什么？
- 为什么向量检索后还需要 Rerank？
- 请用代码块展示文档里的 Python 示例。
