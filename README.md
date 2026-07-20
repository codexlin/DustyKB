# DustyKB

可上线中文知识库 MVP：`Next.js` 前端 + `FastAPI` 后端 + `Qdrant` 向量库 + 通义（DashScope）Embedding / Qwen。

## 目录

```
dustykb/
  docker-compose.yml     # PostgreSQL + Qdrant
  .env.example
  apps/
    api/                 # FastAPI
    web/                 # Next.js 前端
```

## 1. 启动 Qdrant

```bash
cd DustyKB
docker compose up -d
```

`docker-compose.yml` 会同时启动：

- PostgreSQL：保存知识库、文档元数据和问答日志
- Qdrant：保存文档 chunk 和向量

上传的原始文件仍保存在 `apps/api/data/uploads/`。如果目录里已经有旧版
`knowledge_bases.json` / `documents.json`，后端启动时会自动迁移到 PostgreSQL。

## 2. 配置后端

```bash
cd apps/api
cp ../../.env.example .env
# 编辑 .env，填入 OPENAI_API_KEY（DashScope API Key）
uv sync --python /opt/homebrew/bin/python3.12
PYTHONPATH=. uv run --python /opt/homebrew/bin/python3.12 uvicorn app.main:app --reload --port 8000
```

## 3. 启动前端

```bash
cd apps/web
cp .env.local.example .env.local
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET/POST | `/api/kb` | 知识库列表 / 创建 |
| GET | `/api/kb/{id}/docs` | 文档列表 |
| GET | `/api/kb/{id}/query-logs` | 问答日志 |
| POST | `/api/docs/upload` | 上传入库（form: `kb_id`, `file`） |
| DELETE | `/api/docs/{id}` | 删除文档 |
| POST | `/api/query` | 问答（JSON: `kb_id`, `question`） |

支持文件：`.txt` / `.md` / `.pdf` / `.csv`

## 模型说明

默认走 DashScope OpenAI 兼容接口：

- Embedding: `text-embedding-v3`（1024 维）
- Rerank: `qwen3-rerank`（先召回 `RETRIEVE_TOP_K=20`，再重排到 `RERANK_TOP_K=6`）
- Chat: `qwen-plus`

Key 放在 `apps/api/.env` 的 `DASHSCOPE_API_KEY`。

## 测试

```bash
cd apps/api
uv sync --python /opt/homebrew/bin/python3.12 --group dev
PYTHONPATH=. uv run --python /opt/homebrew/bin/python3.12 pytest
```
