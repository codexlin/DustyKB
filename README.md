# DustyKB

可上线中文知识库 MVP：`Next.js` 前端 + `FastAPI` 后端 + `Qdrant` 向量库 + 通义（DashScope）Embedding / Qwen。

## 目录

```
kb-system/
  docker-compose.yml           # 本地：PostgreSQL + Qdrant + API + Web
  docker-compose.dokploy.yml   # Dokploy：仅 API + Postgres + Qdrant（Traefik）
  .env.example
  apps/
    api/                       # FastAPI
    web/                       # Next.js 前端（建议部署到 Vercel）
```

## Production layout（推荐）

| 组件 | 部署位置 | 地址示例 |
|------|----------|----------|
| Web（Next.js） | Vercel | `https://xxx.vercel.app` |
| API + Postgres + Qdrant | Dokploy / 腾讯云 | `https://api.verogeo.com` |

Dokploy Compose 使用仓库根目录的 `docker-compose.dokploy.yml`，并配置 GitHub 自动部署。  
Vercel 环境变量设置：`NEXT_PUBLIC_API_URL=https://api.verogeo.com`。  
API 环境变量设置：`CORS_ORIGINS` 为前端域名，`DASHSCOPE_API_KEY` 必填。

## Deploy with Docker

一键启动全部服务（PostgreSQL、Qdrant、API、Web）：

```bash
cd kb-system
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 或 DASHSCOPE_API_KEY（DashScope API Key，必填）
docker compose up --build -d
```

访问：

- Web UI: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000/health](http://localhost:8000/health)

### 数据持久化

| 数据 | 存储位置 |
|------|----------|
| 上传文件 | Docker 卷 `api_data` → 容器内 `/app/data/uploads/{kb_id}/` |
| PostgreSQL 元数据 | Docker 卷 `postgres_data` |
| Qdrant 向量 | Docker 卷 `qdrant_data` |

若希望在本机目录直接查看上传文件，可复制 override 示例：

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
docker compose up -d
```

这会把 `./data` 绑定到容器 `/app/data`（覆盖默认的 `api_data` 卷）。

### 环境变量说明

- `OPENAI_API_KEY` 或 `DASHSCOPE_API_KEY`：**必填**，用于 Embedding / Chat / Rerank
- `docker-compose.yml` 会自动覆盖 `DATABASE_URL`、`QDRANT_URL`、`DATA_DIR` 为容器内地址
- `NEXT_PUBLIC_API_URL` 在构建 Web 镜像时设为 `http://localhost:8000`（浏览器访问 API 的地址）

查看日志 / 停止：

```bash
docker compose logs -f api
docker compose down          # 保留数据卷
docker compose down -v       # 删除所有数据卷（慎用）
```

## 本地开发

### 1. 启动 PostgreSQL + Qdrant

```bash
cd kb-system
docker compose up -d postgres qdrant
```

`docker-compose.yml` 会同时启动：

- PostgreSQL：保存知识库、文档元数据和问答日志
- Qdrant：保存文档 chunk 和向量

上传的原始文件仍保存在 `apps/api/data/uploads/`。如果目录里已经有旧版
`knowledge_bases.json` / `documents.json`，后端启动时会自动迁移到 PostgreSQL。

### 2. 配置后端

```bash
cd apps/api
cp ../../.env.example .env
# 编辑 .env，填入 OPENAI_API_KEY（DashScope API Key）
uv sync --python /opt/homebrew/bin/python3.12
PYTHONPATH=. uv run --python /opt/homebrew/bin/python3.12 uvicorn app.main:app --reload --port 8000
```

### 3. 启动前端

```bash
cd apps/web
cp .env.local.example .env.local
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## API

生产环境建议设置 `ACCESS_TOKEN`：API 需 `Authorization: Bearer <token>`，前端会显示解锁页。未设置时保持开放（适合本地开发）。新建知识库会写入 `owner_id`（由令牌派生），列表按归属过滤；旧数据 `owner_id` 为空时仍对已解锁用户可见。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/auth/status` | 是否要求访问令牌 |
| GET/POST | `/api/kb` | 知识库列表 / 创建 |
| GET | `/api/kb/{id}/docs` | 文档列表 |
| GET | `/api/kb/{id}/query-logs` | 问答日志 |
| POST | `/api/docs/upload` | 上传入库（form: `kb_id`, `file`） |
| DELETE | `/api/docs/{id}` | 删除文档 |
| POST | `/api/query` | 问答（JSON: `kb_id`, `question`） |

支持文件：`.txt` / `.md` / `.pdf` / `.csv` / `.tsv` / `.xlsx`

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
